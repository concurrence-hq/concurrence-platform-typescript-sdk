import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

describe('ExternalRolesResource', () => {
  it('list calls GET /external-roles', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalRoles.list({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/external-roles`)
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
    for await (const item of client.externalRoles.listAutoPaging()) items.push(item)
    expect(items).toEqual([{ id: 'first' }, { id: 'opaque+/=' }])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.pathname).toBe(`/v1/${WORKSPACE}/external-roles`)
    expect(requests[1]?.search).toContain('continuation_token=opaque%2B%2F%3D')
  })

  it('create calls POST /external-roles', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalRoles.create({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/external-roles`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('get calls GET /external-roles/{role_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalRoles.get('role_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/external-roles/role_id-1`)
  })

  it('delete calls DELETE /external-roles/{role_id}', async () => {
    const { client, requests } = recordRoutes(204)
    await client.externalRoles.delete('role_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('DELETE')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/external-roles/role_id-1`)
  })
})
