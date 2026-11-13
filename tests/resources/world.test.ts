import { describe, it, expect } from 'vitest'
import { AmigoClient, NotFoundError } from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const ENTITY_ID = 'entity-00000000-0000-0000-0000-000000000001'

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

const BASE = `/v1/${TEST_WORKSPACE_ID}`

const entityFixture = {
  id: ENTITY_ID,
  workspace_id: TEST_WORKSPACE_ID,
  entity_type: 'patient',
  display_name: 'Jane Doe',
  canonical_id: 'MRN-12345',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/world/entities`]: () =>
      Response.json({ entities: [entityFixture], has_more: false, next_offset: null, total: 1 }),

    [`GET ${BASE}/world/entities/${ENTITY_ID}`]: () => Response.json(entityFixture),

    [`GET ${BASE}/world/entities/${ENTITY_ID}/relationships`]: () =>
      Response.json({ relationships: [] }),

    [`GET ${BASE}/world/entities/${ENTITY_ID}/timeline`]: () =>
      Response.json({
        entity_id: ENTITY_ID,
        events: [
          { id: 'event-001', event_type: 'call_completed', domain: 'voice', source: 'voice-agent' },
        ],
        has_more: false,
      }),

    [`GET ${BASE}/world/entity-types`]: () =>
      Response.json({ entity_types: [{ entity_type: 'patient', count: 150 }] }),

    [`GET ${BASE}/world/entity-stats`]: () =>
      Response.json({ total_entities: 150, total_events: 3000 }),
  }),
})

describe('WorldResource', () => {
  it('lists entities', async () => {
    const result = await client.world.listEntities()
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0]?.entity_type).toBe('patient')
  })

  it('auto-pages entities', async () => {
    const secondEntity = {
      ...entityFixture,
      id: 'entity-00000000-0000-0000-0000-000000000002',
      display_name: 'John Smith',
    }

    const pagedClient = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init)
        const url = new URL(request.url)
        const offset = url.searchParams.get('offset')

        if (offset === '1') {
          return Response.json({
            entities: [secondEntity],
            has_more: false,
            next_offset: null,
            total: 2,
          })
        }

        return Response.json({
          entities: [entityFixture],
          has_more: true,
          next_offset: 1,
          total: 2,
        })
      },
    })

    const names: string[] = []
    for await (const entity of pagedClient.world.listEntitiesAutoPaging({ limit: 1 })) {
      names.push(entity.display_name ?? '')
    }

    expect(names).toEqual(['Jane Doe', 'John Smith'])
  })

  it('gets an entity', async () => {
    const result = await client.world.getEntity(ENTITY_ID)
    expect(result.canonical_id).toBe('MRN-12345')
  })

  it('gets relationships', async () => {
    const result = await client.world.getRelationships(ENTITY_ID)
    expect(result.relationships).toHaveLength(0)
  })

  it('gets timeline', async () => {
    const result = await client.world.getTimeline(ENTITY_ID)
    expect(result.events).toHaveLength(1)
  })

  it('lists entity types', async () => {
    const result = await client.world.listEntityTypes()
    expect(result.entity_types).toHaveLength(1)
  })

  it('gets entity stats', async () => {
    const result = await client.world.getStats()
    expect(result.total_entities).toBe(150)
  })
})

describe('WorldResource enrichment', () => {
  function recordingClient(handler: (request: Request) => Response) {
    const requests: Request[] = []
    const recordingClient = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init)
        requests.push(request)
        return handler(request)
      },
    })
    return { client: recordingClient, requests }
  }

  it("lists an entity's current enrichment values with limit and offset", async () => {
    const { client: enrichmentClient, requests } = recordingClient(() =>
      Response.json({
        entity_id: ENTITY_ID,
        values: [
          {
            key: 'preferred_language',
            value: 'es',
            value_type: 'string',
            confidence: 0.9,
            source: 'memory_extract',
            event_id: 'event-001',
          },
        ],
      }),
    )

    const result = await enrichmentClient.world.listEnrichment(ENTITY_ID, { limit: 50, offset: 50 })
    const url = new URL(requests[0]!.url)

    expect(url.pathname).toBe(`${BASE}/world/entities/${ENTITY_ID}/enrichment`)
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '50', offset: '50' })
    expect(result.values[0]?.value).toBe('es')
  })

  it('gets the history of one key, newest first, with the limit', async () => {
    const { client: enrichmentClient, requests } = recordingClient(() =>
      Response.json({
        entity_id: ENTITY_ID,
        key: 'preferred_language',
        history: [
          {
            event_id: 'event-002',
            value: 'es',
            value_type: 'string',
            confidence: 0.9,
            source: 'memory_extract',
            ingested_at: '2026-10-11T18:00:00Z',
            supersedes: 'event-001',
            is_current: true,
          },
        ],
        dropped_count: 1,
      }),
    )

    const result = await enrichmentClient.world.getEnrichmentHistory(
      ENTITY_ID,
      'preferred_language',
      { limit: 10 },
    )
    const url = new URL(requests[0]!.url)

    expect(url.pathname).toBe(
      `${BASE}/world/entities/${ENTITY_ID}/enrichment/preferred_language/history`,
    )
    expect(url.searchParams.get('limit')).toBe('10')
    expect(result.history[0]?.supersedes).toBe('event-001')
    expect(result.dropped_count).toBe(1)
  })

  it('throws NotFoundError for a missing entity', async () => {
    const { client: enrichmentClient } = recordingClient(() =>
      Response.json({ detail: 'Entity not found' }, { status: 404 }),
    )

    await expect(enrichmentClient.world.listEnrichment(ENTITY_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})
