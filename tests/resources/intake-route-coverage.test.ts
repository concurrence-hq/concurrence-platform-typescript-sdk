import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('IntakeResource', () => {
  it('getBatchProcessingManifest calls GET /intake/batches/{batch_id}/processing-manifest', async () => {
    const { client, requests } = recordRoutes(200)
    await client.intake.getBatchProcessingManifest('batch_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(
      `/v1/$WORKSPACE-1/intake/batches/batch_id-1/processing-manifest`,
    )
  })

  it('writeBackFileStatus calls POST /intake/files/{file_id}/status', async () => {
    const { client, requests } = recordRoutes(200)
    await client.intake.writeBackFileStatus('file_id-1', { probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/intake/files/file_id-1/status`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
