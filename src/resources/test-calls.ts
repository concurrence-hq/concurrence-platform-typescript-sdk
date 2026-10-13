import { ConfigurationError } from '../core/errors.js'
import type { PlatformFetch } from '../core/openapi-client.js'
import type { WebSocketFactory } from '../core/reconnecting-websocket.js'
import type { ScopedRequestOptions } from '../core/request-options.js'
import { scopePlatformClient, WorkspaceScopedResource } from './base.js'

const MAX_AUTH_TOKEN_CHARS = 4096
const WEB_SOCKET_PROTOCOL_TOKEN_RE = /^[!#$%&'*+\-.^_`|~A-Za-z0-9]+$/
const DEFAULT_SAMPLE_RATE = 16_000
const WEB_SOCKET_OPEN = 1

/** Parameters used to build the browser voice test-call WebSocket URL. */
export interface TestCallUrlParams {
  serviceId: string
  /** PCM16 microphone sample rate sent by the client. Defaults to 16 kHz. */
  sampleRate?: number
  /** Optional caller phone number used to resolve simulated caller context. */
  callerId?: string
  /** Version-set name used for the session. The agent engine defaults to ``release``. */
  versionSet?: string
  /** Test-call direction and greeting behavior. Defaults to ``inbound``. */
  scenario?: 'inbound' | 'outbound' | 'silent'
  /** Required by the agent engine when ``scenario`` is ``outbound``. */
  outboundTaskEntityId?: string
  /**
   * Optional freeform prompt override for scenario testing.
   *
   * This value is transported in the URL query string and may therefore be
   * captured by infrastructure access logs.
   */
  systemPrompt?: string
  /**
   * Absolute endpoint URL override for preview or custom agent-engine ingress.
   * Its path is used verbatim; it must not contain a query or fragment because
   * the SDK appends every supported test-call query parameter.
   */
  testCallUrl?: string
}

/**
 * WebSocket constructor subprotocol tuple used for test-call authentication.
 *
 * Passing these two entries to the browser ``WebSocket`` constructor produces
 * ``Sec-WebSocket-Protocol: auth, <token>``. The agent engine parses the first
 * entry as the authentication scheme and the second as its bearer token; they
 * must remain separate constructor protocols, matching the conversation and
 * observer helpers.
 */
export type TestCallAuthProtocols = readonly ['auth', string]

/** First metadata frame emitted after the voice session is allocated. */
export interface TestCallSessionStartedEvent {
  type: 'session_started'
  call_sid: string
}

/** Voice-engine initialization progress emitted before the call is ready. */
export interface TestCallProgressEvent {
  type: 'call_progress'
  phase: 'initializing' | 'ready'
}

/** Signal that queued agent audio should be discarded after barge-in. */
export interface TestCallInterruptionEvent {
  type: 'interruption'
}

/** Output format announcement emitted when the underlying transport is ready. */
export interface TestCallReadyEvent {
  type: 'ready'
  output_sample_rate: number
}

export interface TestCallUserTranscriptEvent {
  type: 'user_transcript'
  text: string
  emotion_label?: string
  emotion_valence?: number
}

export interface TestCallAgentTranscriptEvent {
  type: 'agent_transcript'
  text: string
}

export interface TestCallToolCallStartedEvent {
  type: 'tool_call_started'
  call_id: string
  tool_name: string
  input_params: Record<string, unknown>
}

export interface TestCallToolCallCompletedEvent {
  type: 'tool_call_completed'
  call_id: string
  tool_name: string
  duration_ms: number
  delivery: string
}

/** Latency metadata. Metric fields may expand independently of SDK releases. */
export interface TestCallLatencyEvent {
  type: 'latency'
  [metric: string]: unknown
}

/** Emotion metadata. Metric fields may expand independently of SDK releases. */
export interface TestCallEmotionEvent {
  type: 'emotion'
  [metric: string]: unknown
}

/** Typed JSON metadata frames emitted by the test-call WebSocket. */
export type TestCallEvent =
  | TestCallSessionStartedEvent
  | TestCallProgressEvent
  | TestCallInterruptionEvent
  | TestCallReadyEvent
  | TestCallUserTranscriptEvent
  | TestCallAgentTranscriptEvent
  | TestCallToolCallStartedEvent
  | TestCallToolCallCompletedEvent
  | TestCallLatencyEvent
  | TestCallEmotionEvent

/** Typed JSON control frames accepted by the test-call WebSocket. */
export type TestCallControlMessage =
  | { type: 'stop'; reason?: string }
  | { type: 'inject_event'; message: string; sender?: string }
  | { type: 'inject_guidance'; message: string; sender?: string }
  | { type: 'refresh_context' }

/** Portable subset of the browser close event exposed to consumers. */
export interface TestCallCloseEvent {
  readonly code: number
  readonly reason: string
  readonly wasClean: boolean
}

export interface TestCallConnectOptions extends TestCallUrlParams {
  /** Bearer token sent as ``Sec-WebSocket-Protocol: auth, <token>``. */
  token: string
  /** Receives PCM16 agent audio frames. */
  onAudio: (audio: ArrayBuffer) => void
  /** Receives recognized JSON metadata frames. Unknown frames are ignored. */
  onEvent?: (event: TestCallEvent) => void
  onOpen?: () => void
  onClose?: (event: TestCallCloseEvent) => void
  onError?: (event: Event) => void
  signal?: AbortSignal
  /** Custom WebSocket factory, primarily for runtimes without a global or for tests. */
  webSocketFactory?: WebSocketFactory
}

/** Handle for one non-reconnecting browser voice test call. */
export interface TestCallHandle {
  /** Resolves after the socket closes. */
  readonly done: Promise<void>
  /** Current native WebSocket ready state. */
  readonly readyState: number
  /** Send one PCM16 microphone audio frame. */
  sendAudio(audio: ArrayBuffer | ArrayBufferView): void
  /** Send a typed test-call control frame. */
  sendControl(message: TestCallControlMessage): void
  /** Inject an external event into the live voice session. */
  injectEvent(message: string, sender?: string): void
  /** Inject operator guidance into the live voice session. */
  injectGuidance(message: string, sender?: string): void
  /** Force the live session to refresh ambient context. */
  refreshContext(): void
  /** Send the protocol stop frame and close normally. */
  stop(reason?: string): void
  /** Close without sending a stop frame. */
  close(code?: number, reason?: string): void
}

/** Browser voice test calls over ``WS /agent/test-call``. */
export class TestCallsResource extends WorkspaceScopedResource {
  private readonly agentBaseUrl: string | undefined

  constructor(client: PlatformFetch, workspaceId: string, agentBaseUrl?: string) {
    super(client, workspaceId)
    this.agentBaseUrl = agentBaseUrl
  }

  override withOptions(options: ScopedRequestOptions): this {
    return new TestCallsResource(
      scopePlatformClient(this.client, options),
      this.workspaceId,
      this.agentBaseUrl,
    ) as this
  }

  /** Build the voice test-call WebSocket URL without placing credentials in it. */
  url(params: TestCallUrlParams): string {
    return buildTestCallUrl({
      baseUrl: this.agentBaseUrl ?? this.platformBaseUrl,
      workspaceId: this.workspaceId,
      ...params,
    }).toString()
  }

  /**
   * Open a duplex PCM16 voice test call.
   *
   * The SDK owns URL construction, authentication, and metadata parsing. The
   * consumer remains responsible for microphone capture and audio playback.
   * Test calls are intentionally not reconnected because a dropped media
   * socket terminates its allocated voice session.
   */
  connect(options: TestCallConnectOptions): TestCallHandle {
    const factory = resolveWebSocketFactory(options.webSocketFactory)
    const socket = factory(this.url(options), [...testCallAuthProtocols(options.token)])
    socket.binaryType = 'arraybuffer'

    let resolveDone!: () => void
    let settled = false
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve
    })

    const settle = (): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', abort)
      resolveDone()
    }
    const abort = (): void => socket.close(1000, 'Aborted')

    socket.addEventListener('open', () => options.onOpen?.())
    socket.addEventListener('message', (event) => {
      if (event.data instanceof ArrayBuffer) {
        options.onAudio(event.data)
        return
      }
      if (typeof event.data !== 'string') return
      const parsed = parseTestCallEvent(event.data)
      if (parsed) options.onEvent?.(parsed)
    })
    socket.addEventListener('error', (event) => options.onError?.(event))
    socket.addEventListener('close', (event) => {
      settle()
      options.onClose?.(event)
    })

    if (options.signal?.aborted) abort()
    else options.signal?.addEventListener('abort', abort, { once: true })

    return {
      done,
      get readyState() {
        return socket.readyState
      },
      sendAudio(audio) {
        ensureOpen(socket)
        socket.send(audio)
      },
      sendControl(message) {
        sendControl(socket, message)
      },
      injectEvent(message, sender) {
        sendControl(socket, {
          type: 'inject_event',
          message: requireMessage(message),
          ...(sender ? { sender } : {}),
        })
      },
      injectGuidance(message, sender) {
        sendControl(socket, {
          type: 'inject_guidance',
          message: requireMessage(message),
          ...(sender ? { sender } : {}),
        })
      },
      refreshContext() {
        sendControl(socket, { type: 'refresh_context' })
      },
      stop(reason) {
        if (socket.readyState === WEB_SOCKET_OPEN) {
          const message: TestCallControlMessage = reason
            ? { type: 'stop', reason }
            : { type: 'stop' }
          socket.send(JSON.stringify(message))
        }
        socket.close(1000, reason ?? 'User ended test call')
      },
      close(code, reason) {
        socket.close(code, reason)
      },
    }
  }
}

