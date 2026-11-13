import { describe, it, expect } from 'vitest'
import { AmigoClient, ConflictError, ServiceUnavailableError } from '../../src/index.js'
import type { InsightPin } from '../../src/index.js'

const WORKSPACE = '11111111-1111-4111-8111-111111111111'
const SESSION = '22222222-2222-4222-8222-222222222222'
const RESULT = '33333333-3333-4333-8333-333333333333'
const PRESENTATION = '44444444-4444-4444-8444-444444444444'
const PIN = '55555555-5555-4555-8555-555555555555'
const ACTOR = '66666666-6666-4666-8666-666666666666'
const BASE = `https://api.example/v1/${WORKSPACE}/insights`

const pin: InsightPin = {
  id: PIN,
  revision: 3,
  question: 'How many calls completed?',
  block: { type: 'metric', label: 'completed', value: '16' },
  source: {
    result_id: RESULT,
    queried_at: '2026-11-12T10:00:00Z',
    columns: [{ name: 'completed', type_name: 'LONG', type_text: 'BIGINT' }],
    rows: [['16']],
  },
  created_at: '2026-11-12T10:00:00Z',
  updated_at: '2026-11-12T10:05:00Z',
  refreshed_at: '2026-11-12T10:05:00Z',
  created_by: ACTOR,
  updated_by: ACTOR,
  refresh_error: null,
  deleted_at: null,
  undo_until: null,
}

function setup(respond: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = []
  const client = new AmigoClient({
    apiKey: 'test-api-key',
    workspaceId: WORKSPACE,
    baseUrl: 'https://api.example',
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push(request.clone())
      return respond(request)
    },
  })
  return { client, requests }
}

describe('InsightsResource retained results and Home facts', () => {
  it('reads one retained result by session and result id', async () => {
    const result = {
      result_id: RESULT,
      queried_at: '2026-11-12T10:00:00Z',
      truncated: false,
      sql: 'SELECT 1 AS n',
      columns: [{ index: 0, name: 'n', type: 'INT' }],
      rows: [['1'], [null]],
    }
    const { client, requests } = setup(() => Response.json(result))

    expect(await client.insights.sessions.getResult(SESSION, RESULT)).toEqual(result)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.method).toBe('GET')
    expect(requests[0]!.url).toBe(`${BASE}/sessions/${SESSION}/results/${RESULT}`)
  })

  it('encodes caller-supplied path segments instead of letting them change the route', async () => {
    const { client, requests } = setup(() => Response.json({}))

    await client.insights.sessions.getResult('a/b?c', RESULT)
    await client.insights.pins.get('../other')

    expect(new URL(requests[0]!.url).pathname).toBe(
      `/v1/${WORKSPACE}/insights/sessions/a%2Fb%3Fc/results/${RESULT}`,
    )
    expect(new URL(requests[0]!.url).search).toBe('')
    expect(new URL(requests[1]!.url).pathname).toBe(`/v1/${WORKSPACE}/insights/pins/..%2Fother`)
  })

  it('reads the published Home facts and surfaces an unavailable publication as a 503', async () => {
    const home = { source: { dataset_version: 'r2_x' }, agents: [], conversations: [], checks: [] }
    const available = setup(() => Response.json(home))
    expect(await available.client.insights.getDemoHome()).toEqual(home)
    expect(available.requests[0]!.url).toBe(`${BASE}/demo-home`)

    const unavailable = setup(() =>
      Response.json({ detail: 'The published Home facts are unavailable.' }, { status: 503 }),
    )
    await expect(
      unavailable.client.insights.withOptions({ maxRetries: 0 }).getDemoHome(),
    ).rejects.toBeInstanceOf(ServiceUnavailableError)
  })

  it('cancels a read through withOptions({ signal })', async () => {
    const controller = new AbortController()
    const { client, requests } = setup(
      (request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason), {
            once: true,
          })
        }),
    )

    const pending = client.insights
      .withOptions({ signal: controller.signal, maxRetries: 0 })
      .sessions.getResult(SESSION, RESULT)
    const settled = expect(pending).rejects.toBeDefined()
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()
    await settled

    expect(requests).toHaveLength(1)
  })
})

