import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AmigoClient,
  NotFoundError,
  type CallEvalResultsResponse,
  type CreateProductionEvalDefinitionRequest,
  type ProductionEvalDefinition,
  type ProductionEvalDefinitionListResponse,
} from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}`
const SERVICE_ID = '00000000-0000-0000-0000-0000000000a1'
const DEFINITION_ID = '00000000-0000-0000-0000-0000000000d1'
const CONVERSATION_ID = '00000000-0000-0000-0000-0000000000c1'
const MISSING_CONVERSATION_ID = '00000000-0000-0000-0000-0000000000c2'

const DEFINITION = {
  id: DEFINITION_ID,
  workspace_id: TEST_WORKSPACE_ID,
  service_id: SERVICE_ID,
  eval_key: 'resolved_on_first_call',
  eval_type: 'metric',
  assertion_kind: null,
  metric_key: 'call_resolved',
  expected: { equals: true },
  params: {},
  active: true,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
} satisfies ProductionEvalDefinition

const DEFINITION_PAGE = {
  items: [DEFINITION],
  has_more: true,
  continuation_token: 1,
} satisfies ProductionEvalDefinitionListResponse

const VERDICTS = {
  conversation_id: CONVERSATION_ID,
  results: [
    {
      id: '00000000-0000-0000-0000-0000000000e1',
      workspace_id: TEST_WORKSPACE_ID,
      conversation_id: CONVERSATION_ID,
      service_id: SERVICE_ID,
      call_sid: null,
      eval_key: 'resolved_on_first_call',
      eval_type: 'metric',
      assertion_kind: null,
      metric_key: 'call_resolved',
      expected: { equals: true },
      actual: true,
      passed: true,
      score: null,
      status: 'passed',
      rationale: null,
      justification: 'The caller confirmed the new appointment time.',
      cited_turns: [4],
      computed_at: '2026-10-11T18:00:00Z',
      created_at: '2026-10-11T18:00:01Z',
    },
  ],
} satisfies CallEvalResultsResponse

type RouteHandler = (request: Request) => Response | Promise<Response>

const handlers = {
  list: vi.fn<RouteHandler>(() => Response.json(DEFINITION_PAGE)),
  create: vi.fn<RouteHandler>(() => Response.json(DEFINITION, { status: 201 })),
  update: vi.fn<RouteHandler>(() => Response.json({ ...DEFINITION, active: false })),
  delete: vi.fn<RouteHandler>(() => new Response(null, { status: 204 })),
  evaluate: vi.fn<RouteHandler>(() => Response.json(VERDICTS)),
  results: vi.fn<RouteHandler>(() => Response.json(VERDICTS)),
}

function mockFetch(routes: Record<string, RouteHandler>): typeof globalThis.fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    const { pathname } = new URL(request.url)
    const handler = routes[`${request.method.toUpperCase()} ${pathname}`]
    if (handler) return handler(request)
    return new Response(JSON.stringify({ detail: `No mock for ${request.method} ${pathname}` }), {
      status: 500,
    })
  }
}

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/production-eval-definitions`]: handlers.list,
    [`POST ${BASE}/production-eval-definitions`]: handlers.create,
    [`PATCH ${BASE}/production-eval-definitions/${DEFINITION_ID}`]: handlers.update,
    [`DELETE ${BASE}/production-eval-definitions/${DEFINITION_ID}`]: handlers.delete,
    [`POST ${BASE}/calls/${CONVERSATION_ID}/evaluate`]: handlers.evaluate,
    [`GET ${BASE}/calls/${CONVERSATION_ID}/eval-results`]: handlers.results,
    [`GET ${BASE}/calls/${MISSING_CONVERSATION_ID}/eval-results`]: () =>
      Response.json({ detail: 'Conversation not found' }, { status: 404 }),
  }),
})

function capturedRequest(handler: (typeof handlers)[keyof typeof handlers]): Request {
  const request = handler.mock.calls[0]?.[0]
  if (!request) throw new Error('Expected the request to be captured')
  return request
}

describe('ProductionEvalsResource', () => {
  beforeEach(() => {
    for (const handler of Object.values(handlers)) handler.mockClear()
  })

  it('lists definitions with filters, sort order and the continuation token', async () => {
    const result = await client.productionEvals.listDefinitions({
      service_id: SERVICE_ID,
      active: true,
      sort_by: ['-created_at'],
      limit: 1,
      continuation_token: 1,
    })
    const searchParams = new URL(capturedRequest(handlers.list).url).searchParams

    expect(searchParams.get('service_id')).toBe(SERVICE_ID)
    expect(searchParams.get('active')).toBe('true')
    expect(searchParams.getAll('sort_by')).toEqual(['-created_at'])
    expect(searchParams.get('limit')).toBe('1')
    expect(searchParams.get('continuation_token')).toBe('1')
    expect(result.items[0]?.metric_key).toBe('call_resolved')
    expect(result.has_more).toBe(true)
  })

  it('creates a definition', async () => {
    const body = {
      eval_key: 'resolved_on_first_call',
      eval_type: 'metric',
      service_id: SERVICE_ID,
      metric_key: 'call_resolved',
      expected: { equals: true },
    } satisfies CreateProductionEvalDefinitionRequest
    const result = await client.productionEvals.createDefinition(body)
    const request = capturedRequest(handlers.create)

    expect(await request.json()).toEqual(body)
    expect(result.id).toBe(DEFINITION_ID)
    expect(result.eval_type).toBe('metric')
  })

  it('updates a definition', async () => {
    const result = await client.productionEvals.updateDefinition(DEFINITION_ID, { active: false })
    const request = capturedRequest(handlers.update)

    expect(await request.json()).toEqual({ active: false })
    expect(result.active).toBe(false)
  })

  it('deletes a definition', async () => {
    await expect(client.productionEvals.deleteDefinition(DEFINITION_ID)).resolves.toBeUndefined()
    expect(handlers.delete).toHaveBeenCalledTimes(1)
  })

  it('evaluates one call', async () => {
    const result = await client.productionEvals.evaluate(CONVERSATION_ID)

    expect(handlers.evaluate).toHaveBeenCalledTimes(1)
    expect(result.conversation_id).toBe(CONVERSATION_ID)
    expect(result.results[0]?.status).toBe('passed')
  })

  it("gets a call's verdicts", async () => {
    const result = await client.productionEvals.getResults(CONVERSATION_ID)

    expect(handlers.results).toHaveBeenCalledTimes(1)
    expect(result.results[0]?.justification).toBe('The caller confirmed the new appointment time.')
  })

  it('throws NotFoundError for verdicts of a call that does not exist', async () => {
    await expect(client.productionEvals.getResults(MISSING_CONVERSATION_ID)).rejects.toThrow(
      NotFoundError,
    )
  })
})
