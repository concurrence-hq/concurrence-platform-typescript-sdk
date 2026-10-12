import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}`

const continuationPaths = new Set([
  `${BASE}/agents`,
  `${BASE}/agents/agent-001/versions`,
  `${BASE}/skills`,
  `${BASE}/api-keys`,
  `${BASE}/calls`,
  `${BASE}/context-graphs`,
  `${BASE}/context-graphs/cg-001/versions`,
  `${BASE}/data-sources`,
  `${BASE}/integrations`,
  `${BASE}/production-eval-definitions`,
  `${BASE}/services`,
  `${BASE}/triggers`,
  `${BASE}/triggers/trigger-001/runs`,
  '/v1/workspaces',
])

const offsetItemPaths = new Set([
  `${BASE}/operators`,
  `${BASE}/operators/escalations`,
  `${BASE}/operators/audit-log`,
])

const offsetEventPaths = new Set([
  `${BASE}/audit`,
  `${BASE}/audit/phi-access`,
  `${BASE}/audit/entity/entity-001/access-log`,
  `${BASE}/world/entities/entity-001/timeline`,
])

function mockFetch(): typeof globalThis.fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)
    const pathname = url.pathname

    if (continuationPaths.has(pathname)) {
      const token = url.searchParams.get('continuation_token')
      return Response.json({
        items: [{ token: token ?? 'first', path: pathname }],
        has_more: token !== '1',
        continuation_token: token === '1' ? null : 1,
      })
    }

    if (offsetItemPaths.has(pathname)) {
      const offset = url.searchParams.get('offset')
      return Response.json({
        items: [{ offset: offset ?? 'first', path: pathname }],
        has_more: offset !== '1',
        next_offset: offset === '1' ? null : 1,
      })
    }

    if (offsetEventPaths.has(pathname)) {
      const offset = url.searchParams.get('offset')
      return Response.json({
        events: [{ offset: offset ?? 'first', path: pathname }],
        has_more: offset !== '1',
        next_offset: offset === '1' ? null : 1,
      })
    }

    if (pathname === `${BASE}/world/entities`) {
      const offset = url.searchParams.get('offset')
      return Response.json({
        entities: [{ offset: offset ?? 'first', path: pathname }],
        has_more: offset !== '1',
        next_offset: offset === '1' ? null : 1,
      })
    }

    return new Response(JSON.stringify({ detail: `No mock for ${request.method} ${pathname}` }), {
      status: 500,
    })
  }
}

async function countItems<T>(iterable: AsyncIterable<T>): Promise<number> {
  let count = 0

  for await (const item of iterable) {
    void item
    count += 1
  }

  return count
}

describe('resource auto-pagination helpers', () => {
  const client = new AmigoClient({
    apiKey: TEST_API_KEY,
    workspaceId: TEST_WORKSPACE_ID,
    fetch: mockFetch(),
  })

  it('iterates continuation-token list helpers', async () => {
    const counts = await Promise.all([
      countItems(client.actions.listAutoPaging({ limit: 1 })),
      countItems(client.agents.listAutoPaging({ limit: 1 })),
      countItems(client.agents.listVersionsAutoPaging('agent-001', { limit: 1 })),
      countItems(client.apiKeys.listAutoPaging({ limit: 1 })),
      countItems(client.calls.listAutoPaging({ limit: 1 })),
      countItems(client.contextGraphs.listAutoPaging({ limit: 1 })),
      countItems(client.contextGraphs.listVersionsAutoPaging('cg-001', { limit: 1 })),
      countItems(client.dataSources.listAutoPaging({ limit: 1 })),
      countItems(client.integrations.listAutoPaging({ limit: 1 })),
      countItems(client.productionEvals.listDefinitionsAutoPaging({ limit: 1 })),
      countItems(client.services.listAutoPaging({ limit: 1 })),
      countItems(client.skills.listAutoPaging({ limit: 1 })),
      countItems(client.triggers.listAutoPaging({ limit: 1 })),
      countItems(client.triggers.listRunsAutoPaging('trigger-001', { limit: 1 })),
      countItems(client.workspaces.listAutoPaging({ limit: 1 })),
    ])

    expect(counts).toEqual(new Array(counts.length).fill(2))
  })

  it('iterates offset-based list helpers', async () => {
    const counts = await Promise.all([
      countItems(client.audit.listAutoPaging({ limit: 1 })),
      countItems(client.audit.getPhiAccessAutoPaging({ limit: 1 })),
      countItems(client.audit.getEntityAccessLogAutoPaging('entity-001', { limit: 1 })),
      countItems(client.operators.listAutoPaging({ limit: 1 })),
      countItems(client.operators.getEscalationsAutoPaging({ limit: 1 })),
      countItems(client.operators.getAuditLogAutoPaging({ limit: 1 })),
      countItems(client.world.listEntitiesAutoPaging({ limit: 1 })),
      countItems(client.world.getTimelineAutoPaging('entity-001', { limit: 1 })),
    ])

    expect(counts).toEqual(new Array(counts.length).fill(2))
  })
})
