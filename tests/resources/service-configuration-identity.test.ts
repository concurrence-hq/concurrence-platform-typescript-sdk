import { describe, expect, it } from 'vitest'
import { ConflictError } from '../../src/index.js'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

const SERVICE_ID = '00000000-0000-0000-0000-000000000002'
const SERVICE = `/v1/${WORKSPACE}/services/${SERVICE_ID}`
const IDENTITY = {
  workspace_id: WORKSPACE,
  service_id: SERVICE_ID,
  version_set: 'staging_candidate',
  service_config_digest: `sha256:${'a'.repeat(64)}`,
  updated_at: '2026-11-12T02:03:04.123456+00:00',
}

describe('ServicesResource configuration identity', () => {
  it('reads the explicit version set and returns the server identity unchanged', async () => {
    const { client, requests } = recordRoutes(200, () => Response.json(IDENTITY))

    const identity = await client.services.getConfigurationIdentity(SERVICE_ID, {
      version_set: IDENTITY.version_set,
    })

    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`${SERVICE}/configuration-identity`)
    expect(requests[0]?.search).toBe('?version_set=staging_candidate')
    expect(identity).toMatchObject(IDENTITY)
  })

  it.each(['settings', 'harness-pins'] as const)(
    'round-trips microsecond timestamp precision into the %s write',
    async (route) => {
      const { client, requests } = recordRoutes(200, (request) =>
        Response.json(request.method === 'GET' ? IDENTITY : {}),
      )
      const identity = await client.services.getConfigurationIdentity(SERVICE_ID, {
        version_set: IDENTITY.version_set,
      })

      if (route === 'settings') {
        await client.services.setSettings(SERVICE_ID, {
          settings: { probe: 1 },
          expected_updated_at: identity.updated_at,
        })
      } else {
        await client.services.setHarnessPins(SERVICE_ID, {
          pins: [],
          expected_updated_at: identity.updated_at,
        })
      }

      expect(requests).toHaveLength(2)
      expect(requests[1]?.method).toBe('PUT')
      expect(requests[1]?.pathname).toBe(`${SERVICE}/${route}`)
      expect(requests[1]?.body).toEqual({
        ...(route === 'settings' ? { settings: { probe: 1 } } : { pins: [] }),
        expected_updated_at: '2026-11-12T02:03:04.123456+00:00',
      })
    },
  )

  it.each(['settings', 'harness-pins'] as const)(
    'preserves a stale %s conflict without retrying',
    async (route) => {
      const body = { detail: 'The service changed since it was read, so nothing was stored.' }
      const { client, requests } = recordRoutes(200, () => Response.json(body, { status: 409 }))
      const write =
        route === 'settings'
          ? client.services.setSettings(SERVICE_ID, {
              settings: {},
              expected_updated_at: IDENTITY.updated_at,
            })
          : client.services.setHarnessPins(SERVICE_ID, {
              pins: [],
              expected_updated_at: IDENTITY.updated_at,
            })

      await expect(write).rejects.toBeInstanceOf(ConflictError)
      await expect(write).rejects.toMatchObject({ statusCode: 409, errorBody: body })
      expect(requests).toHaveLength(1)
      expect(requests[0]?.method).toBe('PUT')
    },
  )
})
