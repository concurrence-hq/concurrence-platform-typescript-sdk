import { describe, it, expect } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { NotFoundError } from '../../src/core/errors.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'

const TRIGGER_ID = 'trg-00000000-0000-0000-0000-000000000001'

const TRIGGER_FIXTURE = {
  id: TRIGGER_ID,
  workspace_id: TEST_WORKSPACE_ID,
  name: 'Daily Patient Outreach',
  description: 'Send appointment reminders each weekday morning',
  schedule: '0 9 * * 1-5',
  event_type: 'cron',
  event_filter: null,
  action_id: 'skill-00000000-0000-0000-0000-000000000001',
  input_template: { message_template: 'reminder' },
  is_active: true,
  timezone: 'America/New_York',
  next_fire_at: '2026-01-16T09:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  created_by: null,
}

const FIRE_RESULT_FIXTURE = {
  trigger_id: TRIGGER_ID,
  run_id: 'run-00000000-0000-0000-0000-000000000001',
  status: 'dispatched',
  fired_at: '2026-01-15T14:30:00Z',
}

const RUN_FIXTURE = {
  id: 'run-00000000-0000-0000-0000-000000000001',
  trigger_id: TRIGGER_ID,
  status: 'completed',
  started_at: '2026-01-15T09:00:00Z',
  completed_at: '2026-01-15T09:00:12Z',
  duration_ms: 12000,
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
    [`POST ${BASE}/triggers`]: () => Response.json(TRIGGER_FIXTURE, { status: 201 }),

    [`GET ${BASE}/triggers`]: () =>
      Response.json({ items: [TRIGGER_FIXTURE], has_more: false, continuation_token: null }),

    [`GET ${BASE}/triggers/${TRIGGER_ID}`]: () => Response.json(TRIGGER_FIXTURE),

    [`GET ${BASE}/triggers/not-found`]: () =>
      Response.json({ detail: 'Trigger not found', error_code: 'not_found' }, { status: 404 }),

    [`PUT ${BASE}/triggers/${TRIGGER_ID}`]: () =>
      Response.json({ ...TRIGGER_FIXTURE, name: 'Updated Trigger', schedule: '0 10 * * 1-5' }),

    [`DELETE ${BASE}/triggers/${TRIGGER_ID}`]: () => new Response(null, { status: 204 }),

    [`POST ${BASE}/triggers/${TRIGGER_ID}/fire`]: () => Response.json(FIRE_RESULT_FIXTURE),

    [`POST ${BASE}/triggers/${TRIGGER_ID}/pause`]: () =>
      Response.json({ ...TRIGGER_FIXTURE, is_active: false }),

    [`POST ${BASE}/triggers/${TRIGGER_ID}/resume`]: () =>
      Response.json({ ...TRIGGER_FIXTURE, is_active: true }),

    [`GET ${BASE}/triggers/${TRIGGER_ID}/runs`]: () =>
      Response.json({ items: [RUN_FIXTURE], has_more: false, continuation_token: null }),
  }),
})

describe('TriggersResource', () => {
  it('creates a trigger', async () => {
    const result = await client.triggers.create({
      name: 'Daily Patient Outreach',
      schedule: '0 9 * * 1-5',
      action_id: 'skill-00000000-0000-0000-0000-000000000001',
    } as never)
    expect(result.id).toBe(TRIGGER_ID)
    expect(result.name).toBe('Daily Patient Outreach')
    expect(result.schedule).toBe('0 9 * * 1-5')
  })

  it('lists triggers', async () => {
    const result = await client.triggers.list()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.is_active).toBe(true)
  })

  it('passes an opaque response cursor back unchanged on the next request', async () => {
    const cursor = 'page:next/+==200'
    const requests: string[] = []
    const paged = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request): Promise<Response> => {
        const url = input instanceof Request ? input.url : input.toString()
        requests.push(url)
        return Response.json({
          items: [TRIGGER_FIXTURE],
          has_more: requests.length === 1,
          continuation_token: requests.length === 1 ? cursor : null,
        })
      },
    })
    const first = await paged.triggers.list({ limit: 1 })
    const second = await paged.triggers.list({
      limit: 1,
      continuation_token: first.continuation_token,
    })
    expect(new URL(requests[1] ?? '').searchParams.get('continuation_token')).toBe(cursor)
    expect(second.has_more).toBe(false)
  })

  it('gets a trigger by id', async () => {
    const result = await client.triggers.get(TRIGGER_ID)
    expect(result.id).toBe(TRIGGER_ID)
    expect(result.next_fire_at).toBe('2026-01-16T09:00:00Z')
  })

  it('throws NotFoundError for missing trigger', async () => {
    await expect(client.triggers.get('not-found')).rejects.toThrow(NotFoundError)
  })

  it('updates a trigger', async () => {
    const result = await client.triggers.update(TRIGGER_ID, {
      name: 'Updated Trigger',
      schedule: '0 10 * * 1-5',
    } as never)
    expect(result.name).toBe('Updated Trigger')
    expect(result.schedule).toBe('0 10 * * 1-5')
  })

  it('deletes a trigger', async () => {
    await expect(client.triggers.delete(TRIGGER_ID)).resolves.toBeUndefined()
  })

  it('fires a trigger manually', async () => {
    const result = await client.triggers.fire(TRIGGER_ID)
    expect(result.trigger_id).toBe(TRIGGER_ID)
    expect(result.status).toBe('dispatched')
  })

  it('pauses a trigger', async () => {
    const result = await client.triggers.pause(TRIGGER_ID)
    expect(result.is_active).toBe(false)
  })

  it('resumes a trigger', async () => {
    const result = await client.triggers.resume(TRIGGER_ID)
    expect(result.is_active).toBe(true)
  })

  it('lists trigger runs', async () => {
    const result = await client.triggers.listRuns(TRIGGER_ID)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toBeDefined()
  })

  it('forwards the is_active filter when listing triggers', async () => {
    let capturedUrl = ''
    const capturing = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = input instanceof Request ? input.url : input.toString()
        return Response.json({
          items: [TRIGGER_FIXTURE],
          has_more: false,
          continuation_token: null,
        })
      },
    })
    await capturing.triggers.list({ is_active: true, limit: 10 })
    const query = new URL(capturedUrl).searchParams
    expect(query.get('is_active')).toBe('true')
    expect(query.get('limit')).toBe('10')
  })

  it('fires a trigger with a per-fire input override body', async () => {
    let capturedBody: unknown
    const capturing = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        if (input instanceof Request) {
          const raw = await input.clone().text()
          capturedBody = raw ? JSON.parse(raw) : undefined
        } else if (typeof init?.body === 'string') {
          capturedBody = JSON.parse(init.body)
        }
        return Response.json(FIRE_RESULT_FIXTURE)
      },
    })
    const result = await capturing.triggers.fire(TRIGGER_ID, {
      input: { message_template: 'urgent' },
    })
    expect(result.status).toBe('dispatched')
    expect(capturedBody).toEqual({ input: { message_template: 'urgent' } })
  })

  it('fires a trigger without a body when no input override is given', async () => {
    let capturedBody: unknown
    const capturing = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        if (input instanceof Request) {
          const raw = await input.clone().text()
          capturedBody = raw ? JSON.parse(raw) : undefined
        } else if (typeof init?.body === 'string') {
          capturedBody = JSON.parse(init.body)
        }
        return Response.json(FIRE_RESULT_FIXTURE)
      },
    })
    const result = await capturing.triggers.fire(TRIGGER_ID)
    expect(result.status).toBe('dispatched')
    expect(capturedBody).toBeUndefined()
  })
})
