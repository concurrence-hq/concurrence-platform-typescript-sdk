import { ConfigurationError, ParseError } from '../core/errors.js'
import { applyPlatformRequestOptions, type PlatformFetch } from '../core/openapi-client.js'
import type { WebSocketFactory } from '../core/reconnecting-websocket.js'
import { mergeRequestOptions, type ScopedRequestOptions } from '../core/request-options.js'
import {
  resolveScopedPlatformClient,
  scopePlatformClient,
  WorkspaceScopedResource,
} from './base.js'

const TEST_CALL_START_PATH = '/agent/test-call/start'
const TEST_CALL_SOCKET_PATH = '/agent/test-call'
const TEST_CALL_SAMPLE_RATE = '8000'
const MAX_AUTH_TOKEN_CHARS = 4096
const WEB_SOCKET_PROTOCOL_TOKEN_RE = /^[!#$%&'*+\-.^_`|~A-Za-z0-9]+$/
const TEST_CALL_AUDIO_ENCODING = 'mulaw'
const CREDENTIAL_QUERY_NAMES = new Set(['token', 'access_token', 'api_key', 'authorization'])
const HOST_LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
const ACTOR_DOMAIN_RE = new RegExp(`^(?:${HOST_LABEL}\\.)+(?=[a-z0-9-]*[a-z])${HOST_LABEL}$`)
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
const WEB_SOCKET_OPEN = 1

/**
 * Parameters used to build the browser voice test-call WebSocket URL.
 *
 * The audio format is not a parameter: the agent engine accepts only G.711
 * mu-law, 8 kHz, mono on this socket, so every URL carries ``encoding=mulaw``.
 */
export interface TestCallUrlParams {
  serviceId: string
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
   * Absolute endpoint URL override for a dedicated voice runner or a custom
   * ingress that serves the test-call socket itself. Its path is used verbatim;
   * it must not contain a query or fragment because the SDK appends every
   * supported test-call query parameter.
   *
   * It cannot carry a server-issued actor URL, whose query holds the
   * allocation. Use {@link TestCallsResource.start} for allocated calls.
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

/**
 * Output format announcement emitted when the underlying transport is ready.
 *
 * The engine names the format of the audio it is about to send. On this socket
 * that is always ``mulaw`` at ``8000`` Hz. A ``ready`` frame naming any other
 * encoding is outside this contract and is not delivered as an event.
 */
export interface TestCallReadyEvent {
  type: 'ready'
  output_encoding: 'mulaw'
  output_sample_rate: number
}

/** Sent just before the engine closes a call whose conversation has ended. */
export interface TestCallConversationCompleteEvent {
  type: 'conversation_complete'
  /** Why the conversation ended, for example ``terminal_state``. */
  reason: string
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
  | TestCallConversationCompleteEvent
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

/** Socket credentials and callbacks shared by direct and allocated test calls. */
export interface TestCallSocketOptions {
  /** Bearer token sent as ``Sec-WebSocket-Protocol: auth, <token>``. */
  token: string
  /**
   * Receives agent audio frames as raw G.711 mu-law, 8 kHz, mono: one byte per
   * sample, no container. The SDK does not decode them.
   */
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

/** Options for {@link TestCallsResource.connect}, the direct-connect path. */
export interface TestCallConnectOptions extends TestCallUrlParams, TestCallSocketOptions {}

/** Options for {@link TestCallsResource.start}, the allocated path. */
export interface TestCallStartOptions extends TestCallSocketOptions {
  serviceId: string
  /** Optional caller phone number (E.164) used to resolve simulated caller context. */
  callerId?: string
  /**
   * Optional start-time context: a JSON object keyed by context name. The agent
   * engine validates it against the service's accepted context and hands it to
   * the allocated runner by reference; it travels in the request body, never in
   * a URL.
   */
  context?: Record<string, unknown>
  /**
   * Required. The actor ingress domains this application approves for the
   * server-issued actor URL; the token is sent only to a host on this list.
   * There is no default: the SDK does not derive actor hosts from
   * ``agentBaseUrl``, guess a parent domain, or accept wildcards, and
   * ``start()`` fails before allocating when the list is missing or empty.
   *
   * - A domain entry (two or more labels) accepts that host and its
   *   subdomains. Name the actor ingress domain itself, never a shared parent
   *   such as a registrable or hosting domain. Amigo production regions use
   *   ``actors-us.concurrence.com``, ``actors-au.concurrence.com``,
   *   ``actors-eu.concurrence.com`` and ``actors-ca.concurrence.com``; list
   *   only the region(s) your ``agentBaseUrl`` belongs to.
   * - ``localhost`` and IP literals (``127.0.0.1``, ``[::1]``) are exact-only:
   *   they accept that one host and nothing under or beside it.
   *
   * A custom or local agent engine issues actor URLs under its own configured
   * actor ingress suffix; pass that approved suffix here.
   */
  actorHostSuffixes: readonly string[]
  /**
   * Aborts the allocation request and, once the call is open, closes its
   * socket. An allocation the engine already made is not released by the SDK;
   * the engine reclaims a runner that no media attaches to.
   */
  signal?: AbortSignal
}

/** Handle for one non-reconnecting browser voice test call. */
export interface TestCallHandle {
  /** Resolves after the socket closes. */
  readonly done: Promise<void>
  /** Current native WebSocket ready state. */
  readonly readyState: number
  /**
   * Send one microphone audio frame as raw G.711 mu-law, 8 kHz, mono.
   *
   * The bytes are forwarded unchanged and the engine does not transcode them,
   * so audio captured in another format must be resampled and mu-law encoded
   * by the caller first.
   */
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

/** A test call running on a voice runner the agent engine allocated for it. */
export interface TestCallSession extends TestCallHandle {
  /**
   * Identifier the agent engine assigned to the allocation request
   * (``test-...``). It correlates the allocation in engine logs only and is
   * not the live call id: the allocated runner assigns that when the socket
   * attaches and reports it in the ``session_started`` event. Use
   * ``session_started.call_sid`` from ``onEvent`` for observer subscriptions
   * and call lookups.
   */
  readonly allocationCallSid: string
}

/**
 * Browser voice test calls.
 *
 * {@link TestCallsResource.start} is the path for deployed environments: it
 * asks the agent engine to allocate a voice runner, then connects to the actor
 * URL the engine issues. {@link TestCallsResource.connect} opens
 * ``WS /agent/test-call`` on the configured origin directly, which only works
 * where that origin is itself a voice runner.
 */
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

  /**
   * Allocate a voice runner for a test call and connect to it.
   *
   * Sends one ``POST /agent/test-call/start`` to the configured
   * ``agentBaseUrl`` with the client's credential, then opens the actor URL the
   * engine returns, unchanged, authenticating with ``token``. Audio is G.711
   * mu-law, 8 kHz, mono in both directions, exactly as with
   * {@link TestCallsResource.connect}.
   *
   * - The allocation is never retried: each request reserves a new runner, so
   *   ``429`` (workspace at its concurrent test-call limit) and ``503`` (no
   *   capacity) reject once with the usual typed errors. Retry from the
   *   application when the user asks again.
   * - ``agentBaseUrl`` is required and must be an ``https`` (or ``wss``) origin;
   *   plain ``http`` is accepted for loopback hosts only. The request is never
   *   sent to the platform API origin.
   * - The returned URL is refused, and no socket is opened, unless it is a
   *   ``wss`` ``/agent/test-call`` URL on an accepted actor host (see
   *   ``actorHostSuffixes``) that names this workspace and service, mu-law at
   *   8 kHz, an allocation, and a context reference exactly when ``context``
   *   was sent. The token is only ever sent as a WebSocket subprotocol.
   * - The client's credential and ``token`` must identify the same principal;
   *   the engine binds the allocation and its context to the credential that
   *   requested it. In a browser, use one short-lived identity access token
   *   for both and keep workspace API keys on a trusted server.
   * - ``actorHostSuffixes`` is required and checked before the allocation is
   *   requested. A returned URL whose query carries a credential-named
   *   parameter (``token``, ``access_token``, ``api_key``, ``authorization``)
   *   is refused; other server-issued parameters are kept as issued.
   * - The live call id arrives in the ``session_started`` event, not on the
   *   returned handle; ``allocationCallSid`` only names the allocation.
   */
  async start(options: TestCallStartOptions): Promise<TestCallSession> {
    testCallAuthProtocols(options.token)
    resolveWebSocketFactory(options.webSocketFactory)
    const serviceId = options.serviceId.trim()
    if (!this.workspaceId.trim()) throw new ConfigurationError('workspaceId is required')
    if (!serviceId) throw new ConfigurationError('serviceId is required')
    if (options.context !== undefined && !isRecord(options.context)) {
      throw new ConfigurationError('context must be a JSON object')
    }
    const callerId = options.callerId?.trim() || undefined
    const origin = parseAllocationOrigin(this.agentBaseUrl)
    const actorHostSuffixes = resolveActorHostSuffixes(options.actorHostSuffixes)
    const signal = options.signal
    if (signal?.aborted) throw abortReason(signal)

    const { baseClient, options: scopedOptions } = resolveScopedPlatformClient(this.client)
    const init = applyPlatformRequestOptions(baseClient, {
      ...mergeRequestOptions(scopedOptions, { signal }),
      baseUrl: origin.origin,
      body: {
        workspace_id: this.workspaceId,
        service_id: serviceId,
        ...(callerId ? { caller_id: callerId } : {}),
        ...(options.context !== undefined ? { context: options.context } : {}),
      },
      // Each request reserves a runner, so a retry could allocate twice.
      maxRetries: 0,
    } as never)

    let data: unknown
    try {
      const post = baseClient.POST as unknown as (
        path: string,
        init: unknown,
      ) => Promise<{ data?: unknown }>
      data = (await post(TEST_CALL_START_PATH, init)).data
    } catch (cause) {
      if (signal?.aborted) throw abortReason(signal)
      if (cause instanceof SyntaxError) {
        throw new ParseError('Test-call allocation response was not valid JSON')
      }
      throw cause
    }
    if (signal?.aborted) throw abortReason(signal)

    const allocation = parseAllocation(data, {
      origin,
      actorHostSuffixes,
      workspaceId: this.workspaceId,
      serviceId,
      callerId,
      hasContext: options.context !== undefined,
    })
    const handle = openTestCall(allocation.url, options)
    return Object.defineProperty(handle, 'allocationCallSid', {
      value: allocation.allocationCallSid,
      enumerable: true,
    }) as TestCallSession
  }

  /**
   * Build the direct test-call WebSocket URL without placing credentials in it.
   *
   * Direct URLs carry no allocation; see {@link TestCallsResource.connect} for
   * where they are served.
   */
  url(params: TestCallUrlParams): string {
    return buildTestCallUrl({
      baseUrl: this.agentBaseUrl ?? this.platformBaseUrl,
      workspaceId: this.workspaceId,
      ...params,
    }).toString()
  }

  /**
   * Open a duplex voice test call directly on the configured origin, carrying
   * G.711 mu-law, 8 kHz, mono audio in both directions.
   *
   * Dedicated-runner scope only: this connects straight to
   * ``WS /agent/test-call`` on ``agentBaseUrl`` (or ``testCallUrl``) without an
   * allocation. Only a voice runner serves that route, so use it against a
   * dedicated runner or a local engine. The standard deployed agent ingress
   * routes to the dispatcher, which does not serve it and refuses the socket;
   * use {@link TestCallsResource.start} there.
   *
   * The SDK owns URL construction, authentication, and metadata parsing. The
   * consumer remains responsible for microphone capture, mu-law encoding and
   * decoding, and audio playback.
   * Test calls are intentionally not reconnected because a dropped media
   * socket terminates its voice session.
   */
  connect(options: TestCallConnectOptions): TestCallHandle {
    return openTestCall(this.url(options), options)
  }
}

function openTestCall(url: string, options: TestCallSocketOptions): TestCallHandle {
  const factory = resolveWebSocketFactory(options.webSocketFactory)
  const socket = factory(url, [...testCallAuthProtocols(options.token)])
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
        const message: TestCallControlMessage = reason ? { type: 'stop', reason } : { type: 'stop' }
        socket.send(JSON.stringify(message))
      }
      socket.close(1000, reason ?? 'User ended test call')
    },
    close(code, reason) {
      socket.close(code, reason)
    },
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
  callerId,
  versionSet,
  scenario,
  outboundTaskEntityId,
  systemPrompt,
  testCallUrl,
}: BuildTestCallUrlArgs): URL {
  if (!workspaceId.trim()) throw new ConfigurationError('workspaceId is required')
  if (!serviceId.trim()) throw new ConfigurationError('serviceId is required')
  if (scenario && !['inbound', 'outbound', 'silent'].includes(scenario)) {
    throw new ConfigurationError('scenario must be inbound, outbound, or silent')
  }
  if (scenario === 'outbound' && !outboundTaskEntityId?.trim()) {
    throw new ConfigurationError('outboundTaskEntityId is required for outbound test calls')
  }

  const url = testCallUrl ? parseTestCallUrlOverride(testCallUrl) : deriveFromBase(baseUrl)
  url.searchParams.set('workspace_id', workspaceId)
  url.searchParams.set('service_id', serviceId)
  url.searchParams.set('encoding', TEST_CALL_AUDIO_ENCODING)
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

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('This operation was aborted', 'AbortError')
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  )
}

