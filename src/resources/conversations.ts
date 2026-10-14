import { ConfigurationError } from '../core/errors.js'
import { type PlatformFetch } from '../core/openapi-client.js'
import type { components } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type ChannelKind = components['schemas']['ChannelKind']
export type ConversationDetail = components['schemas']['ConversationDetail']
export type ConversationTurn = components['schemas']['ConversationTurn']
export type ConversationTurnAvailableAction =
  components['schemas']['ConversationTurnAvailableAction']
export type ConversationTurnStateTransition =
  components['schemas']['ConversationTurnStateTransition']
export type CreateConversationRequest = components['schemas']['CreateConversationRequest']
export type SwitchChannelRequest = components['schemas']['SwitchChannelRequest']
export type TurnRequest = components['schemas']['TurnRequest']
export type TurnResponse = components['schemas']['TurnResponse']
export type TurnConversationSnapshot = components['schemas']['TurnConversationSnapshot']
export type TurnStreamEvent = components['schemas']['TurnStreamEvent']
export type TurnTokenEvent = components['schemas']['TurnTokenEvent']
export type TurnArtifactEvent = components['schemas']['TurnArtifactEvent']
export type TurnToolCallStartedEvent = components['schemas']['TurnToolCallStartedEvent']
export type TurnToolCallCompletedEvent = components['schemas']['TurnToolCallCompletedEvent']
export type TurnThinkingEvent = components['schemas']['TurnThinkingEvent']
export type TurnMessageEvent = components['schemas']['TurnMessageEvent']
export type TurnStateTransitionEvent = components['schemas']['TurnStateTransitionEvent']
export type TurnStateEvent = components['schemas']['TurnStateEvent']
export type TurnDoneEvent = components['schemas']['TurnDoneEvent']
export type TurnErrorEvent = components['schemas']['TurnErrorEvent']

/**
 * Hand-authored because the text-stream WebSocket endpoint is intentionally
 * outside the generated OpenAPI REST snapshot.
 * TODO: replace with generated types when `/agent/text-stream` is added to
 * openapi.json.
 *
 * @beta The text-stream WebSocket contract may evolve independently of the REST API.
 */
export interface TextStreamUrlParams {
  serviceId: string
  conversationId?: string
  entityId?: string
  /**
   * Enable `tool_call_started` and `tool_call_completed` frames on the
   * text-stream WebSocket so the client can render tool invocations in
   * real time.
   */
  toolEvents?: boolean
  /**
   * Bearer token query-param fallback for clients whose API key cannot be sent
   * as a WebSocket subprotocol token. Prefer textStreamAuthProtocols() when
   * the token is subprotocol-safe so secrets do not appear in URLs. The SDK
   * intentionally accepts only the server-supported text-stream token alphabet
   * (letters, digits, `.`, `_`, `+`, `=`, `/`, `:`, `-`) even though
   * URLSearchParams can percent-encode additional characters.
   */
  token?: string
  /**
   * Full text-stream URL override for preview/custom ingress.
   * Defaults to `${baseUrl origin}/agent/text-stream` with
   * `http` mapped to `ws` and `https` mapped to `wss`.
   */
  textStreamUrl?: string
}

/** @beta The text-stream WebSocket contract may evolve independently of the REST API. */
export type TextStreamAuthProtocols = readonly ['auth', string]

/**
 * Hand-authored because the workspace-scoped session-connect WebSocket is
 * intentionally outside the generated OpenAPI REST snapshot.
 *
 * Path: ``WS /v1/{workspace_id}/sessions/connect``. Authentication is delivered
 * via the ``Sec-WebSocket-Protocol: auth, <token>`` subprotocol header — the
 * server rejects query-param tokens to keep credentials out of URLs and proxy
 * logs. ``serviceId`` and ``entityId`` are required path/query inputs.
 *
 * @beta The session-connect WebSocket contract may evolve independently of the REST API.
 */
export interface SessionConnectUrlParams {
  serviceId: string
  entityId: string
  conversationId?: string
  /**
   * Emit ``tool_call_started`` and ``tool_call_completed`` frames so the client
   * can render tool invocations in real time. Server defaults to ``true`` when
   * the param is omitted; the SDK only sets it explicitly when the caller asks
   * to disable tool events.
   */
  toolEvents?: boolean
  /**
   * Full session-connect URL override for preview/custom ingress. Defaults to
   * ``${baseUrl origin}/v1/{workspace_id}/sessions/connect`` with ``http`` mapped
   * to ``ws`` and ``https`` mapped to ``wss``. The override must be an
   * absolute ws/wss URL with no query string or fragment — SDK-managed query
   * params are appended by the helper.
   */
  sessionConnectUrl?: string
}

