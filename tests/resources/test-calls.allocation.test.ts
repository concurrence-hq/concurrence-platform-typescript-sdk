import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AmigoClient,
  ConfigurationError,
  ParseError,
  RateLimitError,
  ServiceUnavailableError,
} from '../../src/index.js'
import type { TestCallStartOptions } from '../../src/index.js'
import type { WebSocketFactory } from '../../src/core/reconnecting-websocket.js'

/**
 * Contract of the agent engine's allocation route, taken from
 * ``services/agent-engine/src/routes/test_call_start.py``:
 *
 *   POST /agent/test-call/start  {workspace_id, service_id, caller_id?, context?}
 *   -> {ws_url, call_sid, actor_token: ""}
 *   ws_url = wss://<gameserver>.<actor suffix>/agent/test-call
 *            ?workspace_id&service_id&encoding=mulaw&sample_rate=8000
 *            &allocation_id[&caller_id][&context_ref]
 *
 * The dispatcher that serves the standard ingress mounts only the start route;
 * the WebSocket lives on the allocated runner.
 */
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111'
const SERVICE_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_CREDENTIAL = 'client.identity.jwt'
const TOKEN = 'header.payload.signature'
const AGENT_ORIGIN = 'https://agent.example.com'
const ACTOR_HOST = 'gs-abc12.actors.example.com'
const CONTEXT_REF = 'ctxref-do-not-log'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  binaryType: 'arraybuffer' | 'blob' = 'blob'
  readyState = 0
  closeArgs: [number | undefined, string | undefined] | null = null
  private readonly listeners = new Map<string, Set<(event: never) => void>>()

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(): void {}

  close(code?: number, reason?: string): void {
    this.closeArgs = [code, reason]
    this.readyState = 3
    for (const listener of this.listeners.get('close') ?? []) {
      listener({ code: code ?? 1000, reason: reason ?? '', wasClean: true } as never)
    }
  }
}

const webSocketFactory: WebSocketFactory = (url, protocols) =>
  new FakeWebSocket(url, protocols) as unknown as WebSocket

function allocatedUrl(overrides: Record<string, string | null> = {}, base?: string): string {
  const query = new URLSearchParams({
    workspace_id: WORKSPACE_ID,
    service_id: SERVICE_ID,
    encoding: 'mulaw',
    sample_rate: '8000',
    allocation_id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  })
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) query.delete(key)
    else query.set(key, value)
  }
  return `${base ?? `wss://${ACTOR_HOST}/agent/test-call`}?${query.toString()}`
}

