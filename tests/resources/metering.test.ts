import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('MeteringResource', () => {
  it('emit calls POST /metering/emit', async () => {
    const { client, requests } = recordRoutes(200)
    await client.metering.emit({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/metering/emit`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
