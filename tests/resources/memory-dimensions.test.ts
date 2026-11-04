import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('MemoryDimensionsResource', () => {
  it('create calls POST /memory/dimensions', async () => {
    const { client, requests } = recordRoutes(200)
    await client.memoryDimensions.create({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/memory/dimensions`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
