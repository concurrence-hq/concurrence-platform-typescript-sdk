import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('TracesResource', () => {
  it('export calls POST /traces:export', async () => {
    const { client, requests } = recordRoutes(200)
    await client.traces.export({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/traces:export`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