function parseAllocationOrigin(agentBaseUrl: string | undefined): URL {
  if (!agentBaseUrl?.trim()) {
    throw new ConfigurationError(
      'agentBaseUrl is required to start an allocated test call; the allocation is never sent to the platform API origin',
    )
  }
  let url: URL
  try {
    url = new URL(agentBaseUrl)
  } catch {
    throw new ConfigurationError(
      'agentBaseUrl must be an absolute URL to start an allocated test call',
    )
  }
  if (url.protocol === 'wss:') url.protocol = 'https:'
  else if (url.protocol === 'ws:') url.protocol = 'http:'
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigurationError('agentBaseUrl must be an http, https, ws, or wss URL')
  }
  if (url.username || url.password) {
    throw new ConfigurationError('agentBaseUrl must not embed credentials')
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new ConfigurationError(
      'agentBaseUrl must be an origin without a path, query, or fragment to start an allocated test call',
    )
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new ConfigurationError(
      'agentBaseUrl must use https or wss to start an allocated test call, except on loopback hosts',
    )
  }
  return url
}

interface ActorHostRule {
  host: string
  /** ``localhost`` and IP literals match one host; domains also match subdomains. */
  exact: boolean
}

function isIpv6Literal(value: string): boolean {
  if (!/^\[[0-9a-f:.]+\]$/.test(value)) return false
  try {
    return new URL(`ws://${value}/`).hostname === value
  } catch {
    return false
  }
}

