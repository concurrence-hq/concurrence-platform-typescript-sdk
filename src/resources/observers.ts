/**
 * Voice-call observer real-time stream.
 *
 * The voice agent ("agent-engine") exposes a per-call WebSocket that emits
 * the live timeline of a call: transcripts (user + agent), emotion / empathy
 * frames, latency markers, tool invocations, navigation timing, and lifecycle
 * events (start / end / participant join / leave).
 *
 * This resource is the canonical SDK consumer for that stream. Before it
 * existed, every developer-console-style app re-implemented the loop by hand
 * — different idle thresholds, missing close-code handling for the long list
 * of voice-specific 4xxx codes (4001 unauthorized, 4003 forbidden, 4029 rate
 * limit, 4100 token expired), and inconsistent reconnect backoff.
 *
 * The implementation composes {@link createReconnectingWebSocket} with a
 * lightweight ``ObserverSSEEvent`` parser. Frames that don't deserialize or
 * lack a recognized ``type`` discriminator are dropped — the stream remains
 * forward-compatible with new event types added on the server before the SDK
 * spec snapshot picks them up.
 */

import { ConfigurationError } from '../core/errors.js'
import {
  createReconnectingWebSocket,
  type ReconnectingWebSocketError,
  type ReconnectingWebSocketHandle,
  type ReconnectingWebSocketReconnectReason,
  type ReconnectingWebSocketState,
  type WebSocketFactory,
} from '../core/reconnecting-websocket.js'
import { type PlatformFetch } from '../core/openapi-client.js'
import type { components } from '../generated/api.js'
import { WorkspaceScopedResource } from './base.js'

/**
 * Discriminated union of every observer stream event variant. Members carry
 * their own ``type`` literal — narrow with ``switch (event.type)``.
 */
export type ObserverSSEEvent = components['schemas']['ObserverSSEEvent']

/** Discriminator literal for {@link ObserverSSEEvent} members. */
export type ObserverSSEEventType = ObserverSSEEvent['type']

/** Auth subprotocol pair for the observer WebSocket. */
export type ObserverAuthProtocols = readonly ['auth', string]