const MAX_AUTH_TOKEN_CHARS = 4096
const TEXT_STREAM_AUTH_TOKEN_RE = /^[-A-Za-z0-9._+=/:]+$/
const WEB_SOCKET_PROTOCOL_TOKEN_RE = /^[!#$%&'*+\-.^_`|~A-Za-z0-9]+$/

/** Access text conversation APIs and text-stream URL helpers. */
export class ConversationsResource extends WorkspaceScopedResource {
  private readonly agentBaseUrl: string | undefined

  constructor(client: PlatformFetch, workspaceId: string, agentBaseUrl?: string) {
    super(client, workspaceId)
    this.agentBaseUrl = agentBaseUrl
  }

  async create(request: CreateConversationRequest): Promise<ConversationDetail> {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/conversations', {
        params: { path: { workspace_id: this.workspaceId } },
        body: request,
      }),
    )
  }

  /**
   * Fetch a conversation's detail, including its turns.
   *
   * Pass `options.includeToolCalls: true` to include per-turn `tool_calls`
   * metadata on the returned turns. Server-side default is `false` — without
   * this opt-in the `tool_calls` arrays will be empty even when the agent
   * invoked tools, matching the `createTurn` opt-in.
   */
  async get(
    conversationId: string,
    options?: { includeToolCalls?: boolean },
  ): Promise<ConversationDetail> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/conversations/{conversation_id}', {
        params: {
          path: { workspace_id: this.workspaceId, conversation_id: conversationId },
          ...(options?.includeToolCalls !== undefined && {
            query: { include_tool_calls: options.includeToolCalls },
          }),
        },
      }),
    )
  }

  async close(conversationId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/conversations/{conversation_id}', {
      params: {
        path: { workspace_id: this.workspaceId, conversation_id: conversationId },
      },
    })
  }

  /**
   * Move a conversation to a different channel (e.g. web → sms/imessage).
   *
   * `recipient` (E.164) is required when switching to sms/imessage. Pass
   * `dispatch_opener: true` to have the agent immediately send one turn on
   * the new channel, optionally steered by `instruction`.
   */
  async switchChannel(
    conversationId: string,
    request: SwitchChannelRequest,
  ): Promise<ConversationDetail> {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/conversations/{conversation_id}/channel', {
        params: {
          path: { workspace_id: this.workspaceId, conversation_id: conversationId },
        },
        body: request,
      }),
    )
  }

  /**
   * Send a user message and receive the agent's synchronous JSON response.
   *
   * Pass `options.includeToolCalls: true` to request tool-call metadata
   * alongside the response turns. Server-side default is `false` — without
   * this opt-in the `tool_calls` array on the `TurnResponse` will be empty
   * even when the agent invoked tools during the turn.
   *
   * Pass `options.poll: true` for a no-message drain-and-report poll (see
   * {@link pollTurn} for the ergonomic wrapper): the agent surfaces any
   * background tool results that completed since the last turn. A poll must
   * NOT carry a `request.message` (the server rejects it 422); prefer
   * {@link pollTurn}.
   */
  async createTurn(
    conversationId: string,
    request: TurnRequest,
    options?: { includeToolCalls?: boolean; poll?: boolean },
  ): Promise<TurnResponse> {
    if (options?.poll && request.message) {
      // The server rejects poll + message with 422; fail fast with a clear
      // SDK-level error instead of an opaque round-trip. Use pollTurn().
      throw new ConfigurationError('poll cannot be combined with a message; use pollTurn() instead')
    }
    const query: { include_tool_calls?: boolean; poll?: boolean } = {}
    if (options?.includeToolCalls !== undefined) query.include_tool_calls = options.includeToolCalls
    if (options?.poll !== undefined) query.poll = options.poll
    return extractData(
      await this.client.POST('/v1/{workspace_id}/conversations/{conversation_id}/turns', {
        params: {
          path: { workspace_id: this.workspaceId, conversation_id: conversationId },
          ...(Object.keys(query).length > 0 && { query }),
        },
        body: request,
        headers: { Accept: 'application/json' },
      }),
    ) as TurnResponse
  }

  /**
   * Poll a conversation for background tool results without sending a user
   * message. Drains any background tool calls that completed since the last
   * turn and returns the agent's report; when nothing is pending the response
   * has empty `output` and `tool_calls` (the idle case) — treat that as "keep
   * polling". Poll no more than once every ~5s per conversation.
   *
   * @example
   * ```ts
   * const res = await client.conversations.pollTurn(convId, { includeToolCalls: true });
   * if (res.output.length || res.tool_calls?.length) render(res); // else poll again later
   * ```
   */
  async pollTurn(
    conversationId: string,
    options?: { includeToolCalls?: boolean },
  ): Promise<TurnResponse> {
    return this.createTurn(conversationId, {}, { ...options, poll: true })
  }

  /**
   * Send a message and receive the agent's response as an SSE byte stream.
   *
   * Targets the explicit always-SSE endpoint
   * `POST /v1/{ws}/conversations/{id}/turns/stream`, so the response is
   * always `text/event-stream` regardless of `Accept` negotiation. Returns
   * a `ReadableStream` of raw bytes; use `EventSourceParserStream` (from
   * `eventsource-parser/stream`) to parse into typed `TurnStreamEvent`,
   * or use the higher-level {@link streamTurn} which hides the parser.
   *
   * @example
   * ```ts
   * const stream = await client.conversations.createTurnStream(convId, { message: "Hello" });
   * const events = stream
   *   .pipeThrough(new TextDecoderStream())
   *   .pipeThrough(new EventSourceParserStream());
   * for await (const event of events) {
   *   const parsed = JSON.parse(event.data) as TurnStreamEvent;
   *   if (parsed.event === "token") console.log(parsed.text);
   * }
   * ```
   */
  async createTurnStream(
    conversationId: string,
    request: TurnRequest,
    options?: { signal?: AbortSignal; includeToolCalls?: boolean },
  ): Promise<ReadableStream<Uint8Array>> {
    const result = await this.client.POST(
      '/v1/{workspace_id}/conversations/{conversation_id}/turns/stream',
      {
        params: {
          path: { workspace_id: this.workspaceId, conversation_id: conversationId },
          ...(options?.includeToolCalls !== undefined && {
            query: { include_tool_calls: options.includeToolCalls },
          }),
        },
        body: request,
        parseAs: 'stream',
        signal: options?.signal,
      },
    )
    if (result.error !== undefined) {
      throw new Error(`API error: ${JSON.stringify(result.error)}`)
    }
    return result.data as ReadableStream<Uint8Array>
  }

  /**
   * Send a message and receive the agent's response as a typed
   * `TurnStreamEvent` async iterable.
   *
   * The bytes-and-parser dance from `createTurnStream` is now hidden inside
   * the SDK — consumers iterate strongly typed events directly. Each yielded
   * value is a member of the `TurnStreamEvent` discriminated union (`token`,
   * `thinking`, `tool_call_started`, `tool_call_completed`, `artifact`,
   * `message`, `state_transition`, `state`, `done`, `error`), validated as a
   * record with a known `event` discriminator. Unknown / malformed frames are
   * dropped silently — this matches the wire-format-drift behavior of the
   * lower-level `createTurnStream` while keeping the strict `TurnStreamEvent`
   * static contract intact for consumers.
   *
   * Events arrive in the order the server sends them. Right before `done`, a
   * turn sends one `state_transition` per context-graph hop it took
   * (`from_state`, `to_state`, `exit_condition`), then a `state` event with
   * the `context_graph_state` it ended in. These are the hops and state
   * {@link createTurn} returns on `output[0].state_transitions` (as `from`
   * and `to`) and `conversation.context_graph_state`.
   *
   * @example
   * ```ts
   * for await (const event of client.conversations.streamTurn(convId, { message: "Hello" })) {
   *   if (event.event === "token") process.stdout.write(event.text);
   *   else if (event.event === "done") break;
   * }
   * ```
   */
  async *streamTurn(
    conversationId: string,
    request: TurnRequest,
    options?: { signal?: AbortSignal; includeToolCalls?: boolean },
  ): AsyncGenerator<TurnStreamEvent> {
    const byteStream = await this.createTurnStream(conversationId, request, options)
    for await (const frame of parseSSEFrames(byteStream)) {
      const event = parseTurnStreamFrame(frame.event, frame.data)
      if (event) yield event
    }
  }

  /** Build the real-time text WebSocket URL for browser or custom clients. */
  textStreamUrl(params: TextStreamUrlParams): string {
    const url = buildTextStreamUrl({
      baseUrl: this.agentBaseUrl ?? this.platformBaseUrl,
      workspaceId: this.workspaceId,
      ...params,
    })
    return url.toString()
  }

  /**
   * Build the URL for the workspace-scoped session-connect WebSocket
   * (``WS /v1/{workspace_id}/sessions/connect``).
   *
   * Pair the returned URL with {@link sessionConnectAuthProtocols} so the
   * bearer token is delivered via the ``Sec-WebSocket-Protocol`` header — the
   * endpoint rejects query-param tokens to keep credentials out of URLs.
   *
   * @example
   * ```ts
   * const url = client.conversations.sessionConnectUrl({
   *   serviceId: SERVICE_ID,
   *   entityId: ENTITY_ID,
   *   conversationId: existingConversationId, // optional resume
   * });
   * const ws = new WebSocket(url, sessionConnectAuthProtocols(apiKey));
   * ```
   */
  sessionConnectUrl(params: SessionConnectUrlParams): string {
    const url = buildSessionConnectUrl({
      baseUrl: this.platformBaseUrl,
      workspaceId: this.workspaceId,
      ...params,
    })
    return url.toString()
  }
}

