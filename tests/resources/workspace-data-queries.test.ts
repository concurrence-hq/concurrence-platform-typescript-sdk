import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { NotFoundError } from '../../src/core/errors.js'
import type { CreateWorkspaceDataQueryRequest, WorkspaceDataQuery } from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}`
const QUERY_ID = '00000000-0000-0000-0000-000000000123'

const QUERY_FIXTURE = {
  id: QUERY_ID,
  name: 'recent_orders',
  description: 'Recent orders by status',
  sql_template: 'select * from custom.orders where status = :status',
  parameters: [
    {
      name: 'status',
      type: 'string',
      description: 'Order status',
      default: 'open',
    },
  ],
  timeout_ms: 5000,
  declarations: { reads: null },
  last_invoked_at: null,
  deployed_at: '2026-05-20T00:00:00Z',
  deployed_by: '00000000-0000-0000-0000-000000000001',
} satisfies WorkspaceDataQuery

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/data_queries`]: () =>
      Response.json({
        items: [{ ...QUERY_FIXTURE, parameter_count: 1 }],
        count: 1,
      }),
    [`POST ${BASE}/data_queries`]: () => Response.json(QUERY_FIXTURE, { status: 201 }),
    [`GET ${BASE}/data_queries/${QUERY_ID}`]: () => Response.json(QUERY_FIXTURE),
    [`GET ${BASE}/data_queries/not-found`]: () =>
      Response.json({ detail: 'workspace data query not found' }, { status: 404 }),
    [`PATCH ${BASE}/data_queries/${QUERY_ID}`]: () =>
      Response.json({ ...QUERY_FIXTURE, description: 'Updated description' }),
    [`POST ${BASE}/data_queries/${QUERY_ID}/invoke`]: () =>
      Response.json({ result: [{ id: 'order-1' }], row_count: 1, duration_ms: 12 }),
    [`DELETE ${BASE}/data_queries/${QUERY_ID}`]: () => new Response(null, { status: 204 }),
  }),
})

describe('WorkspaceDataQueriesResource', () => {
  it('lists workspace data queries', async () => {
    const result = await client.workspaceDataQueries.list()

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.name).toBe('recent_orders')
  })

  it('creates a workspace data query', async () => {
    const result = await client.workspaceDataQueries.create({
      name: 'recent_orders',
      description: 'Recent orders by status',
      sql_template: 'select * from custom.orders where status = :status',
      parameters: [{ name: 'status', type: 'string', description: 'Order status' }],
    })

    expect(result.id).toBe(QUERY_ID)
    expect(result.parameters).toHaveLength(1)
  })

  it('sends declarations on create and update, and reads them back', async () => {
    const practiceData = {
      ...QUERY_FIXTURE,
      name: 'office_hours',
      declarations: { reads: { patient_in: 'none' } },
    } satisfies WorkspaceDataQuery
    const bodies: unknown[] = []
    const recording = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: mockFetch({
        [`POST ${BASE}/data_queries`]: ({ body }) => {
          bodies.push(body)
          return Response.json(practiceData, { status: 201 })
        },
        [`PATCH ${BASE}/data_queries/${QUERY_ID}`]: ({ body }) => {
          bodies.push(body)
          return Response.json({ ...practiceData, declarations: { reads: null } })
        },
      }),
    })

    const create = {
      name: 'office_hours',
      description: 'Opening hours by location',
      sql_template: 'select location, opens, closes from custom.office_hours',
      declarations: { reads: { patient_in: 'none' } },
    } satisfies CreateWorkspaceDataQueryRequest
    const created = await recording.workspaceDataQueries.create(create)
    const updated = await recording.workspaceDataQueries.update(QUERY_ID, {
      declarations: { reads: null },
    })

    expect(bodies).toEqual([create, { declarations: { reads: null } }])
    expect(created.declarations.reads).toEqual({ patient_in: 'none' })
    expect(updated.declarations.reads).toBeNull()
  })

  it('gets a workspace data query by id', async () => {
    const result = await client.workspaceDataQueries.get(QUERY_ID)

    expect(result.sql_template).toContain(':status')
  })

  it('throws NotFoundError for a missing workspace data query', async () => {
    await expect(client.workspaceDataQueries.get('not-found')).rejects.toThrow(NotFoundError)
  })

  it('updates a workspace data query', async () => {
    const result = await client.workspaceDataQueries.update(QUERY_ID, {
      description: 'Updated description',
    })

    expect(result.description).toBe('Updated description')
  })

  it('invokes a workspace data query', async () => {
    const result = await client.workspaceDataQueries.invoke(QUERY_ID, {
      input: { status: 'open' },
    })

    expect(result.row_count).toBe(1)
    expect(result.result?.[0]).toMatchObject({ id: 'order-1' })
  })

  it('deletes a workspace data query', async () => {
    await expect(client.workspaceDataQueries.delete(QUERY_ID)).resolves.toBeUndefined()
  })
})
