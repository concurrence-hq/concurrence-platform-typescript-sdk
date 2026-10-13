import { describe, it, expect } from 'vitest'
import { AmigoClient, BadRequestError, type WorkspaceQueryResponse } from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

const TEST_API_KEY = 'test-api-key'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}`

const QUERY_RESULT = {
  columns: ['id', 'status'],
  rows: [{ id: 'c1', status: 'open' }],
  row_count: 1,
} satisfies WorkspaceQueryResponse

const sentQueries: unknown[] = []

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/query/analytics/calls`]: () =>
      Response.json({ rows: [{ id: 'c1' }], next_offset: null }),
    [`POST ${BASE}/query`]: ({ body }) => {
      sentQueries.push(body)
      return (body as { sql: string }).sql.startsWith('CREATE')
        ? Response.json({ detail: 'permission denied for schema custom' }, { status: 400 })
        : Response.json(QUERY_RESULT)
    },
  }),
})

describe('DataQueryResource', () => {
  it('runs a query against a whitelisted dataset', async () => {
    const result = await client.dataQuery.run('analytics', 'calls', { limit: 50 })
    expect(result).toMatchObject({ rows: [{ id: 'c1' }] })
  })

  it('executes one SQL statement and returns its columns and rows', async () => {
    const sql = "SELECT id, status FROM custom.cases WHERE status = 'open'"
    const result = await client.dataQuery.execute({ sql })

    expect(sentQueries.at(-1)).toEqual({ sql })
    expect(result.columns).toEqual(['id', 'status'])
    expect(result.rows[0]?.status).toBe('open')
    expect(result.row_count).toBe(1)
  })

  it('throws BadRequestError with the Postgres message for SQL the role cannot run', async () => {
    await expect(
      client.dataQuery.execute({ sql: 'CREATE TABLE custom.t (id int)' }),
    ).rejects.toThrow(BadRequestError)
  })
})
