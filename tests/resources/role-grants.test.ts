import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

describe('RoleGrantsResource', () => {
  it('list calls GET /role-grants', async () => {
    const { client, requests } = recordRoutes(200)
    await client.roleGrants.list({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/role-grants`)
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
    for await (const item of client.roleGrants.listAutoPaging()) items.push(item)
    expect(items).toEqual([{ id: 'first' }, { id: 'opaque+/=' }])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.pathname).toBe(`/v1/${WORKSPACE}/role-grants`)
    expect(requests[1]?.search).toContain('continuation_token=opaque%2B%2F%3D')
  })

  it('create calls POST /role-grants', async () => {
    const { client, requests } = recordRoutes(200)
    await client.roleGrants.create({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/role-grants`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('get calls GET /role-grants/{grant_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.roleGrants.get('grant_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/role-grants/grant_id-1`)
  })

  it('supersede calls DELETE /role-grants/{grant_id}', async () => {
    const { client, requests } = recordRoutes(204)
    await client.roleGrants.supersede('grant_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('DELETE')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/role-grants/grant_id-1`)
  })
})