/** Build browser WebSocket subprotocols for test-call bearer authentication. */
export function testCallAuthProtocols(token: string): TestCallAuthProtocols {
  if (!token) throw new ConfigurationError('token is required')
  if (token.length > MAX_AUTH_TOKEN_CHARS) {
    throw new ConfigurationError(
      `token exceeds the ${MAX_AUTH_TOKEN_CHARS}-character WebSocket subprotocol limit`,
    )
  }
  if (!WEB_SOCKET_PROTOCOL_TOKEN_RE.test(token)) {
    throw new ConfigurationError(
      'token contains characters browsers reject in WebSocket subprotocols',
    )
  }
  return ['auth', token] as const
}

interface BuildTestCallUrlArgs extends TestCallUrlParams {
  baseUrl: string
  workspaceId: string
}

function buildTestCallUrl({
  baseUrl,
  workspaceId,
  serviceId,
  sampleRate = DEFAULT_SAMPLE_RATE,
  callerId,
  versionSet,
  scenario,
  outboundTaskEntityId,
  systemPrompt,
  testCallUrl,
}: BuildTestCallUrlArgs): URL {
  if (!workspaceId.trim()) throw new ConfigurationError('workspaceId is required')
  if (!serviceId.trim()) throw new ConfigurationError('serviceId is required')
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new ConfigurationError('sampleRate must be a positive integer')
  }
  if (scenario && !['inbound', 'outbound', 'silent'].includes(scenario)) {
    throw new ConfigurationError('scenario must be inbound, outbound, or silent')
  }
  if (scenario === 'outbound' && !outboundTaskEntityId?.trim()) {
    throw new ConfigurationError('outboundTaskEntityId is required for outbound test calls')
  }

  const url = testCallUrl ? parseTestCallUrlOverride(testCallUrl) : deriveFromBase(baseUrl)
  url.searchParams.set('workspace_id', workspaceId)
  url.searchParams.set('service_id', serviceId)
  url.searchParams.set('sample_rate', String(sampleRate))
  const normalizedCallerId = callerId?.trim()
  if (normalizedCallerId) url.searchParams.set('caller_id', normalizedCallerId)
  if (versionSet) url.searchParams.set('version_set', versionSet)
  if (scenario) url.searchParams.set('scenario', scenario)
  if (outboundTaskEntityId) {
    url.searchParams.set('outbound_task_entity_id', outboundTaskEntityId)
  }
  if (systemPrompt) url.searchParams.set('system_prompt', systemPrompt)
  return url
}