function resolveActorHostSuffixes(configured: unknown): readonly ActorHostRule[] {
  if (!Array.isArray(configured) || configured.length === 0) {
    throw new ConfigurationError(
      'actorHostSuffixes is required to start an allocated test call: list the approved actor ingress domain(s), for example actors-us.concurrence.com. The SDK does not derive actor hosts from agentBaseUrl',
    )
  }
  return configured.map((entry: unknown): ActorHostRule => {
    const host = typeof entry === 'string' ? entry.trim().toLowerCase().replace(/^\./, '') : ''
    if (host === 'localhost' || IPV4_RE.test(host) || isIpv6Literal(host)) {
      return { host, exact: true }
    }
    if (host.length <= 253 && ACTOR_DOMAIN_RE.test(host)) return { host, exact: false }
    throw new ConfigurationError(
      'actorHostSuffixes entries must be a domain with at least two labels, localhost, or an IP literal; wildcards, ports and top-level names are not accepted',
    )
  })
}

interface AllocationExpectation {
  origin: URL
  actorHostSuffixes: readonly ActorHostRule[]
  workspaceId: string
  serviceId: string
  callerId: string | undefined
  hasContext: boolean
}

/**
 * Validate the allocation before any credential is sent to the URL it names.
 * Rejections describe the failed rule only: the URL carries the allocation and
 * context references and is never echoed into an error.
 */
