import { describe, expect, it } from 'vitest'
import {
  AmigoClient,
  NotFoundError,
  ValidationError,
  type CreateDashboardRequest,
  type Dashboard,
  type DashboardExecuteResponse,
} from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}/dashboards`
const DASHBOARD_ID = '00000000-0000-0000-0000-0000000000d1'

const DASHBOARD = {
  id: DASHBOARD_ID,
  workspace_id: TEST_WORKSPACE_ID,
  slug: 'call-quality',
  title: 'Call quality',
  description: null,
  page_context: 'calls',
  panels: [{ id: 'volume', query: 'SELECT day, calls FROM daily WHERE ws = :ws_id' }],
  filters: [{ id: 'days', kind: 'number', default: 7 }],
  refresh_interval: 0,
  is_active: true,
  created_at: '2026-10-11T18:00:00Z',
  updated_at: '2026-10-11T18:00:00Z',
} satisfies Dashboard

const EXECUTED = {
  dashboard_id: DASHBOARD_ID,
  results: [
    { panel_id: 'volume', columns: ['day', 'calls'], rows: [['2026-10-11', 12]], error: null },
    { panel_id: 'broken', columns: [], rows: [], error: 'Query execution failed' },
  ],
} satisfies DashboardExecuteResponse

type Route = (request: Request) => Response | Promise<Response>

function recordingClient(routes: Record<string, Route>) {
  const requests: Request[] = []
  const client = new AmigoClient({
    apiKey: TEST_API_KEY,
    workspaceId: TEST_WORKSPACE_ID,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const { pathname } = new URL(request.url)
      const route = routes[`${request.method} ${pathname}`]
      if (!route) {
        return Response.json(
          { detail: `No mock for ${request.method} ${pathname}` },
          { status: 500 },
        )
      }
      requests.push(request.clone())
      return route(request)
    },
  })
  return { client, requests }
}

describe('DashboardsResource', () => {
  it('lists dashboards for one console page with the continuation token', async () => {
    const { client, requests } = recordingClient({
      [`GET ${BASE}`]: () =>
        Response.json({ items: [DASHBOARD], has_more: true, continuation_token: 10 }),
    })

    const result = await client.dashboards.list({
      page_context: 'calls',
      limit: 10,
      continuation_token: 10,
    })

    expect(Object.fromEntries(new URL(requests[0]!.url).searchParams)).toEqual({
      page_context: 'calls',
      limit: '10',
      continuation_token: '10',
    })
    expect(result.items[0]?.slug).toBe('call-quality')
    expect(result.has_more).toBe(true)
  })

  it('auto-pages past the first page', async () => {
    const second = { ...DASHBOARD, id: '00000000-0000-0000-0000-0000000000d2', slug: 'intake' }
    const { client } = recordingClient({
      [`GET ${BASE}`]: (request) =>
        new URL(request.url).searchParams.get('continuation_token') === '1'
          ? Response.json({ items: [second], has_more: false, continuation_token: null })
          : Response.json({ items: [DASHBOARD], has_more: true, continuation_token: 1 }),
    })

    const slugs: string[] = []
    for await (const dashboard of client.dashboards.listAutoPaging({ limit: 1 })) {
      slugs.push(dashboard.slug)
    }

    expect(slugs).toEqual(['call-quality', 'intake'])
  })

  it('creates, reads, updates and deletes a dashboard', async () => {
    const body = {
      slug: 'call-quality',
      title: 'Call quality',
      page_context: 'calls',
      panels: DASHBOARD.panels,
      filters: DASHBOARD.filters,
    } satisfies CreateDashboardRequest
    const { client, requests } = recordingClient({
      [`POST ${BASE}`]: () => Response.json(DASHBOARD, { status: 201 }),
      [`GET ${BASE}/${DASHBOARD_ID}`]: () => Response.json(DASHBOARD),
      [`GET ${BASE}/by-slug/call-quality`]: () => Response.json(DASHBOARD),
      [`PUT ${BASE}/${DASHBOARD_ID}`]: () => Response.json({ ...DASHBOARD, title: 'Quality' }),
      [`DELETE ${BASE}/${DASHBOARD_ID}`]: () => new Response(null, { status: 204 }),
    })

    const created = await client.dashboards.create(body)
    const byId = await client.dashboards.get(DASHBOARD_ID)
    const bySlug = await client.dashboards.getBySlug('call-quality')
    const updated = await client.dashboards.update(DASHBOARD_ID, { title: 'Quality' })
    const deleted = await client.dashboards.delete(DASHBOARD_ID)

    expect(await requests[0]?.json()).toEqual(body)
    expect(await requests[3]?.json()).toEqual({ title: 'Quality' })
    expect(requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      `POST ${BASE}`,
      `GET ${BASE}/${DASHBOARD_ID}`,
      `GET ${BASE}/by-slug/call-quality`,
      `PUT ${BASE}/${DASHBOARD_ID}`,
      `DELETE ${BASE}/${DASHBOARD_ID}`,
    ])
    expect([created.id, byId.id, bySlug.id]).toEqual([DASHBOARD_ID, DASHBOARD_ID, DASHBOARD_ID])
    expect(updated.title).toBe('Quality')
    expect(deleted).toBeUndefined()
  })

  it('throws NotFoundError for an unknown slug', async () => {
    const { client } = recordingClient({
      [`GET ${BASE}/by-slug/nope`]: () =>
        Response.json({ detail: 'Dashboard not found' }, { status: 404 }),
    })

    await expect(client.dashboards.getBySlug('nope')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws ValidationError for a panel query without :ws_id', async () => {
    const { client } = recordingClient({
      [`POST ${BASE}`]: () =>
        Response.json(
          { detail: "Panel 'volume' query must reference :ws_id for workspace scoping" },
          { status: 422 },
        ),
    })

    await expect(
      client.dashboards.create({
        slug: 'unscoped',
        title: 'Unscoped',
        panels: [{ id: 'volume', query: 'SELECT 1' }],
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('executes with filter values, or with no body for the defaults', async () => {
    const { client, requests } = recordingClient({
      [`POST ${BASE}/${DASHBOARD_ID}/execute`]: () => Response.json(EXECUTED),
    })

    const filtered = await client.dashboards.execute(DASHBOARD_ID, { filter_values: { days: 30 } })
    await client.dashboards.execute(DASHBOARD_ID)

    expect(await requests[0]?.json()).toEqual({ filter_values: { days: 30 } })
    expect(requests[1]?.body).toBeNull()
    expect(filtered.results.map((panel) => panel.error ?? 'ok')).toEqual([
      'ok',
      'Query execution failed',
    ])
  })
})