function parseTestCallUrlOverride(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch (cause) {
    throw new ConfigurationError(`testCallUrl must be an absolute URL: ${String(cause)}`)
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new ConfigurationError('testCallUrl overrides must use ws: or wss: URLs')
  }
  if (url.search || url.hash) {
    throw new ConfigurationError(
      'testCallUrl overrides must not include query parameters or fragments',
    )
  }
  return url
}

function deriveFromBase(baseUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch (cause) {
    throw new ConfigurationError(
      `testCallUrl cannot be derived from baseUrl; pass agentBaseUrl or testCallUrl explicitly: ${String(cause)}`,
    )
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new ConfigurationError(
      'testCallUrl can only be derived from an origin-only baseUrl; pass agentBaseUrl or testCallUrl explicitly',
    )
  }
  if (parsed.protocol === 'https:' || parsed.protocol === 'wss:') parsed.protocol = 'wss:'
  else if (parsed.protocol === 'http:' || parsed.protocol === 'ws:') parsed.protocol = 'ws:'
  else {
    throw new ConfigurationError(
      'testCallUrl can only be derived from an http, https, ws, or wss baseUrl',
    )
  }
  parsed.pathname = '/agent/test-call'
  return parsed
}

function resolveWebSocketFactory(factory?: WebSocketFactory): WebSocketFactory {
  if (factory) return factory
  if (typeof globalThis.WebSocket === 'undefined') {
    throw new ConfigurationError(
      'No global WebSocket implementation is available; pass webSocketFactory',
    )
  }
  return (url, protocols) => new globalThis.WebSocket(url, protocols)
}

