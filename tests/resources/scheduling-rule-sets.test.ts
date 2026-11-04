import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

describe('SchedulingRuleSetsResource', () => {
  it('list calls GET /scheduling-rule-sets', async () => {
    const { client, requests } = recordRoutes(200)
    await client.schedulingRuleSets.list({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/scheduling-rule-sets`)
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
    for await (const item of client.schedulingRuleSets.listAutoPaging()) items.push(item)
    expect(items).toEqual([{ id: 'first' }, { id: 'opaque+/=' }])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.pathname).toBe(`/v1/${WORKSPACE}/scheduling-rule-sets`)
    expect(requests[1]?.search).toContain('continuation_token=opaque%2B%2F%3D')
  })

  it('create calls POST /scheduling-rule-sets', async () => {
    const { client, requests } = recordRoutes(200)
    await client.schedulingRuleSets.create({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/scheduling-rule-sets`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('get calls GET /scheduling-rule-sets/{rule_set_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.schedulingRuleSets.get('rule_set_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/scheduling-rule-sets/rule_set_id-1`)
  })

  it('update calls PATCH /scheduling-rule-sets/{rule_set_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.schedulingRuleSets.update('rule_set_id-1', { probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('PATCH')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/scheduling-rule-sets/rule_set_id-1`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('delete calls DELETE /scheduling-rule-sets/{rule_set_id}', async () => {
    const { client, requests } = recordRoutes(204)
    await client.schedulingRuleSets.delete('rule_set_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('DELETE')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/scheduling-rule-sets/rule_set_id-1`)
  })
})
