import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('SessionsResource', () => {
  it('start calls POST /sessions/start', async () => {
    const { client, requests } = recordRoutes(200)
    await client.sessions.start({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/sessions/start`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