function parseAllocation(
  data: unknown,
  expected: AllocationExpectation,
): { url: string; allocationCallSid: string } {
  const reject = (reason: string): never => {
    throw new ParseError(`Test-call allocation was refused: ${reason}`)
  }
  if (!isRecord(data)) return reject('the response is not an object')
  const { ws_url: wsUrl, call_sid: allocationCallSid, actor_token: actorToken } = data
  if (typeof wsUrl !== 'string' || !wsUrl) return reject('ws_url is missing')
  if (typeof allocationCallSid !== 'string' || !allocationCallSid) {
    return reject('call_sid is missing')
  }
  if (actorToken !== '') return reject('it carries an actor token this SDK cannot present')

  let url: URL
  try {
    url = new URL(wsUrl)
  } catch {
    return reject('ws_url is not an absolute URL')
  }
  const cleartextLoopback =
    url.protocol === 'ws:' && expected.origin.protocol === 'http:' && isLoopbackHost(url.hostname)
  if (url.protocol !== 'wss:' && !cleartextLoopback) return reject('ws_url is not a wss URL')
  if (url.username || url.password) return reject('ws_url embeds credentials')
  if (url.protocol === 'wss:' && url.port) return reject('ws_url names an explicit port')
  const hostname = url.hostname.toLowerCase()
  if (
    !expected.actorHostSuffixes.some(
      (rule) => hostname === rule.host || (!rule.exact && hostname.endsWith(`.${rule.host}`)),
    )
  ) {
    return reject('ws_url host is not an accepted actor host; see actorHostSuffixes')
  }
  if (url.pathname !== TEST_CALL_SOCKET_PATH) return reject('ws_url path is not /agent/test-call')
  if (url.hash || wsUrl.includes('#')) return reject('ws_url has a fragment')

  const query = url.searchParams
  for (const name of query.keys()) {
    if (CREDENTIAL_QUERY_NAMES.has(name.toLowerCase())) {
      return reject('ws_url carries a credential query parameter')
    }
  }
  const single = (name: string): string | undefined => {
    const values = query.getAll(name)
    return values.length === 1 ? values[0] : undefined
  }
  if (single('workspace_id')?.toLowerCase() !== expected.workspaceId.toLowerCase()) {
    return reject('ws_url is for another workspace')
  }
  if (single('service_id')?.toLowerCase() !== expected.serviceId.toLowerCase()) {
    return reject('ws_url is for another service')
  }
  if (single('encoding') !== TEST_CALL_AUDIO_ENCODING) return reject('ws_url is not mu-law')
  if (single('sample_rate') !== TEST_CALL_SAMPLE_RATE) return reject('ws_url is not 8 kHz')
  if (!single('allocation_id')) return reject('ws_url has no allocation_id')
  if (
    expected.callerId ? single('caller_id') !== expected.callerId : query.getAll('caller_id').length
  ) {
    return reject('ws_url caller_id does not match the request')
  }
  if (expected.hasContext ? !single('context_ref') : query.getAll('context_ref').length) {
    return reject('ws_url context_ref does not match the request')
  }
  return { url: url.href, allocationCallSid }
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
  if (
    parsed.type === 'ready' &&
    parsed.output_encoding === TEST_CALL_AUDIO_ENCODING &&
    typeof parsed.output_sample_rate === 'number'
  ) {
    return {
      type: parsed.type,
      output_encoding: parsed.output_encoding,
      output_sample_rate: parsed.output_sample_rate,
    }
  }
  if (parsed.type === 'conversation_complete' && typeof parsed.reason === 'string') {
    return { type: parsed.type, reason: parsed.reason }
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