function ensureOpen(socket: WebSocket): void {
  if (socket.readyState !== WEB_SOCKET_OPEN) {
    throw new ConfigurationError('test-call WebSocket is not open')
  }
}

function sendControl(socket: WebSocket, message: TestCallControlMessage): void {
  ensureOpen(socket)
  socket.send(JSON.stringify(message))
}

function requireMessage(message: string): string {
  const normalized = message.trim()
  if (!normalized) throw new ConfigurationError('control message must not be empty')
  return normalized
}

function parseTestCallEvent(value: string): TestCallEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null
  if (parsed.type === 'session_started' && typeof parsed.call_sid === 'string') {
    return { type: parsed.type, call_sid: parsed.call_sid }
  }
  if (
    parsed.type === 'call_progress' &&
    (parsed.phase === 'initializing' || parsed.phase === 'ready')
  ) {
    return { type: parsed.type, phase: parsed.phase }
  }
  if (parsed.type === 'interruption') return { type: parsed.type }
  if (parsed.type === 'ready' && typeof parsed.output_sample_rate === 'number') {
    return { type: parsed.type, output_sample_rate: parsed.output_sample_rate }
  }
  if (parsed.type === 'user_transcript' && typeof parsed.text === 'string') {
    return {
      type: parsed.type,
      text: parsed.text,
      ...(typeof parsed.emotion_label === 'string' ? { emotion_label: parsed.emotion_label } : {}),
      ...(typeof parsed.emotion_valence === 'number'
        ? { emotion_valence: parsed.emotion_valence }
        : {}),
    }
  }
  if (parsed.type === 'agent_transcript' && typeof parsed.text === 'string') {
    return { type: parsed.type, text: parsed.text }
  }
  if (
    parsed.type === 'tool_call_started' &&
    typeof parsed.call_id === 'string' &&
    typeof parsed.tool_name === 'string' &&
    isRecord(parsed.input_params)
  ) {
    return {
      type: parsed.type,
      call_id: parsed.call_id,
      tool_name: parsed.tool_name,
      input_params: parsed.input_params,
    }
  }
  if (
    parsed.type === 'tool_call_completed' &&
    typeof parsed.call_id === 'string' &&
    typeof parsed.tool_name === 'string' &&
    typeof parsed.duration_ms === 'number' &&
    typeof parsed.delivery === 'string'
  ) {
    return {
      type: parsed.type,
      call_id: parsed.call_id,
      tool_name: parsed.tool_name,
      duration_ms: parsed.duration_ms,
      delivery: parsed.delivery,
    }
  }
  if (parsed.type === 'latency') return { ...parsed, type: parsed.type }
  if (parsed.type === 'emotion') return { ...parsed, type: parsed.type }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