/**
 * Build browser WebSocket subprotocols for text-stream authentication.
 *
 * @remarks The returned tuple contains the raw API key. Do not log, persist,
 * serialize, or otherwise expose this value.
 *
 * @security The second subprotocol entry is the bearer secret.
 */
export function textStreamAuthProtocols(apiKey: string): TextStreamAuthProtocols {
  const token = validateTextStreamAuthToken(apiKey, 'apiKey')
  if (!WEB_SOCKET_PROTOCOL_TOKEN_RE.test(token)) {
    const invalidChars = describeInvalidSubprotocolChars(token)
    throw new ConfigurationError(
      `apiKey contains characters browsers reject in WebSocket subprotocols (${invalidChars}); use the token option on client.conversations.textStreamUrl() instead for keys containing these characters, only in trusted contexts where URLs are not logged in browser history, server access logs, HTTP proxy logs, or referrer headers`,
    )
  }
  return ['auth', token] as const
}

/**
 * Build browser WebSocket subprotocols for the workspace-scoped session-connect
 * endpoint (``WS /v1/{workspace_id}/sessions/connect``).
 *
 * The wire format is identical to {@link textStreamAuthProtocols} — both
 * endpoints expect ``Sec-WebSocket-Protocol: auth, <token>`` — but the
 * session-connect endpoint has no query-param token fallback, so the API key
 * MUST round-trip through this subprotocol pair. Keys containing characters
 * browsers reject in subprotocols (e.g. ``:``, ``/``, ``=``) cannot be used
 * with the session-connect endpoint and must instead use the legacy
 * ``textStreamUrl`` path.
 *
 * @remarks The returned tuple contains the raw API key. Do not log, persist,
 * serialize, or otherwise expose this value.
 *
 * @security The second subprotocol entry is the bearer secret.
 */
