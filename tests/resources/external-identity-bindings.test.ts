import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

describe('ExternalIdentityBindingsResource', () => {
  it('list calls GET /external-identity-bindings', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalIdentityBindings.list({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/external-identity-bindings`)
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
    for await (const item of client.externalIdentityBindings.listAutoPaging()) items.push(item)
    expect(items).toEqual([{ id: 'first' }, { id: 'opaque+/=' }])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.pathname).toBe(`/v1/${WORKSPACE}/external-identity-bindings`)
    expect(requests[1]?.search).toContain('continuation_token=opaque%2B%2F%3D')
  })

  it('upsert calls PUT /external-identity-bindings', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalIdentityBindings.upsert({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/external-identity-bindings`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('get calls GET /external-identity-bindings/{binding_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalIdentityBindings.get('binding_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/external-identity-bindings/binding_id-1`)
  })

  it('delete calls DELETE /external-identity-bindings/{binding_id}', async () => {
    const { client, requests } = recordRoutes(204)
    await client.externalIdentityBindings.delete('binding_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('DELETE')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/external-identity-bindings/binding_id-1`)
  })
})
