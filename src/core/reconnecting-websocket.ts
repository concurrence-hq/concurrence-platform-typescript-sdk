/**
 * Reconnecting WebSocket primitive shared by the SDK's WS-based realtime
 * helpers (session-connect, observer).
 *
 * The platform exposes three workspace-scoped WebSocket surfaces with similar
 * lifecycle requirements:
 *
 *   * Resume on transient drops with exponential backoff + full jitter
 *   * Treat permanent-rejection close codes (1008 / 3003 / 4001 / 4003 /
 *     4004 / 4100 / 4403) as terminal — fail fast, do not loop
 *   * Treat 4029 / 1013 (rate limit / cap) as reconnectable on a slow floor,
 *     surfacing a ``rate_limited`` reconnect reason
 *   * Watchdog the connection: if no message arrives within an idle window,
 *     the upstream is dead even if the TCP socket has not closed; force a
 *     reconnect (with a NON-terminal close code so the loop actually rebuilds)
 *   * Surface every typed message through ``onMessage`` and every state
 *     transition through ``onStateChange``
 *
 * Before this primitive existed, every consumer (developer-console
 * useStreamSession, useCallObserver, agent-engineering scripts) re-implemented
 * the loop with subtle bugs (different idle thresholds, missing retry budget,
 * no terminal-code handling). This module is the single canonical
 * implementation; resource helpers compose it with their own message parsers
 * and protocol details.
 *
 * @see ReconnectingWebSocket
 * @see EventsResource for the analogous SSE-based helper
 */

/** Lifecycle states reported via {@link ReconnectingWebSocketOptions.onStateChange}. */
export type ReconnectingWebSocketState =
  | 'connecting'
  | 'open'
  | 'closing'
  | 'closed'
  | 'reconnecting'
  | 'terminal'

/** Reasons surfaced to {@link ReconnectingWebSocketOptions.onError} on a terminal close. */
export type ReconnectingWebSocketErrorReason =
  | 'auth'
  | 'rate_limited'
  | 'client_error'
  | 'server_error'
  | 'reconnect_budget_exhausted'
  | 'aborted'
  | 'idle_watchdog'
  | 'open_failed'
  | 'unknown'

/**
 * Coarse cause surfaced to {@link ReconnectingWebSocketOptions.onReconnect}
 * describing WHY the loop is reconnecting. Lets consumers vary the banner
 * copy ("connection went quiet" vs. "too many connections — retrying").
 *
 *   * ``idle_watchdog`` — no frame arrived within ``idleTimeoutMs``; the
 *     watchdog force-closed the (apparently dead) socket.
 *   * ``rate_limited``  — the server closed with a rate-limit code (4029 /
 *     1013); the backoff floor is raised before retrying.
 *   * ``transient``     — an ordinary network drop / unclassified close code.
 */
export type ReconnectingWebSocketReconnectReason = 'idle_watchdog' | 'rate_limited' | 'transient'

/** Structured terminal error surfaced to consumers. */
export class ReconnectingWebSocketError extends Error {
  readonly reason: ReconnectingWebSocketErrorReason
  readonly closeCode: number | undefined
  readonly closeReason: string | undefined
  readonly attempts: number

  constructor(
    message: string,
    reason: ReconnectingWebSocketErrorReason,
    closeCode: number | undefined,
    closeReason: string | undefined,
    attempts: number,
  ) {
    super(message)
    this.name = 'ReconnectingWebSocketError'
    this.reason = reason
    this.closeCode = closeCode
    this.closeReason = closeReason
    this.attempts = attempts
  }
}

/**
 * Constructor for the underlying WebSocket. Defaults to the global
 * ``WebSocket`` (browsers, Bun, Deno, Node 22+ via global) if available.
 *
 * Pass an explicit factory in environments without a global (older Node) or
 * for tests that swap in a mock.
 */
export type WebSocketFactory = (url: string, protocols?: string | string[]) => WebSocket

/** Options for {@link ReconnectingWebSocket}. */
export interface ReconnectingWebSocketOptions {
  /** Target ws:// or wss:// URL. */
  url: string