export function sessionConnectAuthProtocols(apiKey: string): TextStreamAuthProtocols {
  return textStreamAuthProtocols(apiKey)
}

function buildTextStreamUrl({
  baseUrl,
  workspaceId,
  serviceId,
  conversationId,
  entityId,
  toolEvents,
  token,
  textStreamUrl: textStreamUrlOverride,
}: TextStreamUrlParams & { baseUrl: string; workspaceId: string }): URL {
  const url = textStreamUrlOverride
    ? parseTextStreamUrlOverride(textStreamUrlOverride)
    : deriveTextStreamUrl(baseUrl)
  url.searchParams.set('workspace_id', workspaceId)
  url.searchParams.set('service_id', serviceId)
  if (conversationId) url.searchParams.set('conversation_id', conversationId)
  if (entityId) url.searchParams.set('entity_id', entityId)
  if (toolEvents) url.searchParams.set('tool_events', 'true')
  if (token !== undefined)
    url.searchParams.set('token', validateTextStreamAuthToken(token, 'token'))
  return url
}

function validateTextStreamAuthToken(token: string, label: string): string {
  if (!token.trim()) {
    throw new ConfigurationError(`${label} is required for text-stream authentication`)
  }
  if (token.length > MAX_AUTH_TOKEN_CHARS || !TEXT_STREAM_AUTH_TOKEN_RE.test(token)) {
    throw new ConfigurationError(
      `${label} contains characters rejected by text-stream authentication`,
    )
  }
  return token
}

