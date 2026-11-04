import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

describe('ReviewQueueResource', () => {
  it('list calls GET /external-write-proposals', async () => {
    const { client, requests } = recordRoutes(200)
    await client.reviewQueue.list({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/external-write-proposals`)
    expect(requests[0]?.search).toContain('limit=5')
  })

  it('listAutoPaging follows continuation tokens', async () => {
    const { client, requests } = recordRoutes(200, (request) => {
      const next = new URL(request.url).searchParams.get('continuation_token')
      return Response.json({
        items: [{ id: next ?? 'first' }],
        has_more: next === null,
        continuation_token: next === null ? 'opaque+/=' : null,
      })
    })
    const items = []
    for await (const item of client.reviewQueue.listAutoPaging()) items.push(item)
    expect(items).toEqual([{ id: 'first' }, { id: 'opaque+/=' }])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.pathname).toBe(`/v1/${WORKSPACE}/external-write-proposals`)
    expect(requests[1]?.search).toContain('continuation_token=opaque%2B%2F%3D')
  })

  it('approve calls POST /external-write-proposals/{proposal_id}/approve', async () => {
    const { client, requests } = recordRoutes(200)
    await client.reviewQueue.approve('proposal_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(
      `/v1/$WORKSPACE-1/external-write-proposals/proposal_id-1/approve`,
    )
  })

  it('reject calls POST /external-write-proposals/{proposal_id}/reject', async () => {
    const { client, requests } = recordRoutes(200)
    await client.reviewQueue.reject('proposal_id-1', { probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(
      `/v1/$WORKSPACE-1/external-write-proposals/proposal_id-1/reject`,
    )
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