  /**
   * Optional WebSocket subprotocols. The platform's auth scheme passes the
   * bearer token here (``['auth', token]``) so it never appears in the URL.
   *
   * Frozen at subscribe time and reused verbatim on every (re)connect. For a
   * long-lived stream whose bearer token can expire between reconnects, pass
   * {@link getProtocols} instead so each (re)connect picks up a fresh token.
   */
  protocols?: string | string[]

  /**
   * Optional provider for the WebSocket subprotocols, invoked on EACH
   * (re)connect to obtain fresh subprotocols (typically a refreshed bearer
   * token in the ``['auth', token]`` pair). Use this for long-lived streams
   * where the token can expire while the loop is reconnecting — the static
   * {@link protocols} freeze the value at subscribe time and would replay a
   * stale token on every retry, looping forever against a 4403.
   *
   * When provided, this takes precedence over {@link protocols}. May return
   * synchronously or as a promise. If it throws / rejects, the connection
   * attempt fails as ``open_failed`` and the reconnect loop retries (so a
   * transient token-refresh hiccup is survivable). Falls back to
   * {@link protocols} when absent — fully backward compatible.
   */
  getProtocols?: () => string | string[] | Promise<string | string[]>

  /**
   * Initial backoff delay (ms). Doubles with full jitter on each successive
   * failure up to ``maxDelayMs``. Default ``1_000``.
   */
  initialDelayMs?: number

  /** Cap on the reconnect backoff delay (ms). Default ``30_000``. */
  maxDelayMs?: number

  /**
   * Maximum number of reconnect attempts before giving up. Default ``10``.
   * Set to ``Infinity`` to retry forever (rely on AbortSignal for shutdown).
   */
  maxReconnects?: number

  /**
   * Idle watchdog (ms). If no message arrives within this window the
   * connection is considered dead and is force-closed; the reconnect loop
   * then handles the rebuild. Default ``45_000`` (matches the longest
   * platform endpoint heartbeat). Set to ``0`` to disable.
   */
  idleTimeoutMs?: number

  /**
   * Cancellation signal. Aborting the signal closes the underlying socket
   * and stops the reconnect loop. The ``done`` promise resolves once the
   * teardown completes.
   */
  signal?: AbortSignal

  /**
   * Optional WebSocket factory. Defaults to ``globalThis.WebSocket`` if
   * available; throws at first connect attempt otherwise.
   */
  webSocketFactory?: WebSocketFactory

  /**
   * Invoked when the underlying socket transitions states. Mostly useful
   * for surfacing reconnects to the UI (e.g., "Reconnecting…" banner).
   */
  onStateChange?: (state: ReconnectingWebSocketState) => void

  /**
   * Invoked once per inbound frame. ``MessageEvent.data`` is delivered raw
   * — consumers parse JSON / binary themselves.
   */
  onMessage: (event: MessageEvent) => void

  /**
   * Invoked just before each reconnect attempt with the 1-based attempt
   * number, the planned delay (ms), the close code that triggered the
   * reconnect, and a coarse ``reason`` describing WHY we are reconnecting.
   *
   * ``reason`` lets consumers tailor the banner copy: ``idle_watchdog`` →
   * "connection went quiet, reconnecting…"; ``rate_limited`` → "too many
   * connections — retrying…"; ``transient`` → generic "reconnecting…". The
   * ``reason`` field is additive — existing consumers that ignore it keep
   * working unchanged.
   */
  onReconnect?: (info: {
    attempt: number
    delayMs: number
    closeCode: number | undefined
    reason: ReconnectingWebSocketReconnectReason
  }) => void

  /**
   * Invoked exactly once per ``ReconnectingWebSocket`` instance on a
   * terminal failure (consumer-aborted, reconnect budget exhausted, or a
   * close code in the terminal set: 1008 / 3003 / 4001 / 4003 / 4004 /
   * 4100 / 4403). The {@link ReconnectingWebSocketError.closeCode} carries
   * the originating wire close code (when one exists) so consumers can
   * branch on it.
   */
  onError?: (error: ReconnectingWebSocketError) => void
}

/** Handle returned by {@link createReconnectingWebSocket}. */
export interface ReconnectingWebSocketHandle {
  /**
   * Resolves when the loop has fully stopped (post-abort cleanup complete).
   * Never rejects; consume errors via ``onError``.
   */
  done: Promise<void>

