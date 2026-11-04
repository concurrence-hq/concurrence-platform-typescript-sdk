import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('ServicesResource', () => {
  it('previewPrompt calls POST /services/{service_id}/prompt-preview', async () => {
    const { client, requests } = recordRoutes(200)
    await client.services.previewPrompt(
      'service_id-1',
      { probe: 'body' } as never,
      { family: '2026-01-01' } as never,
    )
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/services/service_id-1/prompt-preview`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
    expect(requests[0]?.search).toContain('family=2026-01-01')
  })

  it('getReadiness calls GET /services/{service_id}/readiness', async () => {
    const { client, requests } = recordRoutes(200)
    await client.services.getReadiness('service_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/services/service_id-1/readiness`)
  })

  it('sendVoiceTurn calls POST /services/{service_id}/voice-turn', async () => {
    const { client, requests } = recordRoutes(200)
    await client.services.sendVoiceTurn('service-1', {
      audio: new Blob(['ogg']),
      phoneNumber: '+15555550100',
      accept: 'audio/wav',
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/services/service_id-1/voice-turn`)
    expect(requests[0]?.headers.get('accept')).toBe('audio/wav')
    expect(requests[0]?.headers.get('content-type')).toContain('multipart/form-data')
  })
})
