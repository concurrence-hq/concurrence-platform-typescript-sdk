import { describe, it, expect } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { ConflictError, NotFoundError } from '../../src/core/errors.js'
import type { components } from '../../src/generated/api.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'

const GRAPH_ID = 'cg-00000000-0000-0000-0000-000000000001'

const GRAPH_FIXTURE = {
  id: GRAPH_ID,
  workspace_id: TEST_WORKSPACE_ID,
  name: 'Appointment Scheduling',
  description: 'Handles appointment booking flow',
  latest_version: 1,
  state_count: 3,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const VERSION_FIXTURE = {
  id: 'cgv-00000000-0000-0000-0000-000000000001',
  context_graph_id: GRAPH_ID,
  version: 1,
  name: 'Appointment Scheduling',
  created_at: '2026-01-01T00:00:00Z',
}

function mockFetch(
  routes: Record<string, (req: Request) => Response | Promise<Response>>,
): typeof globalThis.fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init)
    const method = req.method.toUpperCase()
    const pathname = new URL(req.url).pathname
    for (const [pattern, handler] of Object.entries(routes)) {
      const [pMethod, ...pPathParts] = pattern.split(' ')
      if (pMethod === method && pPathParts.join(' ') === pathname) return handler(req)
    }
    return new Response(JSON.stringify({ detail: `No mock for ${method} ${pathname}` }), {
      status: 500,
    })
  }
}

const BASE = `/v1/${TEST_WORKSPACE_ID}`

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/context-graphs`]: () =>
      Response.json({ items: [GRAPH_FIXTURE], has_more: false, continuation_token: null }),

    [`POST ${BASE}/context-graphs`]: () => Response.json(GRAPH_FIXTURE, { status: 201 }),

    [`GET ${BASE}/context-graphs/${GRAPH_ID}`]: () => Response.json(GRAPH_FIXTURE),

    [`GET ${BASE}/context-graphs/not-found`]: () =>
      Response.json(
        { detail: 'Context graph not found', error_code: 'not_found' },
        { status: 404 },
      ),

    [`PUT ${BASE}/context-graphs/${GRAPH_ID}`]: () =>
      Response.json({ ...GRAPH_FIXTURE, name: 'Updated Graph' }),

    [`DELETE ${BASE}/context-graphs/${GRAPH_ID}`]: () => new Response(null, { status: 204 }),

    [`POST ${BASE}/context-graphs/${GRAPH_ID}/versions`]: () =>
      Response.json(VERSION_FIXTURE, { status: 201 }),

    [`GET ${BASE}/context-graphs/${GRAPH_ID}/versions`]: () =>
      Response.json({ items: [VERSION_FIXTURE], has_more: false, continuation_token: null }),

    [`GET ${BASE}/context-graphs/${GRAPH_ID}/versions/1`]: () => Response.json(VERSION_FIXTURE),

    [`GET ${BASE}/context-graphs/${GRAPH_ID}/versions/latest`]: () =>
      Response.json(VERSION_FIXTURE),
  }),
})

describe('ContextGraphsResource', () => {
  it('lists context graphs', async () => {
    const result = await client.contextGraphs.list()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.name).toBe('Appointment Scheduling')
  })

  it('creates a context graph', async () => {
    const result = await client.contextGraphs.create({
      name: 'Appointment Scheduling',
    } as never)
    expect(result.id).toBe(GRAPH_ID)
    expect(result.name).toBe('Appointment Scheduling')
  })

  it('gets a context graph by id', async () => {
    const result = await client.contextGraphs.get(GRAPH_ID)
    expect(result.id).toBe(GRAPH_ID)
    expect(result.state_count).toBe(3)
  })

  it('throws NotFoundError for missing context graph', async () => {
    await expect(client.contextGraphs.get('not-found')).rejects.toThrow(NotFoundError)
  })

  it('updates a context graph', async () => {
    const result = await client.contextGraphs.update(GRAPH_ID, { name: 'Updated Graph' } as never)
    expect(result.name).toBe('Updated Graph')
  })

  it('deletes a context graph', async () => {
    await expect(client.contextGraphs.delete(GRAPH_ID)).resolves.toBeUndefined()
  })

  it('creates a version', async () => {
    const result = await client.contextGraphs.createVersion(GRAPH_ID, {} as never)
    expect(result.version).toBe(1)
    expect(result.context_graph_id).toBe(GRAPH_ID)
  })

  it('creates a version with dynamic behaviors, sending expected_latest_version only when asked', async () => {
    const behavior = {
      id: '00000000-0000-4000-8000-000000000101',
      name: 'Medication change routing',
      enabled: true,
      condition: 'The client wants to start, stop, switch or re-dose a prescription.',
      examples: ['Can I switch to a different medication?'],
      instruction: 'Give no medication advice. A provider decides. Offer a follow-up video visit.',
      mode: 'add',
      states: ['answer_questions'],
      sticky_turns: 2,
      tags: ['routing'],
    } satisfies components['schemas']['DynamicBehavior']
    const body = {
      states: [],
      new_user_initial_state: 'answer_questions',
      returning_user_initial_state: 'answer_questions',
      terminal_state: 'end',
      dynamic_behaviors: [behavior],
    } satisfies components['schemas']['CreateContextGraphVersionRequest']
    const requests: { url: URL; body: unknown }[] = []
    const versioningClient = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: mockFetch({
        [`POST ${BASE}/context-graphs/${GRAPH_ID}/versions`]: async (req) => {
          const url = new URL(req.url)
          requests.push({ url, body: await req.json() })
          return url.searchParams.get('expected_latest_version') === '6'
            ? Response.json(
                {
                  detail:
                    'Context graph is at version 7; this write expected 6. Reload and apply the change to version 7.',
                },
                { status: 409 },
              )
            : Response.json(
                { ...VERSION_FIXTURE, version: 8, dynamic_behaviors: [behavior] },
                { status: 201 },
              )
        },
      }),
    })

    const created = await versioningClient.contextGraphs.createVersion(GRAPH_ID, body, {
      expectedLatestVersion: 7,
    })
    await versioningClient.contextGraphs.createVersion(GRAPH_ID, body, { expectedLatestVersion: 0 })
    await versioningClient.contextGraphs.createVersion(GRAPH_ID, body)
    await expect(
      versioningClient.contextGraphs.createVersion(GRAPH_ID, body, { expectedLatestVersion: 6 }),
    ).rejects.toBeInstanceOf(ConflictError)

    expect(created.dynamic_behaviors).toEqual([behavior])
    expect(requests.map(({ url }) => url.searchParams.get('expected_latest_version'))).toEqual([
      '7',
      '0',
      null,
      '6',
    ])
    expect(requests[2]?.url.search).toBe('')
    expect(requests[0]?.body).toEqual(body)
  })

  it('lists versions', async () => {
    const result = await client.contextGraphs.listVersions(GRAPH_ID)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.version).toBe(1)
  })

  it('gets a specific version by number', async () => {
    const result = await client.contextGraphs.getVersion(GRAPH_ID, 1)
    expect(result.version).toBe(1)
  })

  it('gets the latest version', async () => {
    const result = await client.contextGraphs.getVersion(GRAPH_ID, 'latest')
    expect(result.version).toBe(1)
    expect(result.context_graph_id).toBe(GRAPH_ID)
  })
})
