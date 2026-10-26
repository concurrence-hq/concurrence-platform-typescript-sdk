import { describe, it, expect } from 'vitest'
import {
  AmigoClient,
  BadRequestError,
  ValidationError,
  type WorkspaceQueryResponse,
} from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

const TEST_API_KEY = 'test-api-key'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}`

const QUERY_RESULT = {
  columns: ['id', 'status'],
  rows: [{ id: 'c1', status: 'open' }],
  row_count: 1,
} satisfies WorkspaceQueryResponse

// The platform's 422 for a statement outside the workspace SQL allowlist, in FastAPI's validation
// shape: the field and the rule it broke.
const OUTSIDE_ALLOWLIST = {
  detail: [
    {
      loc: ['body', 'sql'],
      msg: 'Value error, CREATE statements are not allowed, only SELECT, INSERT, UPDATE, DELETE and TRUNCATE',
      type: 'value_error',
    },
  ],
}

const sentQueries: unknown[] = []

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/query/analytics/calls`]: () =>
      Response.json({ rows: [{ id: 'c1' }], next_offset: null }),
    [`POST ${BASE}/query`]: ({ body }) => {
      sentQueries.push(body)
      const { sql } = body as { sql: string }
      if (sql.startsWith('CREATE')) return Response.json(OUTSIDE_ALLOWLIST, { status: 422 })
      if (sql.includes('custom.secrets')) {
        return Response.json({ detail: 'permission denied for table secrets' }, { status: 400 })
      }
      return Response.json(QUERY_RESULT)
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

  it('throws ValidationError for SQL outside the workspace allowlist, DDL included', async () => {
    const refused = client.dataQuery.execute({ sql: 'CREATE TABLE custom.t (id int)' })

    await expect(refused).rejects.toBeInstanceOf(ValidationError)
    await expect(refused).rejects.toMatchObject({
      statusCode: 422,
      errorBody: {
        detail: [{ msg: expect.stringContaining('CREATE statements are not allowed') }],
      },
    })
  })

  it('throws BadRequestError with the Postgres message for an allowed statement the role cannot run', async () => {
    const refused = client.dataQuery.execute({ sql: 'SELECT * FROM custom.secrets' })

    await expect(refused).rejects.toBeInstanceOf(BadRequestError)
    await expect(refused).rejects.toMatchObject({
      statusCode: 400,
      detail: 'permission denied for table secrets',
    })
  })
})