  /**
   * Send a frame on the currently open socket. Throws if no socket is
   * currently open. Use ``onStateChange`` to gate sends, or buffer in
   * caller code.
   */
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void

  /**
   * Close the connection and stop reconnecting. Equivalent to aborting the
   * caller-supplied signal. Idempotent.
   */
  close(code?: number, reason?: string): void

  /** Latest known lifecycle state. */
  readonly state: ReconnectingWebSocketState
}

/**
 * Close codes that should NEVER be retried. The server is telling us the
 * connection cannot succeed regardless of how many times we try.
 *
 * 1008 (policy violation), 3003 (workspace mismatch — the call/session does
 * not belong to the authenticated workspace; retrying replays the same
 * mismatch), 4001 (client error / bad params), 4003 (forbidden), 4004 (call
 * / session not found — the target no longer exists, every retry 404s the
 * same way), 4100 (auth / not authenticated, used by some platform
 * endpoints), 4403 (forbidden — used by platform-api session-connect for
 * auth and origin rejection).
 */
const TERMINAL_CLOSE_CODES = new Set([1008, 3003, 4001, 4003, 4004, 4100, 4403])

/**
 * Dedicated NON-terminal close code the idle watchdog uses to force-close a
 * stalled socket. It is deliberately OUTSIDE {@link TERMINAL_CLOSE_CODES} —
 * the watchdog's entire purpose is to FORCE a reconnect, so closing with a
 * terminal code (the original bug) made the loop give up instead. Picked in
 * the application-private 4000–4999 range, clear of the platform's assigned
 * 40xx codes.
 */
const WATCHDOG_CLOSE_CODE = 4099

/**
 * Close codes that are reconnectable-but-rate-limited. The reconnect loop
 * still retries these (they are NOT terminal) but honors a longer floor
 * (``RATE_LIMITED_FLOOR_MS``) before doing so, and surfaces a ``rate_limited``
 * reason on ``onReconnect`` so consumers can message "too many connections —
 * retrying…" instead of a generic banner. If the retries exhaust the budget,
 * the terminal ``onError`` carries the originating 4029 / 1013 close code.
 *
 * 4029 (custom platform code for "too many connections / burst exceeded").
 * 1013 (try again later, RFC 6455 standard hint).
 */
const RATE_LIMITED_CLOSE_CODES = new Set([1013, 4029])

const RATE_LIMITED_FLOOR_MS = 5_000

const DEFAULT_INITIAL_DELAY_MS = 1_000
const DEFAULT_MAX_DELAY_MS = 30_000
const DEFAULT_MAX_RECONNECTS = 10
const DEFAULT_IDLE_TIMEOUT_MS = 45_000

/**
 * Build a managed reconnecting WebSocket.
 *
 * The returned handle is the only public surface; the underlying
 * ``WebSocket`` is held privately so consumers cannot bypass the lifecycle
 * machinery (which would defeat the watchdog and reconnect loop).
 *
 * @example
 * ```ts
 * const handle = createReconnectingWebSocket({
 *   url: client.conversations.sessionConnectUrl({ serviceId, entityId }),
 *   // Re-mint the auth subprotocols on EACH (re)connect so a token that
 *   // expires mid-stream is refreshed before the retry — falls back to the
 *   // static `protocols` option when omitted.
 *   getProtocols: async () => sessionConnectAuthProtocols(await freshToken()),
 *   onMessage: (e) => console.log('frame', e.data),
 *   onStateChange: (s) => console.log('state', s),
 *   onReconnect: ({ reason, delayMs }) => {
 *     if (reason === 'rate_limited') showBanner('Too many connections — retrying…');
 *     else if (reason === 'idle_watchdog') showBanner('Connection went quiet — reconnecting…');
 *   },
 *   onError: (err) => console.error('terminal:', err.reason, err.closeCode),
 * });
 *
 * handle.send(JSON.stringify({ type: 'user_text', text: 'hi' }));
 * await handle.done;  // resolves after handle.close() or terminal error
 * ```
 */
