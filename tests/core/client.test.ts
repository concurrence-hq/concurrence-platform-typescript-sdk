import { describe, expect, it, vi } from 'vitest'
import {
  AmigoClient,
  ConfigurationError,
  DEFAULT_BASE_URL,
  RequestTimeoutError,
} from '../../src/index.js'
import { withResponse } from '../../src/core/utils.js'
import { TEST_API_KEY, fixtures } from '../test-helpers.js'

describe('AmigoClient configuration', () => {
  it('throws on missing apiKey', () => {
    expect(() => new AmigoClient({ apiKey: '', workspaceId: 'ws-001' })).toThrow(ConfigurationError)
  })

  it('throws on missing workspaceId', () => {
    expect(() => new AmigoClient({ apiKey: TEST_API_KEY, workspaceId: '' })).toThrow(
      ConfigurationError,
    )
  })

  it('normalizes trailing slashes on baseUrl', async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      expect(request.url).toBe('https://api.example.com/v1/ws-001/agents')
      return Response.json(fixtures.paginatedList([]))
    })

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      baseUrl: 'https://api.example.com/',
      fetch: mockFetch as typeof fetch,
    })

    await client.agents.list()
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('defaults to the US production platform host', async () => {
    const urls: string[] = []
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      fetch: async (input, init) => {
        urls.push((input instanceof Request ? input : new Request(input, init)).url)
        return Response.json(fixtures.paginatedList([]))
      },
    })

    await client.agents.list()

    expect(DEFAULT_BASE_URL).toBe('https://platform.api-us.concurrence.com')
    expect(client.baseUrl).toBe('https://platform.api-us.concurrence.com')
    expect(urls).toEqual(['https://platform.api-us.concurrence.com/v1/ws-001/agents'])
  })

  it('forwards requests through the provided fetch implementation', async () => {
    const mockFetch = vi.fn(async () => Response.json(fixtures.paginatedList([fixtures.agent()])))

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      fetch: mockFetch as typeof fetch,
    })

    const result = await client.agents.list()
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.name).toBe('Test Agent')
  })

  it('initializes the public resource surface', () => {
    const client = new AmigoClient({ apiKey: TEST_API_KEY, workspaceId: 'ws-001' })

    expect(client.workspaces).toBeDefined()
    expect(client.agents).toBeDefined()
    expect(client.actions).toBeDefined()
    expect(client.services).toBeDefined()
    expect(client.world).toBeDefined()
    expect(client.metrics).toBeDefined()
    expect(client.workspaceDataQueries).toBeDefined()
  })

  it('attaches response metadata to object results', async () => {
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      fetch: vi.fn(async () =>
        Response.json(fixtures.paginatedList([fixtures.agent()]), {
          headers: {
            'x-request-id': 'req_meta_123',
            'x-ratelimit-limit': '100',
            'x-ratelimit-remaining': '99',
            'x-ratelimit-reset': '1700000000',
          },
        }),
      ) as typeof fetch,
    })

    const result = await client.agents.list()

    expect(result._request_id).toBe('req_meta_123')
    expect(result.lastResponse.requestId).toBe('req_meta_123')
    expect(result.lastResponse.statusCode).toBe(200)
    expect(result.lastResponse.rateLimit.remaining).toBe(99)
    expect(Object.keys(result)).not.toContain('_request_id')
  })

  it('supports low-level typed GET requests with auto-injected workspace IDs', async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      expect(request.url).toBe('https://api.example.com/v1/ws-001/agents?limit=5')
      expect(request.headers.get('X-Debug-Trace')).toBe('true')

      return Response.json(fixtures.paginatedList([fixtures.agent()]), {
        headers: { 'x-request-id': 'req_low_level' },
      })
    })

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      baseUrl: 'https://api.example.com',
      fetch: mockFetch as typeof fetch,
    })

    const result = await client.GET('/v1/{workspace_id}/agents', {
      params: { query: { limit: 5 } },
      headers: { 'X-Debug-Trace': 'true' },
    })

    expect(result.requestId).toBe('req_low_level')
    expect(result.data._request_id).toBe('req_low_level')
    expect(result.data.items).toHaveLength(1)
  })

  it('supports low-level no-content success responses', async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      expect(request.method).toBe('DELETE')
      expect(request.url).toBe('https://api.example.com/v1/ws-001/agents/agent-123')

      return new Response(null, {
        status: 204,
        headers: { 'x-request-id': 'req_delete_123' },
      })
    })

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      baseUrl: 'https://api.example.com',
      fetch: mockFetch as typeof fetch,
    })

    const result = await client.DELETE('/v1/{workspace_id}/agents/{agent_id}', {
      params: { path: { agent_id: 'agent-123' } },
    })

    expect(result.data).toBeUndefined()
    expect((result as { error?: unknown }).error).toBeUndefined()
    expect(result.response.status).toBe(204)
    expect(result.requestId).toBe('req_delete_123')
  })

  it('keeps data-first precedence when an openapi response contains data and error', () => {
    const result = withResponse({
      data: { ok: true },
      error: { detail: 'conflicting response' },
      response: Response.json({ ok: true }),
    })

    expect(result.data).toMatchObject({ ok: true })
  })

  it('allows explicitly empty successful responses', () => {
    const result = withResponse(
      {
        data: undefined,
        response: new Response(null, { status: 200 }),
      },
      { allowEmptyBody: true },
    )

    expect(result.data).toBeUndefined()
  })

  it('allows no-content responses even if an upstream parser reports an error', () => {
    const result = withResponse({
      data: undefined,
      error: { detail: 'empty body' },
      response: new Response(null, { status: 204 }),
    })

    expect(result.data).toBeUndefined()
    expect((result as { error?: unknown }).error).toBeUndefined()
  })

  it('uses the configured workspaceId when workspace path params are provided manually', async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      expect(request.url).toBe('https://api.example.com/v1/ws-001/agents')
      return Response.json(fixtures.paginatedList([]))
    })

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      baseUrl: 'https://api.example.com',
      fetch: mockFetch as typeof fetch,
    })

    await client.GET('/v1/{workspace_id}/agents', {
      params: { path: { workspace_id: 'ws-other' } },
    })

    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('supports default headers and request lifecycle hooks', async () => {
    const events: string[] = []
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      expect(request.headers.get('X-SDK-Test')).toBe('enabled')
      return Response.json(fixtures.paginatedList([]), {
        headers: { 'x-request-id': 'req_hooks_123' },
      })
    })

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      headers: { 'X-SDK-Test': 'enabled' },
      hooks: {
        onRequest({ request, schemaPath }) {
          events.push(`request:${request.method}:${schemaPath}`)
        },
        onResponse({ requestId, response }) {
          events.push(`response:${response.status}:${requestId}`)
        },
      },
      fetch: mockFetch as typeof fetch,
    })

    await client.agents.list()

    expect(events).toEqual(['request:GET:/v1/{workspace_id}/agents', 'response:200:req_hooks_123'])
  })

  it('applies scoped request options on client and resource wrappers', async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      expect(request.headers.get('X-Scoped-Client')).toBe('true')
      expect(request.headers.get('X-Scoped-Resource')).toBe('true')
      return Response.json(fixtures.paginatedList([fixtures.agent()]))
    })

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      fetch: mockFetch as typeof fetch,
    })

    const scopedClient = client.withOptions({ headers: { 'X-Scoped-Client': 'true' } })
    const result = await scopedClient.agents
      .withOptions({ headers: { 'X-Scoped-Resource': 'true' } })
      .list()

    expect(result.items).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('supports per-request retry overrides on low-level requests', async () => {
    let attempts = 0
    const mockFetch = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) {
        return new Response(JSON.stringify({ detail: 'temporary error' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      }

      return Response.json(fixtures.paginatedList([fixtures.agent()]))
    })

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      retry: { maxAttempts: 1 },
      fetch: mockFetch as typeof fetch,
    })

    const result = await client.GET('/v1/{workspace_id}/agents', {
      maxRetries: 1,
    })

    expect(attempts).toBe(2)
    expect(result.data.items).toHaveLength(1)
  })

  it('keeps retry handling when a low-level request provides a custom fetch', async () => {
    const baseFetch = vi.fn(async () => {
      throw new Error('base fetch should not be used')
    })

    let attempts = 0
    const requestFetch = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) {
        return new Response(JSON.stringify({ detail: 'temporary error' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      }

      return Response.json(fixtures.paginatedList([fixtures.agent()]))
    })

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      retry: { maxAttempts: 1 },
      fetch: baseFetch as typeof fetch,
    })

    const result = await client.GET('/v1/{workspace_id}/agents', {
      fetch: requestFetch as typeof fetch,
      maxRetries: 1,
    })

    expect(baseFetch).not.toHaveBeenCalled()
    expect(requestFetch).toHaveBeenCalledTimes(2)
    expect(result.data.items).toHaveLength(1)
  })

  it('supports timeout overrides on low-level requests', async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)

      return await new Promise<Response>((_, reject) => {
        request.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
    })

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: 'ws-001',
      fetch: mockFetch as typeof fetch,
    })

    await expect(
      client.GET('/v1/{workspace_id}/agents', {
        timeout: 10,
      }),
    ).rejects.toBeInstanceOf(RequestTimeoutError)
  })
})
