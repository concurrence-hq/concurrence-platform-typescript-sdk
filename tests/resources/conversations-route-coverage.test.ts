import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('ConversationsResource', () => {
  it('decideApproval calls POST /conversations/{conversation_id}/approval', async () => {
    const { client, requests } = recordRoutes(204)
    await client.conversations.decideApproval('conversation_id-1', { probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/conversations/conversation_id-1/approval`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('listTurns calls GET /conversations/{conversation_id}/turns', async () => {
    const { client, requests } = recordRoutes(200)
    await client.conversations.listTurns('conversation_id-1', { limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/conversations/conversation_id-1/turns`)
    expect(requests[0]?.search).toContain('limit=5')
  })

  it('acknowledgeTurnDelivery calls POST /conversations/{conversation_id}/turns/{delivery_id}/ack', async () => {
    const { client, requests } = recordRoutes(204)
    await client.conversations.acknowledgeTurnDelivery('conversation_id-1', 'delivery_id-1', {
      probe: 'body',
    } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(
      `/v1/$WORKSPACE-1/conversations/conversation_id-1/turns/delivery_id-1/ack`,
    )
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
