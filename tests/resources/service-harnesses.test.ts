import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

const SERVICE = `/v1/${WORKSPACE}/services/service_id-1`

describe('ServicesResource harness settings and pins', () => {
  it('getSettings calls GET /settings', async () => {
    const { client, requests } = recordRoutes(200)
    await client.services.getSettings('service_id-1')
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`${SERVICE}/settings`)
  })

  it('setSettings calls PUT /settings with the values', async () => {
    const { client, requests } = recordRoutes(200)
    await client.services.setSettings('service_id-1', { settings: { probe: 1 } })
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.pathname).toBe(`${SERVICE}/settings`)
    expect(requests[0]?.body).toEqual({ settings: { probe: 1 } })
  })

  it('getSettingsSchema calls GET /settings/schema', async () => {
    const { client, requests } = recordRoutes(200)
    await client.services.getSettingsSchema('service_id-1')
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`${SERVICE}/settings/schema`)
  })

  it('getHarnesses calls GET /harnesses', async () => {
    const { client, requests } = recordRoutes(200)
    await client.services.getHarnesses('service_id-1')
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`${SERVICE}/harnesses`)
  })

  it('setHarnessPins calls PUT /harness-pins with the pins', async () => {
    const { client, requests } = recordRoutes(200)
    const body = {
      pins: [{ kind: 'voice' as const, harness: 'concurrence', tag: 'in-tree' }],
      drop_orphaned: true,
    }
    await client.services.setHarnessPins('service_id-1', body)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.pathname).toBe(`${SERVICE}/harness-pins`)
    expect(requests[0]?.body).toEqual(body)
  })
})

describe('HarnessesResource', () => {
  it('listDefaults calls GET /v1/platform/harness-defaults without the workspace', async () => {
    const { client, requests } = recordRoutes(200)
    await client.harnesses.listDefaults()
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe('/v1/platform/harness-defaults')
  })

  it('setDefault calls PUT /v1/platform/harness-defaults/{kind}/{harness}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.harnesses.setDefault('voice', 'concurrence', { tag: 'in-tree' })
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.pathname).toBe('/v1/platform/harness-defaults/voice/concurrence')
    expect(requests[0]?.body).toEqual({ tag: 'in-tree' })
  })

  it('listReleases calls GET /v1/platform/harness-releases with its filters', async () => {
    const { client, requests } = recordRoutes(200)
    await client.harnesses.listReleases({ kind: 'text', harness: 'openai', limit: 10 })
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe('/v1/platform/harness-releases')
    expect(requests[0]?.search).toContain('kind=text')
    expect(requests[0]?.search).toContain('harness=openai')
    expect(requests[0]?.search).toContain('limit=10')
  })
})
