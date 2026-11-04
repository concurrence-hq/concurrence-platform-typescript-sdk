import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('UseCasesResource', () => {
  it('getServiceBinding calls GET /use-cases/{use_case_id}/service-binding', async () => {
    const { client, requests } = recordRoutes(200)
    await client.useCases.getServiceBinding('use_case_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/use-cases/use_case_id-1/service-binding`)
  })

  it('bindService calls PUT /use-cases/{use_case_id}/service-binding', async () => {
    const { client, requests } = recordRoutes(200)
    await client.useCases.bindService('use_case_id-1', { probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/use-cases/use_case_id-1/service-binding`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('unbindService calls DELETE /use-cases/{use_case_id}/service-binding', async () => {
    const { client, requests } = recordRoutes(204)
    await client.useCases.unbindService('use_case_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('DELETE')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/use-cases/use_case_id-1/service-binding`)
  })
})
