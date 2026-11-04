import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

describe('ExternalAuthClaimMappingsResource', () => {
  it('list calls GET /external-auth-claim-mappings', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalAuthClaimMappings.list({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/external-auth-claim-mappings`)
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
    for await (const item of client.externalAuthClaimMappings.listAutoPaging()) items.push(item)
    expect(items).toEqual([{ id: 'first' }, { id: 'opaque+/=' }])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.pathname).toBe(`/v1/${WORKSPACE}/external-auth-claim-mappings`)
    expect(requests[1]?.search).toContain('continuation_token=opaque%2B%2F%3D')
  })

  it('create calls POST /external-auth-claim-mappings', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalAuthClaimMappings.create({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/external-auth-claim-mappings`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('resolvePreview calls POST /external-auth-claim-mappings/resolve-preview', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalAuthClaimMappings.resolvePreview({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(
      `/v1/$WORKSPACE-1/external-auth-claim-mappings/resolve-preview`,
    )
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('get calls GET /external-auth-claim-mappings/{mapping_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalAuthClaimMappings.get('mapping_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/external-auth-claim-mappings/mapping_id-1`)
  })

  it('supersede calls POST /external-auth-claim-mappings/{mapping_id}/supersede', async () => {
    const { client, requests } = recordRoutes(200)
    await client.externalAuthClaimMappings.supersede('mapping_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(
      `/v1/$WORKSPACE-1/external-auth-claim-mappings/mapping_id-1/supersede`,
    )
  })
})
