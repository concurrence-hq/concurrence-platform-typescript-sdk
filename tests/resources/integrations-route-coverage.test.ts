import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('IntegrationsResource', () => {
  it('approveWrite calls POST /integrations/approvals/{conversation_id}/approve', async () => {
    const { client, requests } = recordRoutes(200)
    await client.integrations.approveWrite('conversation_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(
      `/v1/$WORKSPACE-1/integrations/approvals/conversation_id-1/approve`,
    )
  })

  it('rejectWrite calls POST /integrations/approvals/{conversation_id}/reject', async () => {
    const { client, requests } = recordRoutes(200)
    await client.integrations.rejectWrite('conversation_id-1', { probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(
      `/v1/$WORKSPACE-1/integrations/approvals/conversation_id-1/reject`,
    )
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