export function createReconnectingWebSocket(
  options: ReconnectingWebSocketOptions,
): ReconnectingWebSocketHandle {
  const factory = resolveWebSocketFactory(options.webSocketFactory)
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const maxReconnects = options.maxReconnects ?? DEFAULT_MAX_RECONNECTS
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS

  const localController = new AbortController()
  if (options.signal) {
    if (options.signal.aborted) {
      localController.abort(options.signal.reason)
    } else {
      const onAbort = (): void => localController.abort(options.signal?.reason)
      options.signal.addEventListener('abort', onAbort, { once: true })
    }
  }

  let currentSocket: WebSocket | null = null
  let state: ReconnectingWebSocketState = 'connecting'
  let errorReported = false

  function setState(next: ReconnectingWebSocketState): void {
    if (state === next) return
    state = next
    try {
      options.onStateChange?.(next)
    } catch {
      // Consumer-thrown error in onStateChange must not kill the loop.
    }
  }

  function reportError(err: ReconnectingWebSocketError): void {
    if (errorReported) return
    errorReported = true
    setState('terminal')
    try {
      options.onError?.(err)
    } catch {
      // Consumer-thrown error must not leak.
    }
  }

  const handle: ReconnectingWebSocketHandle = {
    get state() {
      return state
    },
    get done() {
      return done
    },
    send(data) {
      if (!currentSocket || currentSocket.readyState !== 1 /* OPEN */) {
        throw new Error(`Cannot send on socket in state ${state}`)
      }
      currentSocket.send(data)
    },
    close(code, reason) {
      localController.abort(new Error(reason ?? 'closed'))
      try {
        currentSocket?.close(code, reason)
      } catch {
        // Already closed; ignore.
      }
    },
  }

  const done = runLoop({
    factory,
    options,
    initialDelayMs,
    maxDelayMs,
    maxReconnects,
    idleTimeoutMs,
    signal: localController.signal,
    setState,
    reportError,
    setSocket: (s) => {
      currentSocket = s
    },
  })

  return handle
}

interface RunLoopArgs {
  factory: WebSocketFactory
  options: ReconnectingWebSocketOptions
  initialDelayMs: number
  maxDelayMs: number
  maxReconnects: number
  idleTimeoutMs: number
  signal: AbortSignal
  setState: (s: ReconnectingWebSocketState) => void
  reportError: (e: ReconnectingWebSocketError) => void
  setSocket: (s: WebSocket | null) => void
}

interface ConnectionOutcome {
  closeCode: number | undefined
  closeReason: string | undefined
  /** Set when the watchdog forced a close. */
  watchdogTriggered: boolean
  /** Set when the consumer explicitly aborted. */
  aborted: boolean
}

/**
 * Internal sentinel marking a pre-connect failure that the reconnect loop
 * should RETRY (not treat as terminal). Currently only a {@link
 * ReconnectingWebSocketOptions.getProtocols} rejection — a transient
 * token-refresh hiccup — qualifies. Synchronous factory throws (bad URL, no
 * global WebSocket) are NOT wrapped and remain terminal ``open_failed``.
 */
class RetryableOpenError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause })
    this.name = 'RetryableOpenError'
  }
}