describe('InsightsResource shared pins', () => {
  it('lists a page with the caller’s limit and cursor', async () => {
    const page = { items: [pin], has_more: true, continuation_token: 20 }
    const { client, requests } = setup(() => Response.json(page))

    expect(await client.insights.pins.list({ limit: 20, continuation_token: 20 })).toEqual(page)
    const url = new URL(requests[0]!.url)
    expect(url.pathname).toBe(`/v1/${WORKSPACE}/insights/pins`)
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.get('continuation_token')).toBe('20')
  })

  it('omits the cursor on a first page', async () => {
    const { client, requests } = setup(() =>
      Response.json({ items: [], has_more: false, continuation_token: null }),
    )

    await client.insights.pins.list()
    expect(new URL(requests[0]!.url).search).toBe('')
  })

  it('auto-pages by sending each returned cursor until the server reports no more', async () => {
    const second = { ...pin, id: '77777777-7777-4777-8777-777777777777' }
    const { client, requests } = setup((request) =>
      new URL(request.url).searchParams.get('continuation_token') === '1'
        ? Response.json({ items: [second], has_more: false, continuation_token: null })
        : Response.json({ items: [pin], has_more: true, continuation_token: 1 }),
    )

    const ids: string[] = []
    for await (const item of client.insights.pins.listAutoPaging({ limit: 1 })) ids.push(item.id)

    expect(ids).toEqual([PIN, second.id])
    expect(requests.map((request) => new URL(request.url).search)).toEqual([
      '?limit=1',
      '?limit=1&continuation_token=1',
    ])
  })

  it('creates a pin from a session presentation', async () => {
    const { client, requests } = setup(() => Response.json({ ...pin, revision: 1 }))
    const body = { session_id: SESSION, presentation_id: PRESENTATION, question: pin.question }

    expect((await client.insights.pins.create(body)).revision).toBe(1)
    expect(requests[0]!.method).toBe('POST')
    expect(requests[0]!.url).toBe(`${BASE}/pins`)
    expect(await requests[0]!.json()).toEqual(body)
  })

  it('sends the expected revision in the body for refresh and undo', async () => {
    const { client, requests } = setup(() => Response.json({ ...pin, revision: 4 }))

    await client.insights.pins.refresh(PIN, { revision: 3 })
    await client.insights.pins.undo(PIN, { revision: 4 })

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST ${BASE}/pins/${PIN}/refresh`,
      `POST ${BASE}/pins/${PIN}/undo`,
    ])
    expect(await requests[0]!.json()).toEqual({ revision: 3 })
    expect(await requests[1]!.json()).toEqual({ revision: 4 })
  })

  it('sends the expected revision as a query value for delete and returns the tombstone', async () => {
    const tombstone = {
      ...pin,
      revision: 4,
      deleted_at: '2026-11-12T10:06:00Z',
      undo_until: '2026-11-12T10:06:30Z',
    }
    const { client, requests } = setup(() => Response.json(tombstone))

    expect(await client.insights.pins.delete(PIN, { revision: 3 })).toEqual(tombstone)
    expect(requests[0]!.method).toBe('DELETE')
    expect(requests[0]!.url).toBe(`${BASE}/pins/${PIN}?revision=3`)
    expect(requests[0]!.body).toBeNull()
  })

  it('reports a stale revision as a ConflictError and does not replay the write', async () => {
    const { client, requests } = setup(() =>
      Response.json({ detail: 'This pin changed.' }, { status: 409 }),
    )

    await expect(client.insights.pins.refresh(PIN, { revision: 2 })).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(requests).toHaveLength(1)
  })

  it('returns a failed refresh as the last good pin with its refresh_error', async () => {
    const failed = { ...pin, revision: 4, refresh_error: 'The source could not be refreshed.' }
    const { client } = setup(() => Response.json(failed))

    const refreshed = await client.insights.pins.refresh(PIN, { revision: 3 })
    expect(refreshed.refresh_error).toBe('The source could not be refreshed.')
    expect(refreshed.block).toEqual(pin.block)
  })
})