function parseTextStreamUrlOverride(textStreamUrl: string): URL {
  try {
    const url = new URL(textStreamUrl)
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      throw new ConfigurationError('textStreamUrl overrides must use ws: or wss: URLs')
    }
    // Fragment rejection is defensive; WHATWG URL parsing normalizes most
    // WebSocket fragments away, but callers should never rely on fragments here.
    if (url.search || url.hash) {
      throw new ConfigurationError(
        'textStreamUrl overrides must not include query parameters or fragments; pass SDK-managed fields through textStreamUrl() options',
      )
    }
    return url
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause
    throw new ConfigurationError(
      `textStreamUrl must be an absolute URL for text-stream overrides: ${String(cause)}`,
    )
  }
}

function deriveTextStreamUrl(baseUrl: string): URL {
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(baseUrl)) {
    throw new ConfigurationError(
      'textStreamUrl cannot be derived from a relative baseUrl; pass agentBaseUrl or textStreamUrl explicitly',
    )
  }

  const url = new URL(baseUrl)
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    // Already a WebSocket URL (e.g. from agentBaseUrl) — use directly
  } else if (url.protocol === 'http:' || url.protocol === 'https:') {
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  } else {
    throw new ConfigurationError(
      'textStreamUrl can only be derived from an http, https, ws, or wss baseUrl; pass textStreamUrl explicitly',
    )
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new ConfigurationError(
      'textStreamUrl can only be derived from an origin-only baseUrl; pass agentBaseUrl as an origin or textStreamUrl explicitly when using path-prefixed gateways',
    )
  }
  // Text streaming is served by agent-engine ingress, regardless of any REST
  // API path segments on the configured base URL.
  url.pathname = '/agent/text-stream'
  url.search = ''
  url.hash = ''
  return url
}

function buildSessionConnectUrl({
  baseUrl,
  workspaceId,
  serviceId,
  entityId,
  conversationId,
  toolEvents,
  sessionConnectUrl: sessionConnectUrlOverride,
}: SessionConnectUrlParams & { baseUrl: string; workspaceId: string }): URL {
  const url = sessionConnectUrlOverride
    ? parseSessionConnectUrlOverride(sessionConnectUrlOverride)
    : deriveSessionConnectUrl(baseUrl, workspaceId)
  url.searchParams.set('service_id', serviceId)
  url.searchParams.set('entity_id', entityId)
  if (conversationId) url.searchParams.set('conversation_id', conversationId)
  // Server defaults tool_events to true. Only emit the param when the caller
  // explicitly disables it, so default URLs stay minimal and existing tests
  // can assert exact URLs without incidental query keys.
  if (toolEvents === false) url.searchParams.set('tool_events', 'false')
  return url
}

function parseSessionConnectUrlOverride(sessionConnectUrl: string): URL {
  try {
    const url = new URL(sessionConnectUrl)
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      throw new ConfigurationError('sessionConnectUrl overrides must use ws: or wss: URLs')
    }
    if (url.search || url.hash) {
      throw new ConfigurationError(
        'sessionConnectUrl overrides must not include query parameters or fragments; pass SDK-managed fields through sessionConnectUrl() options',
      )
    }
    return url
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause
    throw new ConfigurationError(
      `sessionConnectUrl must be an absolute URL for session-connect overrides: ${String(cause)}`,
    )
  }
}

function deriveSessionConnectUrl(baseUrl: string, workspaceId: string): URL {
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(baseUrl)) {
    throw new ConfigurationError(
      'sessionConnectUrl cannot be derived from a relative baseUrl; pass sessionConnectUrl explicitly',
    )
  }

  const url = new URL(baseUrl)
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    // Already a WebSocket URL — use directly.
  } else if (url.protocol === 'http:' || url.protocol === 'https:') {
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  } else {
    throw new ConfigurationError(
      'sessionConnectUrl can only be derived from an http, https, ws, or wss baseUrl; pass sessionConnectUrl explicitly',
    )
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new ConfigurationError(
      'sessionConnectUrl can only be derived from an origin-only baseUrl; pass sessionConnectUrl explicitly when using path-prefixed gateways',
    )
  }
  url.pathname = `/v1/${workspaceId}/sessions/connect`
  url.search = ''
  url.hash = ''
  return url
}