/** Token grammar accepted in WebSocket subprotocols (RFC 6455). */
const WEB_SOCKET_PROTOCOL_TOKEN_RE = /^[!#$%&'*+\-.^_`|~A-Za-z0-9]+$/
const MAX_AUTH_TOKEN_CHARS = 4096

/** Options for {@link ObserversResource.subscribe}. */
export interface ObserverSubscribeOptions {
  /**
   * The Twilio Call SID (``CA…``) identifying the call to observe. The
   * server returns 4004 if the call is unknown — most often a race in test
   * suites where the call hasn't been registered yet.
   */
  callSid: string

  /**
   * Bearer token for ``Sec-WebSocket-Protocol: auth, <token>``. If the
   * token contains characters that aren't valid in a WebSocket subprotocol
   * the helper throws ``ConfigurationError`` synchronously — the wire
   * protocol cannot carry it and a runtime failure mid-call would be much
   * harder to diagnose.
   */
  token: string

  /**
   * Full observer URL override. Defaults to
   * ``${agentBaseUrl}/agent/observe/{call_sid}`` with
   * ``http`` mapped to ``ws`` and ``https`` mapped to ``wss``. The override
   * must be an absolute ws/wss URL with no query string or fragment — SDK-
   * managed query params are appended by the helper.
   */
  observerUrl?: string

  /** Cancellation signal — aborting closes the connection. */
  signal?: AbortSignal

  /** Fired once per typed event delivered by the server. */
  onEvent: (event: ObserverSSEEvent) => void

  /** Fired on each lifecycle transition. */
  onStateChange?: (state: ReconnectingWebSocketState) => void

  /**
   * Fired just before each reconnect attempt with the planned delay, the
   * close code that triggered the reconnect (or ``undefined`` for the first
   * attempt after a watchdog-driven close), and a coarse ``reason``
   * (``idle_watchdog`` / ``rate_limited`` / ``transient``) for tailoring the
   * reconnect banner copy.
   */
  onReconnect?: (info: {
    attempt: number
    delayMs: number
    closeCode: number | undefined
    reason: ReconnectingWebSocketReconnectReason
  }) => void

  /**
   * Fired exactly once on terminal failure (auth rejected, reconnect
   * budget exhausted, abort, or one of the terminal close codes 4001 /
   * 4003 / 4100 / 4403). Will not fire on ordinary disconnect-and-reconnect.
   */
  onError?: (error: ReconnectingWebSocketError) => void

  /** Idle watchdog (ms). Defaults to 60s for voice-call streams. */
  idleTimeoutMs?: number

  /** Initial reconnect backoff (ms). Defaults to 1000. */
  initialDelayMs?: number

  /** Cap on reconnect backoff (ms). Defaults to 30_000. */
  maxDelayMs?: number

  /** Reconnect budget. Defaults to 10. */
  maxReconnects?: number

  /** Custom WebSocket factory — primarily for tests. */
  webSocketFactory?: WebSocketFactory
}

/**
 * Build browser WebSocket subprotocols for the observer stream.
 *
 * Wire format is ``Sec-WebSocket-Protocol: auth, <token>``.
 *
 * @security The returned tuple contains the raw bearer token. Do not log,
 *   persist, serialize, or otherwise expose this value.
 */
export function observerAuthProtocols(token: string): ObserverAuthProtocols {
  if (!token) {
    throw new ConfigurationError('observerAuthProtocols requires a non-empty token')
  }
  if (token.length > MAX_AUTH_TOKEN_CHARS) {
    throw new ConfigurationError(
      `observer token exceeds the ${MAX_AUTH_TOKEN_CHARS}-character WebSocket subprotocol limit`,
    )
  }
  if (!WEB_SOCKET_PROTOCOL_TOKEN_RE.test(token)) {
    throw new ConfigurationError(
      'observer token contains characters browsers reject in WebSocket subprotocols',
    )
  }
  return ['auth', token] as const
}

/**
 * Voice-call observer resource.
 *
 * @example
 * ```ts
 * const handle = client.observers.subscribe({
 *   callSid: 'CAxxx',
 *   token: bearerToken,
 *   onEvent: (event) => {
 *     switch (event.type) {
 *       case 'agent_transcript_delta':
 *         renderAgentDelta(event.text)
 *         break
 *       case 'user_transcript':
 *         renderUserTurn(event.text)
 *         break
 *       case 'session_end':
 *         showSummary(event)
 *         break
 *     }
 *   },
 *   onError: (err) => console.error('observer terminal:', err.reason),
 * })
 *
 * // Later, to stop:
 * handle.close()
 * await handle.done
 * ```
 */
export class ObserversResource extends WorkspaceScopedResource {
  private readonly agentBaseUrl: string | undefined

  constructor(client: PlatformFetch, workspaceId: string, agentBaseUrl?: string) {
    super(client, workspaceId)
    this.agentBaseUrl = agentBaseUrl
  }

  /**
   * Subscribe to the live observer stream for a call.
   *
   * Returns a {@link ReconnectingWebSocketHandle} that resolves
   * ``handle.done`` when the stream terminates (consumer-aborted, terminal
   * close code, or reconnect budget exhausted). Errors are surfaced through
   * ``onError``; the promise never rejects.
   */
  subscribe(options: ObserverSubscribeOptions): ReconnectingWebSocketHandle {
    const url = buildObserverUrl({
      baseUrl: this.agentBaseUrl ?? this.platformBaseUrl,
      callSid: options.callSid,
      observerUrl: options.observerUrl,
    })

    const protocols = observerAuthProtocols(options.token)

    return createReconnectingWebSocket({
      url,
      protocols: [...protocols],
      onMessage: (ev) => {
        const parsed = parseObserverFrame(ev.data)
        if (parsed) {
          try {
            options.onEvent(parsed)
          } catch {
            // Consumer threw in onEvent — do not let it kill the loop.
          }
        }
      },
      onStateChange: options.onStateChange,
      onReconnect: options.onReconnect,
      onError: options.onError,
      signal: options.signal,
      idleTimeoutMs: options.idleTimeoutMs ?? 60_000,
      initialDelayMs: options.initialDelayMs ?? 1_000,
      maxDelayMs: options.maxDelayMs ?? 30_000,
      maxReconnects: options.maxReconnects ?? 10,
      webSocketFactory: options.webSocketFactory,
    })
  }
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

interface BuildObserverUrlArgs {
  baseUrl: string
  callSid: string
  observerUrl?: string | undefined
}

const CALL_SID_RE = /^CA[a-zA-Z0-9]{32}$/

function buildObserverUrl(args: BuildObserverUrlArgs): string {
  if (!args.callSid) {
    throw new ConfigurationError('callSid is required to subscribe to the observer stream')
  }
  if (args.observerUrl) {
    // Override path — the consumer has already constructed the full URL
    // (e.g. via a custom voice-agent gateway helper). Skip the Twilio CA
    // SID grammar check; the override owns the URL shape.
    return parseOverride(args.observerUrl).toString()
  }
  // Default path — derive ``/agent/observe/{callSid}`` and validate
  // the CA SID grammar so a typo fails at the function boundary instead of
  // mid-reconnect-loop with an opaque 4001.
  if (!CALL_SID_RE.test(args.callSid)) {
    throw new ConfigurationError(
      `callSid does not match Twilio CA SID format (CA + 32 hex chars): ${args.callSid}`,
    )
  }
  return deriveFromBase(args.baseUrl, args.callSid).toString()
}

function parseOverride(observerUrl: string): URL {
  let url: URL
  try {
    url = new URL(observerUrl)
  } catch (cause) {
    throw new ConfigurationError(`observerUrl must be an absolute URL: ${String(cause)}`)
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new ConfigurationError('observerUrl overrides must use ws: or wss: URLs')
  }
  if (url.search || url.hash) {
    throw new ConfigurationError(
      'observerUrl overrides must not include query parameters or fragments',
    )
  }
  return url
}

function deriveFromBase(baseUrl: string, callSid: string): URL {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch (cause) {
    throw new ConfigurationError(`observerUrl cannot be derived from baseUrl: ${String(cause)}`)
  }
  // Map http(s) to ws(s) — the agent-engine ALB serves both on the same host.
  let scheme: string
  if (parsed.protocol === 'https:' || parsed.protocol === 'wss:') scheme = 'wss:'
  else if (parsed.protocol === 'http:' || parsed.protocol === 'ws:') scheme = 'ws:'
  else {
    throw new ConfigurationError(
      `observerUrl can only be derived from an http, https, ws, or wss baseUrl: ${baseUrl}`,
    )
  }
  // The pathname must be '/' — observer paths are owned by this helper,
  // not the consumer's baseUrl gateway.
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new ConfigurationError(
      'observerUrl can only be derived from an origin-only baseUrl; pass observerUrl explicitly when using path-prefixed gateways',
    )
  }
  const out = new URL(`${scheme}//${parsed.host}/agent/observe/${encodeURIComponent(callSid)}`)
  return out
}

// ---------------------------------------------------------------------------
// Frame parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw WebSocket frame into a typed {@link ObserverSSEEvent}.
 *
 * Drift-tolerant: returns ``null`` on JSON decode errors, non-object
 * payloads, missing ``type`` discriminator, or unknown discriminator
 * values. The static type of ``ObserverSSEEvent`` is the contract — the
 * server may add new event types ahead of an SDK release and the consumer's
 * exhaustive ``switch`` will simply not match them, leaving the unknown
 * frame on the floor.
 */
function parseObserverFrame(data: unknown): ObserverSSEEvent | null {
  let text: string
  if (typeof data === 'string') {
    text = data
  } else if (data instanceof ArrayBuffer) {
    text = new TextDecoder().decode(data)
  } else if (ArrayBuffer.isView(data)) {
    // ``data`` is some TypedArray; @types/node TextDecoder.decode wants
    // ``BufferSource``. Pass through as ``Uint8Array`` over the underlying
    // buffer so every TypedArray variant decodes consistently.
    const view = data as ArrayBufferView
    text = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  } else {
    return null
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const obj = payload as Record<string, unknown>
  if (typeof obj['type'] !== 'string') return null
  return obj as ObserverSSEEvent
}
