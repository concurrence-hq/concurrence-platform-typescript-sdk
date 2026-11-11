import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

describe('ModelsResource', () => {
  it('list calls GET /models', async () => {
    const { client, requests } = recordRoutes(200)
    await client.models.list()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/models`)
  })

  it('list returns reasoning_efforts as the API sent them', async () => {
    const model = { id: 'm', reasoning_efforts: ['low', 'high'] }
    const { client } = recordRoutes(200, () => Response.json({ items: [model] }))
    const result = await client.models.list()
    expect(JSON.stringify(result)).toContain('"reasoning_efforts":["low","high"]')
  })
})
