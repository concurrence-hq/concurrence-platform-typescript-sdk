import { describe, it, expect } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { NotFoundError } from '../../src/core/errors.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'

const WORKSPACE_FIXTURE = {
  id: TEST_WORKSPACE_ID,
  name: 'Acme Health',
  slug: 'acme-health',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function mockFetch(
  routes: Record<string, () => Response | Promise<Response>>,
): typeof globalThis.fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let url: string
    let method: string
    if (input instanceof Request) {
      url = input.url
      method = input.method.toUpperCase()
    } else {
      url = typeof input === 'string' ? input : input.toString()
      method = (init?.method ?? 'GET').toUpperCase()
    }
    const pathname = new URL(url).pathname
    for (const [pattern, handler] of Object.entries(routes)) {
      const [pMethod, ...pPathParts] = pattern.split(' ')
      if (pMethod === method && pPathParts.join(' ') === pathname) return handler()
    }
    return new Response(JSON.stringify({ detail: `No mock for ${method} ${pathname}` }), {
      status: 500,
    })
  }
}

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET /v1/workspaces`]: () =>
      Response.json({ items: [WORKSPACE_FIXTURE], has_more: false, continuation_token: null }),

    [`GET /v1/workspaces/${TEST_WORKSPACE_ID}`]: () => Response.json(WORKSPACE_FIXTURE),

    [`GET /v1/workspaces/not-found`]: () =>
      Response.json({ detail: 'Workspace not found', error_code: 'not_found' }, { status: 404 }),

    [`PATCH /v1/workspaces/${TEST_WORKSPACE_ID}`]: () =>
      Response.json({ ...WORKSPACE_FIXTURE, name: 'Acme Health Updated' }),

    [`POST /v1/workspaces/${TEST_WORKSPACE_ID}/archive`]: () =>
      Response.json({ ...WORKSPACE_FIXTURE, status: 'archived' }),

    [`POST /v1/workspaces/${TEST_WORKSPACE_ID}/provision`]: () =>
      Response.json({ workspace: WORKSPACE_FIXTURE }),
  }),
})

describe('WorkspacesResource', () => {
  it('lists workspaces', async () => {
    const result = await client.workspaces.list()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.name).toBe('Acme Health')
  })

  it('gets a workspace by id', async () => {
    const result = await client.workspaces.get(TEST_WORKSPACE_ID)
    expect(result.id).toBe(TEST_WORKSPACE_ID)
    expect(result.name).toBe('Acme Health')
  })

  it('gets the default workspace when no id is passed', async () => {
    const result = await client.workspaces.get()
    expect(result.id).toBe(TEST_WORKSPACE_ID)
  })

  it('throws NotFoundError for missing workspace', async () => {
    await expect(client.workspaces.get('not-found')).rejects.toThrow(NotFoundError)
  })

  it('updates a workspace', async () => {
    const result = await client.workspaces.update({ name: 'Acme Health Updated' } as never)
    expect(result.name).toBe('Acme Health Updated')
  })

  it('archives a workspace', async () => {
    const result = await client.workspaces.archive({ reason: 'No longer needed' } as never)
    expect(result.name).toBeDefined()
  })

  it('provisions a workspace', async () => {
    const result = await client.workspaces.provision()
    expect(result.workspace.id).toBe(TEST_WORKSPACE_ID)
  })

  describe('testCallerNumbers', () => {
    const TCN_FIXTURE = { allowlist: ['+15551234567'] }
    const tcnClient = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: mockFetch({
        [`GET /v1/workspaces/${TEST_WORKSPACE_ID}/test-caller-numbers`]: () =>
          Response.json(TCN_FIXTURE),
        [`PUT /v1/workspaces/${TEST_WORKSPACE_ID}/test-caller-numbers`]: () =>
          Response.json(TCN_FIXTURE),
      }),
    })

    it('reads and writes the allowlist', async () => {
      expect(await tcnClient.workspaces.testCallerNumbers.get()).toMatchObject(TCN_FIXTURE)
      expect(
        await tcnClient.workspaces.testCallerNumbers.update({
          numbers: ['+15551234567'],
        }),
      ).toMatchObject(TCN_FIXTURE)
    })
  })
})
