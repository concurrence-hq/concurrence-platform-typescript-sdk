import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'

const TEST_API_KEY = 'test-api-key'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const WS = `/v1/${TEST_WORKSPACE_ID}`
const STATEMENT_ID = 'statement-001'

const EVENTS_RESPONSE = {
  events: [],
  has_more: false,
  limit: 50,
  offset: 0,
  total: 0,
}

const EXPORT_RESULT = {
  chunks: [],
  result_format: 'JSON_ARRAY',
  statement_id: STATEMENT_ID,
  status: 'SUCCEEDED',
  total_row_count: 0,
}

function createRecordingClient() {
  const requests: { method: string; url: URL }[] = []
  const client = new AmigoClient({
    apiKey: TEST_API_KEY,
    workspaceId: TEST_WORKSPACE_ID,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const url = new URL(request.url)
      requests.push({ method: request.method.toUpperCase(), url })
      if (url.pathname === `${WS}/audit/export/${STATEMENT_ID}`) {
        return Response.json(EXPORT_RESULT)
      }
      return Response.json(EVENTS_RESPONSE)
    },
  })
  return { client, requests }
}

describe('AuditResource', () => {
  it('polls an async export by statement id under the workspace path', async () => {
    const { client, requests } = createRecordingClient()

    const result = await client.audit.getExport(STATEMENT_ID)

    expect(result.statement_id).toBe(STATEMENT_ID)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.url.pathname).toBe(`${WS}/audit/export/${STATEMENT_ID}`)
  })

  it('lists my audit events without a workspace path segment', async () => {
    const { client, requests } = createRecordingClient()

    const result = await client.audit.listMyAuditEvents({ limit: 10, action: 'read' })

    expect(result.has_more).toBe(false)
    // Account-scoped: the request path must NOT carry a `/v1/<workspace_id>/` prefix.
    expect(requests[0]?.url.pathname).toBe('/v1/audit-log/me')
    expect(requests[0]?.url.searchParams.get('limit')).toBe('10')
    expect(requests[0]?.url.searchParams.get('action')).toBe('read')
    expect(requests.every((r) => !r.url.pathname.includes(TEST_WORKSPACE_ID))).toBe(true)
  })

  it('lists platform audit events cross-workspace without forcing a workspace path', async () => {
    const { client, requests } = createRecordingClient()

    await client.audit.listPlatformAuditEvents({
      workspace_id: TEST_WORKSPACE_ID,
      phi_only: true,
    })

    // Platform-admin scope: workspace filtering is a query param, never a path segment.
    expect(requests[0]?.url.pathname).toBe('/v1/audit-log/platform')
    expect(requests[0]?.url.searchParams.get('workspace_id')).toBe(TEST_WORKSPACE_ID)
    expect(requests[0]?.url.searchParams.get('phi_only')).toBe('true')
  })
})