async function runLoop(args: RunLoopArgs): Promise<void> {
  const { options, signal, setState, reportError, setSocket } = args
  let attempt = 0
  let delayMs = args.initialDelayMs
  // Carried from the close that ENDED the previous connection so the
  // ``onReconnect`` callback can report the originating close code and a
  // coarse reason ("idle_watchdog" / "rate_limited" / "transient"). Seeded
  // for the very first connection (attempt 0), where neither applies.
  let pendingReconnect: {
    closeCode: number | undefined
    reason: ReconnectingWebSocketReconnectReason
  } = { closeCode: undefined, reason: 'transient' }

  while (!signal.aborted) {
    if (attempt > 0) {
      setState('reconnecting')
      const sleepMs = jitter(delayMs)
      try {
        options.onReconnect?.({
          attempt,
          delayMs: sleepMs,
          closeCode: pendingReconnect.closeCode,
          reason: pendingReconnect.reason,
        })
      } catch {
        // ignore
      }
      const slept = await abortableSleep(sleepMs, signal)
      if (!slept) break
      delayMs = Math.min(delayMs * 2, args.maxDelayMs)
    }

    setState('connecting')

    let outcome: ConnectionOutcome
    try {
      outcome = await runOneConnection(args)
    } catch (err) {
      // A getProtocols() rejection is a TRANSIENT pre-connect failure (e.g. a
      // token-refresh hiccup): retry it up to the reconnect budget rather
      // than killing a long-lived stream over one bad refresh. A synchronous
      // factory throw (invalid URL, no global WebSocket) is genuinely
      // terminal — there is nothing to retry — so it fails fast as before.
      if (err instanceof RetryableOpenError && attempt < args.maxReconnects) {
        pendingReconnect = { closeCode: undefined, reason: 'transient' }
        attempt += 1
        continue
      }
      reportError(
        new ReconnectingWebSocketError(
          err instanceof Error ? err.message : 'Failed to open WebSocket',
          'open_failed',
          undefined,
          undefined,
          attempt,
        ),
      )
      return
    } finally {
      setSocket(null)
    }

    // The idle watchdog forces a close purely to PROVOKE a reconnect — its
    // synthetic close code must never be mistaken for a server-sent terminal
    // rejection. Check ``watchdogTriggered`` first so that even if the
    // watchdog code ever overlapped the terminal set, the loop still
    // reconnects (defense-in-depth; the dedicated WATCHDOG_CLOSE_CODE 4099 is
    // already outside TERMINAL_CLOSE_CODES).
    if (!outcome.watchdogTriggered) {
      // Terminal close codes are reported BEFORE the abort check because the
      // close arrived from the wire — the consumer's subsequent ``close()``
      // call (which flips signal.aborted true) must not suppress the
      // diagnostic.
      if (outcome.closeCode !== undefined && TERMINAL_CLOSE_CODES.has(outcome.closeCode)) {
        reportError(
          new ReconnectingWebSocketError(
            `Server closed with terminal code ${outcome.closeCode}: ${outcome.closeReason ?? ''}`,
            terminalReasonForCode(outcome.closeCode),
            outcome.closeCode,
            outcome.closeReason,
            attempt,
          ),
        )
        return
      }

      if (outcome.aborted || signal.aborted) {
        setState('closed')
        return
      }
    } else if (signal.aborted) {
      // Watchdog fired but the consumer also aborted in the same tick — honor
      // the abort and stop, do not reconnect into a torn-down stream.
      setState('closed')
      return
    }

    if (attempt >= args.maxReconnects) {
      reportError(
        new ReconnectingWebSocketError(
          `Reconnect budget exhausted (${args.maxReconnects} attempts)`,
          'reconnect_budget_exhausted',
          outcome.closeCode,
          outcome.closeReason,
          attempt,
        ),
      )
      return
    }

    const isRateLimited =
      outcome.closeCode !== undefined && RATE_LIMITED_CLOSE_CODES.has(outcome.closeCode)
    if (isRateLimited) {
      // Pin the floor up so we do not hammer the server we just got
      // throttled by. Honor whichever is larger between the current
      // exponential delay and the rate-limited floor.
      delayMs = Math.max(delayMs, RATE_LIMITED_FLOOR_MS)
    }

    pendingReconnect = {
      closeCode: outcome.closeCode,
      reason: outcome.watchdogTriggered
        ? 'idle_watchdog'
        : isRateLimited
          ? 'rate_limited'
          : 'transient',
    }

    attempt += 1
  }

  setState('closed')
}

/**
 * Map a terminal close code to the {@link ReconnectingWebSocketErrorReason}
 * surfaced on ``onError``. 4403 / 4100 are auth rejections; everything else
 * in the terminal set is a client-side / target-not-found error.
 */
function terminalReasonForCode(code: number): ReconnectingWebSocketErrorReason {
  if (code === 4403 || code === 4100) return 'auth'
  return 'client_error'
}

