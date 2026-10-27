import { describe, it, expect } from 'vitest'
import { AmigoClient, ServiceUnavailableError } from '../../src/index.js'
import { NotFoundError } from '../../src/core/errors.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'

const OPERATOR_ID = 'op-00000000-0000-0000-0000-000000000001'
const CALL_SID = 'CA1234567890abcdef1234567890abcdef'

const OPERATOR_FIXTURE = {
  id: OPERATOR_ID,
  workspace_id: TEST_WORKSPACE_ID,
  name: 'Dr. Smith',
  email: 'smith@clinic.example.com',
  role: 'physician',
  status: 'available',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const DASHBOARD_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  operators: {
    total: 12,
    online: 8,
    busy: 3,
    offline: 1,
  },
  active_escalations: 2,
  escalations_today: { total: 5, resolved: 3, avg_response_time_seconds: 45 },
  recent_escalations: [],
}

const JOIN_CALL_FIXTURE = {
  conference_sid: 'CF1234567890abcdef1234567890abcdef',
  mode: 'listen',
  operator_entity_id: OPERATOR_ID,
  participant_call_sid: 'CA0987654321abcdef1234567890abcdef',
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

const BASE = `/v1/${TEST_WORKSPACE_ID}`

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/operators`]: () =>
      Response.json({ items: [OPERATOR_FIXTURE], has_more: false, continuation_token: null }),

    [`POST ${BASE}/operators`]: () => Response.json(OPERATOR_FIXTURE, { status: 201 }),

    [`GET ${BASE}/operators/${OPERATOR_ID}`]: () => Response.json(OPERATOR_FIXTURE),

    [`GET ${BASE}/operators/not-found`]: () =>
      Response.json({ detail: 'Operator not found', error_code: 'not_found' }, { status: 404 }),

    [`GET ${BASE}/operators/dashboard`]: () => Response.json(DASHBOARD_FIXTURE),

    [`GET ${BASE}/operators/queue`]: () =>
      Response.json({
        workspace_id: TEST_WORKSPACE_ID,
        queue: [{ call_sid: CALL_SID, priority_score: 0.85, wait_seconds: 30 }],
        total_active: 1,
      }),

    [`POST ${BASE}/operators/${OPERATOR_ID}/join-call`]: () => Response.json(JOIN_CALL_FIXTURE),

    [`POST ${BASE}/operators/${OPERATOR_ID}/leave-call`]: () =>
      Response.json({ operator_id: OPERATOR_ID, call_sid: CALL_SID, status: 'disconnected' }),

    [`GET ${BASE}/operators/escalations`]: () =>
      Response.json({ items: [], has_more: false, continuation_token: null }),

    [`GET ${BASE}/operators/escalations/active`]: () =>
      Response.json({ items: [], has_more: false, continuation_token: null }),
  }),
})

describe('OperatorsResource', () => {
  it('lists operators', async () => {
    const result = await client.operators.list()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.name).toBe('Dr. Smith')
  })

  it('creates an operator', async () => {
    const result = await client.operators.create({
      name: 'Dr. Smith',
      email: 'smith@clinic.example.com',
    } as never)
    expect(result.id).toBe(OPERATOR_ID)
    expect(result.name).toBe('Dr. Smith')
  })

  it('gets an operator by id', async () => {
    const result = await client.operators.get(OPERATOR_ID)
    expect(result.id).toBe(OPERATOR_ID)
    expect(result.status).toBe('available')
  })

  it('throws NotFoundError for missing operator', async () => {
    await expect(client.operators.get('not-found')).rejects.toThrow(NotFoundError)
  })

  it('gets the operator dashboard', async () => {
    const result = await client.operators.getDashboard()
    expect(result.operators.total).toBe(12)
    expect(result.operators.online).toBe(8)
    expect(result.active_escalations).toBe(2)
  })

  it('gets the operator queue', async () => {
    const result = await client.operators.getQueue()
    expect(result.queue).toHaveLength(1)
    expect(result.queue[0]?.priority_score).toBe(0.85)
  })

  it('joins a call', async () => {
    const result = await client.operators.joinCall(OPERATOR_ID, { call_sid: CALL_SID } as never)
    expect(result.mode).toBe('listen')
    expect(result.participant_call_sid).toBe('CA0987654321abcdef1234567890abcdef')
  })

  it('lists escalations', async () => {
    const result = await client.operators.getEscalations()
    expect(result.items).toHaveLength(0)
  })

  it('gets active escalations', async () => {
    const result = await client.operators.getActiveEscalations()
    expect(result.items).toHaveLength(0)
  })

  describe('audit log', () => {
    it('sends the operator, action, limit and continuation token as query parameters', async () => {
      const queries: Record<string, string>[] = []
      const recording = new AmigoClient({
        apiKey: TEST_API_KEY,
        workspaceId: TEST_WORKSPACE_ID,
        fetch: async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
          const request = input instanceof Request ? input : new Request(input, init)
          queries.push(Object.fromEntries(new URL(request.url).searchParams))
          return Response.json({ items: [], has_more: false, continuation_token: null })
        },
      })

      for (const action of [
        'operator.takeover_started',
        'operator.handback',
        'operator.authored_turn',
      ] as const) {
        await recording.operators.getAuditLog({ operator_id: OPERATOR_ID, action, limit: 25 })
      }
      await recording.operators.getAuditLog({ continuation_token: 'next-page' })

      expect(queries).toEqual([
        { operator_id: OPERATOR_ID, action: 'operator.takeover_started', limit: '25' },
        { operator_id: OPERATOR_ID, action: 'operator.handback', limit: '25' },
        { operator_id: OPERATOR_ID, action: 'operator.authored_turn', limit: '25' },
        { continuation_token: 'next-page' },
      ])
    })

    it('throws ServiceUnavailableError when the audit ledger cannot be read', async () => {
      const unavailable = new AmigoClient({
        apiKey: TEST_API_KEY,
        workspaceId: TEST_WORKSPACE_ID,
        maxRetries: 0,
        fetch: mockFetch({
          [`GET ${BASE}/operators/audit-log`]: () =>
            Response.json({ detail: 'The audit ledger could not be read.' }, { status: 503 }),
        }),
      })

      await expect(unavailable.operators.getAuditLog()).rejects.toBeInstanceOf(
        ServiceUnavailableError,
      )
    })
  })
})
