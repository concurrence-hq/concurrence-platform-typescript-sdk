import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('WorldResource', () => {
  it('getDashboard calls GET /world/dashboard', async () => {
    const { client, requests } = recordRoutes(200)
    await client.world.getDashboard()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/world/dashboard`)
  })

  it('listEnrichmentKeys calls GET /world/enrichment-keys', async () => {
    const { client, requests } = recordRoutes(200)
    await client.world.listEnrichmentKeys({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/world/enrichment-keys`)
    expect(requests[0]?.search).toContain('limit=5')
  })

  it('createEnrichmentKey calls POST /world/enrichment-keys', async () => {
    const { client, requests } = recordRoutes(200)
    await client.world.createEnrichmentKey({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/world/enrichment-keys`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('updateEnrichmentKey calls PATCH /world/enrichment-keys/{key_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.world.updateEnrichmentKey('key_id-1', { probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('PATCH')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/world/enrichment-keys/key_id-1`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('deleteEnrichmentKey calls DELETE /world/enrichment-keys/{key_id}', async () => {
    const { client, requests } = recordRoutes(204)
    await client.world.deleteEnrichmentKey('key_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('DELETE')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/world/enrichment-keys/key_id-1`)
  })

  it('resolveEntity calls POST /world/entities/resolve', async () => {
    const { client, requests } = recordRoutes(200)
    await client.world.resolveEntity({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/world/entities/resolve`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('putEntityEnrichment calls PUT /world/entities/{entity_id}/enrichment/{key}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.world.putEntityEnrichment(
      'entity-1',
      'key-1',
      { probe: 'body' } as never,
      'idem-1',
    )
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.pathname).toBe(
      `/v1/$WORKSPACE-1/world/entities/entity_id-1/enrichment/key-1`,
    )
    expect(requests[0]?.body).toEqual({ probe: 'body' })
    expect(requests[0]?.headers.get('idempotency-key')).toBe('idem-1')
  })

  it('listEventTypes calls GET /world/event-types', async () => {
    const { client, requests } = recordRoutes(200)
    await client.world.listEventTypes()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/world/event-types`)
  })

  it('importMigrationConversations calls POST /world/migration/conversations', async () => {
    const { client, requests } = recordRoutes(200)
    await client.world.importMigrationConversations({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/world/migration/conversations`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