async function runOneConnection(args: RunLoopArgs): Promise<ConnectionOutcome> {
  const { options, factory, signal, setState, setSocket, idleTimeoutMs } = args

  // Resolve subprotocols freshly per (re)connect when a provider is given so
  // an expired bearer token is replaced before each attempt; otherwise reuse
  // the static value frozen at subscribe time (backward compatible). A
  // provider rejection is wrapped as a RetryableOpenError so the loop treats
  // a transient token-refresh hiccup as reconnectable rather than terminal.
  let protocols: string | string[] | undefined
  if (options.getProtocols) {
    try {
      protocols = await options.getProtocols()
    } catch (err) {
      throw new RetryableOpenError(err instanceof Error ? err.message : 'getProtocols failed', err)
    }
  } else {
    protocols = options.protocols
  }

  let socket: WebSocket
  try {
    socket = factory(options.url, protocols)
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err))
  }
  setSocket(socket)

  return new Promise<ConnectionOutcome>((resolve) => {
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null
    let resolved = false

    function clearWatchdog(): void {
      if (watchdogTimer !== null) {
        clearTimeout(watchdogTimer)
        watchdogTimer = null
      }
    }

    function armWatchdog(): void {
      if (idleTimeoutMs <= 0) return
      clearWatchdog()
      watchdogTimer = setTimeout(() => {
        if (resolved) return
        // Finalize FIRST (flips ``resolved`` and detaches the ``close``
        // listener) so that a runtime which dispatches the ``close`` event
        // synchronously from ``socket.close()`` cannot re-enter ``onClose``
        // and overwrite the outcome with ``watchdogTriggered: false``. The
        // outcome must record the watchdog as the cause so the loop reconnects
        // with the ``idle_watchdog`` reason rather than misclassifying it.
        finalize({
          closeCode: WATCHDOG_CLOSE_CODE,
          closeReason: 'idle timeout',
          watchdogTriggered: true,
          aborted: false,
        })
        try {
          socket.close(WATCHDOG_CLOSE_CODE, 'idle timeout')
        } catch {
          // already closed
        }
      }, idleTimeoutMs)
    }

    function finalize(outcome: ConnectionOutcome): void {
      if (resolved) return
      resolved = true
      clearWatchdog()
      signal.removeEventListener('abort', onAbort)
      try {
        socket.removeEventListener('open', onOpen)
        socket.removeEventListener('message', onMessage)
        socket.removeEventListener(
          'close',
          onClose as unknown as Parameters<WebSocket['removeEventListener']>[1],
        )
        socket.removeEventListener('error', onSocketError)
      } catch {
        // best effort
      }
      resolve(outcome)
    }

    function onOpen(): void {
      setState('open')
      armWatchdog()
    }

    function onMessage(ev: MessageEvent): void {
      armWatchdog()
      try {
        options.onMessage(ev)
      } catch {
        // Consumer-thrown error in onMessage must not kill the loop;
        // the connection is still healthy.
      }
    }

    // CloseEvent is not in lib: ESNext + @types/node — accept a structural
    // shape with just the fields we read so this works in browser, Bun,
    // Deno, Node ws library, and the WHATWG ws polyfill alike.
    function onClose(ev: { code?: number; reason?: string }): void {
      setState('closed')
      finalize({
        closeCode: ev.code,
        closeReason: ev.reason,
        watchdogTriggered: false,
        aborted: false,
      })
    }

    function onSocketError(): void {
      // The browser/Node WebSocket fires 'error' before 'close' on transport
      // failures. We don't terminate here — the close handler will run with
      // a meaningful close code and we want one resolution path.
    }

    function onAbort(): void {
      try {
        socket.close(1000, 'client aborted')
      } catch {
        // already closed
      }
      finalize({
        closeCode: undefined,
        closeReason: undefined,
        watchdogTriggered: false,
        aborted: true,
      })
    }

    if (signal.aborted) {
      onAbort()
      return
    }

    socket.addEventListener('open', onOpen)
    socket.addEventListener('message', onMessage)
    // ``addEventListener`` accepts a ``CloseEvent``-shaped handler; we cast
    // through ``unknown`` because lib: ESNext + @types/node doesn't expose
    // a global ``CloseEvent`` / ``EventListener`` in every supported runtime.
    socket.addEventListener(
      'close',
      onClose as unknown as Parameters<WebSocket['addEventListener']>[1],
    )
    socket.addEventListener('error', onSocketError)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function resolveWebSocketFactory(factory: WebSocketFactory | undefined): WebSocketFactory {
  if (factory) return factory
  const globalWs = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket
  if (!globalWs) {
    return () => {
      throw new Error(
        'No global WebSocket available; pass webSocketFactory to createReconnectingWebSocket',
      )
    }
  }
  return (url, protocols) => new globalWs(url, protocols)
}

function jitter(ms: number): number {
  return Math.floor(Math.random() * Math.max(1, ms))
}

async function abortableSleep(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(true)
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve(false)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
