import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}/metric-definitions`

const DEFINITION = {
  definition: { key: 'booked_calls' },
  revision: 2,
  updated_at: '2026-11-07T12:00:00Z',
  transform_kind: 'count',
}

let lastPutBody: unknown

const client = new AmigoClient({
  apiKey: 'test-api-key-abc123',
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}`]: () =>
      Response.json({ items: [DEFINITION], has_more: false, continuation_token: null }),
    [`GET ${BASE}/booked_calls`]: () => Response.json(DEFINITION),
    [`PUT ${BASE}/booked_calls`]: ({ body }) => {
      lastPutBody = body
      return Response.json({ ...DEFINITION, revision: 3 })
    },
    [`DELETE ${BASE}/booked_calls`]: () => new Response(null, { status: 204 }),
    [`GET ${BASE}/booked_calls/revisions`]: () =>
      Response.json({ items: [{ revision: 2 }], has_more: false, continuation_token: null }),
    [`GET ${BASE}/booked_calls/revisions/2`]: () => Response.json({ revision: 2 }),
  }),
})

describe('MetricsResource.definitions', () => {
  it('searches, reads and lists revisions by key', async () => {
    const list = await client.metrics.definitions.list({ query: 'booked' })
    expect(list.items[0]?.revision).toBe(2)
    expect((await client.metrics.definitions.get('booked_calls')).transform_kind).toBe('count')
    const revisions = await client.metrics.definitions.listRevisions('booked_calls')
    expect(revisions.items).toHaveLength(1)
    expect((await client.metrics.definitions.getRevision('booked_calls', 2)).revision).toBe(2)
  })

  it('puts a definition against the expected revision and deletes it', async () => {
    const body = {
      definition: { key: 'booked_calls' },
      expected_revision: 2,
    } as Parameters<typeof client.metrics.definitions.put>[1]
    const result = await client.metrics.definitions.put('booked_calls', body)
    expect(lastPutBody).toEqual(body)
    expect(result.revision).toBe(3)
    await expect(client.metrics.definitions.delete('booked_calls')).resolves.toBeUndefined()
  })
})