function allocationBody(wsUrl: string = allocatedUrl()): Record<string, unknown> {
  return { ws_url: wsUrl, call_sid: 'test-0123456789abcdef', actor_token: '' }
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

type FetchMock = ReturnType<typeof vi.fn<(request: Request) => Promise<Response>>>

function createClient(
  fetchMock: FetchMock,
  config: { agentBaseUrl?: string | null; maxRetries?: number } = {},
): AmigoClient {
  return new AmigoClient({
    apiKey: CLIENT_CREDENTIAL,
    workspaceId: WORKSPACE_ID,
    baseUrl: 'https://platform.example.com',
    ...(config.agentBaseUrl === null ? {} : { agentBaseUrl: config.agentBaseUrl ?? AGENT_ORIGIN }),
    ...(config.maxRetries === undefined ? {} : { maxRetries: config.maxRetries }),
    fetch: fetchMock as unknown as typeof fetch,
  })
}

function startOptions(overrides: Partial<TestCallStartOptions> = {}): TestCallStartOptions {
  return { serviceId: SERVICE_ID, token: TOKEN, onAudio: vi.fn(), webSocketFactory, ...overrides }
}

function respondWith(body: unknown, status = 200, headers: Record<string, string> = {}): FetchMock {
  return vi.fn(async (_request: Request) => jsonResponse(body, status, headers))
}

describe('TestCallsResource.start (allocated test calls)', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
  })

  it('allocates on the agent engine, then opens the server-issued actor URL unchanged', async () => {
    const wsUrl = allocatedUrl({ caller_id: '+15555550123', context_ref: CONTEXT_REF })
    const fetchMock = respondWith(allocationBody(wsUrl))
    const context = { member_id: 'm-1', plan_tier: 'gold' }

    const call = await createClient(fetchMock).testCalls.start(
      startOptions({ callerId: ' +15555550123 ', context }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = fetchMock.mock.calls[0]![0]
    expect(request.method).toBe('POST')
    expect(request.url).toBe(`${AGENT_ORIGIN}/agent/test-call/start`)
    expect(request.headers.get('authorization')).toBe(`Bearer ${CLIENT_CREDENTIAL}`)
    expect(await request.json()).toEqual({
      workspace_id: WORKSPACE_ID,
      service_id: SERVICE_ID,
      caller_id: '+15555550123',
      context,
    })

    expect(FakeWebSocket.instances).toHaveLength(1)
    const socket = FakeWebSocket.instances[0]!
    // Every server-issued parameter survives, including allocation_id and context_ref.
    expect(socket.url).toBe(wsUrl)
    expect(new URL(socket.url).searchParams.get('allocation_id')).toBe(
      'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    )
    expect(new URL(socket.url).searchParams.get('context_ref')).toBe(CONTEXT_REF)
    expect(socket.protocols).toEqual(['auth', TOKEN])
    expect(socket.url).not.toContain(TOKEN)
    expect(socket.binaryType).toBe('arraybuffer')
    expect(call.callSid).toBe('test-0123456789abcdef')
    expect(call.readyState).toBe(0)
  })

  it('omits caller_id and context from the body when they are not given', async () => {
    const fetchMock = respondWith(allocationBody())
    await createClient(fetchMock).testCalls.start(startOptions())
    expect(await fetchMock.mock.calls[0]![0].json()).toEqual({
      workspace_id: WORKSPACE_ID,
      service_id: SERVICE_ID,
    })
  })

  it('direct connect targets the dispatcher origin without an allocation; start does not', async () => {
    const fetchMock = respondWith(allocationBody())
    const client = createClient(fetchMock)

    const direct = new URL(client.testCalls.url({ serviceId: SERVICE_ID }))
    expect(direct.host).toBe('agent.example.com')
    expect(direct.searchParams.has('allocation_id')).toBe(false)

    await client.testCalls.start(startOptions())
    const allocated = new URL(FakeWebSocket.instances[0]!.url)
    expect(allocated.host).toBe(ACTOR_HOST)
    expect(allocated.searchParams.get('allocation_id')).toBeTruthy()
    expect(allocated.searchParams.get('encoding')).toBe('mulaw')
    expect(allocated.searchParams.get('sample_rate')).toBe('8000')
  })

  it('maps a wss agentBaseUrl to https for the allocation request', async () => {
    const fetchMock = respondWith(allocationBody())
    await createClient(fetchMock, { agentBaseUrl: 'wss://agent.example.com/' }).testCalls.start(
      startOptions(),
    )
    expect(fetchMock.mock.calls[0]![0].url).toBe(`${AGENT_ORIGIN}/agent/test-call/start`)
  })

  it.each([
    [429, RateLimitError, { 'retry-after': '0' }],
    [503, ServiceUnavailableError, { 'retry-after': '0' }],
  ] as const)(
    'surfaces %i once without retrying the non-idempotent allocation',
    async (status, ErrorClass, headers) => {
      const fetchMock = respondWith({ detail: 'busy' }, status, headers)
      const client = createClient(fetchMock, { maxRetries: 3 }).withOptions({
        maxRetries: 4,
        retry: { maxAttempts: 5, baseDelayMs: 1 },
      })

      await expect(client.testCalls.start(startOptions())).rejects.toBeInstanceOf(ErrorClass)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(FakeWebSocket.instances).toHaveLength(0)
    },
  )

  it('does not retry a network failure', async () => {
    const fetchMock: FetchMock = vi.fn(async () => {
      throw new TypeError('socket hang up')
    })
    await expect(
      createClient(fetchMock, { maxRetries: 3 }).testCalls.start(startOptions()),
    ).rejects.toThrow(/Network error/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('does not allocate when the signal is already aborted', async () => {
    const fetchMock = respondWith(allocationBody())
    const controller = new AbortController()
    controller.abort()
    await expect(
      createClient(fetchMock).testCalls.start(startOptions({ signal: controller.signal })),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('does not open a socket when aborted while the allocation is in flight', async () => {
    const controller = new AbortController()
    const fetchMock: FetchMock = vi.fn(async (request: Request) => {
      expect(request.signal.aborted).toBe(false)
      controller.abort()
      return jsonResponse(allocationBody())
    })
    await expect(
      createClient(fetchMock).testCalls.start(startOptions({ signal: controller.signal })),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('closes the socket when aborted after the call has started', async () => {
    const controller = new AbortController()
    const call = await createClient(respondWith(allocationBody())).testCalls.start(
      startOptions({ signal: controller.signal }),
    )
    controller.abort()
    await call.done
    expect(FakeWebSocket.instances[0]!.closeArgs).toEqual([1000, 'Aborted'])
  })

  it('never falls back to the platform API origin when agentBaseUrl is not configured', async () => {
    const fetchMock = respondWith(allocationBody())
    await expect(
      createClient(fetchMock, { agentBaseUrl: null }).testCalls.start(startOptions()),
    ).rejects.toBeInstanceOf(ConfigurationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['cleartext non-loopback origin', 'http://agent.example.com'],
    ['embedded credentials', 'https://user:pass@agent.example.com'],
    ['a path', 'https://agent.example.com/proxy'],
    ['a query', 'https://agent.example.com/?x=1'],
    ['an unsupported scheme', 'ftp://agent.example.com'],
    ['a relative URL', '/api/agent'],
  ])(
    'rejects an agentBaseUrl with %s before sending the credential',
    async (_name, agentBaseUrl) => {
      const fetchMock = respondWith(allocationBody())
      await expect(
        createClient(fetchMock, { agentBaseUrl }).testCalls.start(startOptions()),
      ).rejects.toBeInstanceOf(ConfigurationError)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['an empty token', { token: '' }],
    ['a token browsers reject as a subprotocol', { token: 'has space' }],
    ['a blank serviceId', { serviceId: ' ' }],
    ['an array context', { context: [] as unknown as Record<string, unknown> }],
    ['an empty actor host suffix', { actorHostSuffixes: [''] }],
    ['a top-level actor host suffix', { actorHostSuffixes: ['com'] }],
  ])('rejects %s before allocating', async (_name, overrides) => {
    const fetchMock = respondWith(allocationBody())
    await expect(
      createClient(fetchMock).testCalls.start(startOptions(overrides)),
    ).rejects.toBeInstanceOf(ConfigurationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each<[string, Record<string, unknown>, Partial<TestCallStartOptions>]>([
    ['a non-object body', [] as unknown as Record<string, unknown>, {}],
    ['a missing ws_url', { call_sid: 'test-1', actor_token: '' }, {}],
    ['a missing call_sid', { ws_url: allocatedUrl(), actor_token: '' }, {}],
    ['an actor token the SDK cannot present', { ...allocationBody(), actor_token: 'sni' }, {}],
    ['an unparseable URL', allocationBody('not a url'), {}],
    [
      'a cleartext ws URL',
      allocationBody(allocatedUrl({}, `ws://${ACTOR_HOST}/agent/test-call`)),
      {},
    ],
    ['an https URL', allocationBody(allocatedUrl({}, `https://${ACTOR_HOST}/agent/test-call`)), {}],
    [
      'embedded URL credentials',
      allocationBody(allocatedUrl({}, `wss://user:pass@${ACTOR_HOST}/agent/test-call`)),
      {},
    ],
    [
      'an explicit port',
      allocationBody(allocatedUrl({}, `wss://${ACTOR_HOST}:8443/agent/test-call`)),
      {},
    ],
    [
      'a host outside the agent engine domain',
      allocationBody(allocatedUrl({}, 'wss://gs-abc12.actors.attacker.net/agent/test-call')),
      {},
    ],
    [
      'a look-alike host suffix',
      allocationBody(allocatedUrl({}, 'wss://gs.notexample.com/agent/test-call')),
      {},
    ],
    [
      'a host outside the configured actor suffixes',
      allocationBody(),
      { actorHostSuffixes: ['actors-us.example.org'] },
    ],
    ['another path', allocationBody(allocatedUrl({}, `wss://${ACTOR_HOST}/agent/observe`)), {}],
    ['a fragment', allocationBody(`${allocatedUrl()}#frag`), {}],
    [
      'another workspace',
      allocationBody(allocatedUrl({ workspace_id: '99999999-9999-4999-8999-999999999999' })),
      {},
    ],
    [
      'another service',
      allocationBody(allocatedUrl({ service_id: '99999999-9999-4999-8999-999999999999' })),
      {},
    ],
    [
      'a repeated workspace_id',
      allocationBody(`${allocatedUrl()}&workspace_id=${WORKSPACE_ID}`),
      {},
    ],
    ['a non-mulaw encoding', allocationBody(allocatedUrl({ encoding: 'pcm16' })), {}],
    ['a missing encoding', allocationBody(allocatedUrl({ encoding: null })), {}],
    ['another sample rate', allocationBody(allocatedUrl({ sample_rate: '16000' })), {}],
    ['a missing sample rate', allocationBody(allocatedUrl({ sample_rate: null })), {}],
    ['a missing allocation_id', allocationBody(allocatedUrl({ allocation_id: null })), {}],
    ['an empty allocation_id', allocationBody(allocatedUrl({ allocation_id: '' })), {}],
    [
      'a missing context_ref when context was sent',
      allocationBody(),
      { context: { member_id: 'm-1' } },
    ],
    [
      'a context_ref when no context was sent',
      allocationBody(allocatedUrl({ context_ref: CONTEXT_REF })),
      {},
    ],
    [
      'another caller_id',
      allocationBody(allocatedUrl({ caller_id: '+19999999999' })),
      { callerId: '+15555550123' },
    ],
    [
      'a caller_id that was not requested',
      allocationBody(allocatedUrl({ caller_id: '+1555' })),
      {},
    ],
  ])('refuses an allocation with %s and never opens a socket', async (_name, body, overrides) => {
    const fetchMock = respondWith(body)
    const error: unknown = await createClient(fetchMock)
      .testCalls.start(startOptions(overrides))
      .catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(ParseError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(FakeWebSocket.instances).toHaveLength(0)
    // Neither the credential nor the server-issued URL is echoed into the error.
    const rendered = `${String(error)} ${JSON.stringify(error)} ${(error as ParseError).body ?? ''}`
    expect(rendered).not.toContain(TOKEN)
    expect(rendered).not.toContain(CLIENT_CREDENTIAL)
    expect(rendered).not.toContain(CONTEXT_REF)
    expect(rendered).not.toContain('a1b2c3d4e5f60718293a4b5c6d7e8f90')
  })

  it('accepts actor hosts under an explicitly configured suffix', async () => {
    const wsUrl = allocatedUrl({}, 'wss://gs-abc12.actors-us.example.org/agent/test-call')
    await createClient(respondWith(allocationBody(wsUrl))).testCalls.start(
      startOptions({ actorHostSuffixes: ['.Actors-US.example.org'] }),
    )
    expect(FakeWebSocket.instances[0]!.url).toBe(wsUrl)
  })

  it('compares workspace and service identifiers case-insensitively', async () => {
    const fetchMock = respondWith(allocationBody())
    await createClient(fetchMock).testCalls.start(
      startOptions({ serviceId: SERVICE_ID.toUpperCase() }),
    )
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('keeps scoped headers and timeouts on the allocation request', async () => {
    const fetchMock = respondWith(allocationBody())
    await createClient(fetchMock)
      .withOptions({ headers: { 'x-trace': 'abc' }, timeout: 5_000 })
      .testCalls.start(startOptions())
    expect(fetchMock.mock.calls[0]![0].headers.get('x-trace')).toBe('abc')
    expect(fetchMock.mock.calls[0]![0].url).toBe(`${AGENT_ORIGIN}/agent/test-call/start`)
  })
})