function describeInvalidSubprotocolChars(token: string): string {
  const chars = new Set<string>()
  for (const char of token) {
    // Single-character regex checks are intentional: the regex is anchored for
    // full-token validation, and here we need only the offending characters.
    if (!WEB_SOCKET_PROTOCOL_TOKEN_RE.test(char)) chars.add(char)
  }
  return [...chars].map((char) => JSON.stringify(char)).join(', ')
}

// ---------------------------------------------------------------------------
// Inline SSE parser
//
// Implemented inline rather than depending on `eventsource-parser` so the SDK
// stays at two runtime deps (`openapi-fetch`, `openapi-typescript-helpers`).
// SSE is simple enough that a ~30-line state machine reads cleaner than a
// transitive bundle increase. Spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
// (handled fields: `event`, `data`; comments and `id`/`retry` are ignored).
// ---------------------------------------------------------------------------

interface SSEFrame {
  event: string
  data: string
}

async function* parseSSEFrames(stream: ReadableStream<Uint8Array>): AsyncGenerator<SSEFrame> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function* drain(text: string): Generator<SSEFrame> {
    buffer += text
    // Frames are terminated by a blank line (\n\n or \r\n\r\n).
    while (true) {
      const idx = findFrameTerminator(buffer)
      if (idx === null) break
      const block = buffer.slice(0, idx.terminatorStart)
      buffer = buffer.slice(idx.terminatorEnd)
      const frame = parseSSEBlock(block)
      if (frame) yield frame
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield* drain(decoder.decode(value, { stream: true }))
    }
    // Flush any partial decode + handle a final frame missing the trailing
    // blank line (defensive — well-behaved servers always terminate).
    yield* drain(decoder.decode())
    if (buffer.trim().length > 0) {
      const frame = parseSSEBlock(buffer)
      if (frame) yield frame
      buffer = ''
    }
  } finally {
    reader.releaseLock()
  }
}

function findFrameTerminator(s: string): { terminatorStart: number; terminatorEnd: number } | null {
  // Prefer LF-LF; fall back to CRLF-CRLF if the server is using CRLF
  // line endings end-to-end.
  const lf = s.indexOf('\n\n')
  const crlf = s.indexOf('\r\n\r\n')
  if (lf < 0 && crlf < 0) return null
  if (lf < 0) return { terminatorStart: crlf, terminatorEnd: crlf + 4 }
  if (crlf < 0) return { terminatorStart: lf, terminatorEnd: lf + 2 }
  return lf < crlf
    ? { terminatorStart: lf, terminatorEnd: lf + 2 }
    : { terminatorStart: crlf, terminatorEnd: crlf + 4 }
}

function parseSSEBlock(block: string): SSEFrame | null {
  let event = ''
  const dataLines: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line === '' || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
    // `id`, `retry`, and unknown fields are ignored — we only need the
    // discriminator + payload for the typed event surface.
  }
  if (!event || dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

// ---------------------------------------------------------------------------
// TurnStreamEvent frame validator
//
// Drift-tolerant: an unknown `event` discriminator or a non-object payload
// is dropped silently (matches the behavior of the lower-level
// `createTurnStream` plus consumer-side parsing). The strict
// `TurnStreamEvent` static contract is preserved for downstream callers
// because we only yield values whose `event` discriminator is one of the
// known union members.
// ---------------------------------------------------------------------------

// Keyed by the generated union, so a spec regen that adds or removes a
// `TurnStreamEvent` member fails typecheck here instead of silently dropping
// the new frame.
const KNOWN_TURN_STREAM_EVENTS = {
  token: true,
  artifact: true,
  thinking: true,
  tool_call_started: true,
  tool_call_completed: true,
  message: true,
  state_transition: true,
  state: true,
  done: true,
  error: true,
} as const satisfies Record<TurnStreamEvent['event'], true>

function parseTurnStreamFrame(eventName: string, dataJson: string): TurnStreamEvent | null {
  if (!Object.hasOwn(KNOWN_TURN_STREAM_EVENTS, eventName)) return null
  let payload: unknown
  try {
    payload = JSON.parse(dataJson)
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  // Server omits the discriminator from the JSON body (it lives in the SSE
  // `event:` line). Reattach it so the union member is well-formed.
  return { ...(payload as Record<string, unknown>), event: eventName } as TurnStreamEvent
}
