import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { ConfigurationError, ConflictError, PermissionError } from '../../src/core/errors.js'
import {
  OTHER_SET_ID,
  PINS_FIXTURE,
  RELEASE_ENTRY_FIXTURE,
  SERVICE_ID,
  SERVICE_UPDATED_AT,
  SET_ID,
  THIRD_SET_ID,
  WORKSPACE_ID,
} from '../helpers/dynamic-behavior-fixtures.js'

const SERVICE_PATH = `/v1/${WORKSPACE_ID}/services/${SERVICE_ID}`
const RELEASE_PATH = `${SERVICE_PATH}/version-sets/release`

const CANARY_ENTRY = {
  agent_version_number: 9,
  context_graph_version_number: 4,
  llm_model_preferences: {},
  dynamic_behavior_sets: [],
}

interface Recorded {
  method: string
  path: string
  rawBody: string | undefined
}

function serviceBody(release: unknown = RELEASE_ENTRY_FIXTURE) {
  return {
    id: SERVICE_ID,
    workspace_id: WORKSPACE_ID,
    name: 'Front Desk Line',
    description: '',
    agent_id: 'a1b2c3d4-0000-4000-8000-000000000001',
    context_graph_id: 'a1b2c3d4-0000-4000-8000-000000000002',
    keyterms: [],
    is_active: true,
    version_sets: { release, canary: CANARY_ENTRY },
    tags: [],
    tool_capacity: 5,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: SERVICE_UPDATED_AT,
  }
}

function recordingClient(
  options: { service?: unknown; putStatus?: number; putBody?: unknown } = {},
) {
  const requests: Recorded[] = []
  const client = new AmigoClient({
    apiKey: 'test-api-key-abc123',
    workspaceId: WORKSPACE_ID,
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const path = new URL(request.url).pathname
      const text = await request.clone().text()
      requests.push({ method: request.method, path, rawBody: text || undefined })
      if (request.method === 'GET' && path === SERVICE_PATH) {
        return Response.json(options.service ?? serviceBody())
      }
      if (request.method === 'PUT' && path === RELEASE_PATH) {
        return options.putStatus && options.putStatus !== 204
          ? Response.json(options.putBody ?? {}, { status: options.putStatus })
          : new Response(null, { status: 204 })
      }
      return Response.json({ detail: `No mock for ${request.method} ${path}` }, { status: 500 })
    },
  })
  return { client, requests }
}

function writtenBody(requests: Recorded[]) {
  const put = requests.find(({ method }) => method === 'PUT')
  return put?.rawBody === undefined ? undefined : JSON.parse(put.rawBody)
}

describe('ServicesResource dynamic behavior pins', () => {
  describe('setDynamicBehaviorPin', () => {
    it('reads the service, then writes the whole entry with the pin appended', async () => {
      const { client, requests } = recordingClient()
      const pin = {
        set_id: '0a0a0a0a-1111-4222-8333-444444444444',
        version: 5,
        states: ['billing_help'],
      }

      await client.services.setDynamicBehaviorPin(SERVICE_ID, 'release', pin)

      expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
        `GET ${SERVICE_PATH}`,
        `PUT ${RELEASE_PATH}`,
      ])
      expect(writtenBody(requests)).toEqual({
        version_set: { ...RELEASE_ENTRY_FIXTURE, dynamic_behavior_sets: [...PINS_FIXTURE, pin] },
        expected_updated_at: SERVICE_UPDATED_AT,
      })
    })

    it('replaces the pin with the same set id in place, whole, and leaves the others byte for byte', async () => {
      const { client, requests } = recordingClient()

      await client.services.setDynamicBehaviorPin(SERVICE_ID, 'release', {
        set_id: OTHER_SET_ID,
        version: 6,
      })

      const written = writtenBody(requests)
      // The new pin is not merged with the old one: it carries only what the caller passed.
      expect(written.version_set.dynamic_behavior_sets).toEqual([
        PINS_FIXTURE[0],
        { set_id: OTHER_SET_ID, version: 6 },
        PINS_FIXTURE[2],
      ])
      // The other pins and the rest of the entry go back exactly as the read returned them.
      const sent = requests.find(({ method }) => method === 'PUT')!.rawBody!
      expect(sent).toContain(JSON.stringify(PINS_FIXTURE[0]))
      expect(sent).toContain(JSON.stringify(PINS_FIXTURE[2]))
      expect(written.version_set.agent_version_number).toBe(3)
      expect(written.version_set.context_graph_version_number).toBeNull()
      expect(written.version_set.llm_model_preferences).toEqual(
        RELEASE_ENTRY_FIXTURE.llm_model_preferences,
      )
    })

    it('writes to the named version set only', async () => {
      const { client, requests } = recordingClient()

      await client.services.setDynamicBehaviorPin(SERVICE_ID, 'release', {
        set_id: SET_ID,
        version: 2,
        enabled: false,
      })

      const puts = requests.filter(({ method }) => method === 'PUT')
      expect(puts.map(({ path }) => path)).toEqual([RELEASE_PATH])
      expect(puts[0]!.rawBody).not.toContain(JSON.stringify(CANARY_ENTRY))
    })

    it('starts the list when the stored entry has none and when it is null', async () => {
      for (const stored of [undefined, null]) {
        const entry = { ...RELEASE_ENTRY_FIXTURE, dynamic_behavior_sets: stored }
        if (stored === undefined)
          delete (entry as { dynamic_behavior_sets?: unknown }).dynamic_behavior_sets
        const { client, requests } = recordingClient({ service: serviceBody(entry) })

        await client.services.setDynamicBehaviorPin(SERVICE_ID, 'release', {
          set_id: SET_ID,
          version: 1,
        })

        expect(writtenBody(requests).version_set.dynamic_behavior_sets).toEqual([
          { set_id: SET_ID, version: 1 },
        ])
      }
    })

    it('throws ConflictError with the API body when the service changed after the read', async () => {
      const body = {
        detail:
          'The service changed since it was read, so nothing was stored. Reload it and apply the change again.',
      }
      const { client, requests } = recordingClient({ putStatus: 409, putBody: body })

      const error = await client.services
        .setDynamicBehaviorPin(SERVICE_ID, 'release', { set_id: SET_ID, version: 2 })
        .catch((e) => e)

      expect(error).toBeInstanceOf(ConflictError)
      expect(error.errorBody).toEqual(body)
      // No retry: the caller calls the helper again, which reads the service again.
      expect(requests.filter(({ method }) => method === 'PUT')).toHaveLength(1)
    })

    it('throws PermissionError for a replace-mode pin without platform:admin', async () => {
      const body = {
        detail: 'Pinning or changing a replace-mode dynamic behavior requires platform:admin scope',
      }
      const { client } = recordingClient({ putStatus: 403, putBody: body })

      const error = await client.services
        .setDynamicBehaviorPin(SERVICE_ID, 'release', { set_id: SET_ID, version: 2 })
        .catch((e) => e)

      expect(error).toBeInstanceOf(PermissionError)
      expect(error.errorBody).toEqual(body)
    })

    it('throws the API 422 body for a state the graph does not have', async () => {
      const body = {
        detail: {
          message: "1 dynamic behavior pins are invalid in version set 'release'",
          version_set: 'release',
          dynamic_behavior_sets: [
            { index: 0, id: SET_ID, field: 'states', message: "'x' isn't an action state" },
          ],
        },
      }
      const { client } = recordingClient({ putStatus: 422, putBody: body })

      const error = await client.services
        .setDynamicBehaviorPin(SERVICE_ID, 'release', { set_id: SET_ID, version: 2, states: ['x'] })
        .catch((e) => e)

      expect(error.statusCode).toBe(422)
      expect(error.errorBody).toEqual(body)
    })

    it('throws before writing when the service has no such version set', async () => {
      const { client, requests } = recordingClient()

      await expect(
        client.services.setDynamicBehaviorPin(SERVICE_ID, 'missing', {
          set_id: SET_ID,
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ConfigurationError)

      expect(requests.map(({ method }) => method)).toEqual(['GET'])
    })
  })

  describe('clearDynamicBehaviorPin', () => {
    it('removes one pin by set id and keeps the order of the rest', async () => {
      const { client, requests } = recordingClient()

      await client.services.clearDynamicBehaviorPin(SERVICE_ID, 'release', OTHER_SET_ID)

      expect(writtenBody(requests)).toEqual({
        version_set: {
          ...RELEASE_ENTRY_FIXTURE,
          dynamic_behavior_sets: [PINS_FIXTURE[0], PINS_FIXTURE[2]],
        },
        expected_updated_at: SERVICE_UPDATED_AT,
      })
      const sent = requests.find(({ method }) => method === 'PUT')!.rawBody!
      expect(sent).toContain(JSON.stringify(PINS_FIXTURE[0]))
      expect(sent).toContain(JSON.stringify(PINS_FIXTURE[2]))
    })

    it('sends an empty list, not a missing one, when the last pin goes', async () => {
      const entry = { ...RELEASE_ENTRY_FIXTURE, dynamic_behavior_sets: [PINS_FIXTURE[2]] }
      const { client, requests } = recordingClient({ service: serviceBody(entry) })

      await client.services.clearDynamicBehaviorPin(SERVICE_ID, 'release', THIRD_SET_ID)

      expect(writtenBody(requests).version_set.dynamic_behavior_sets).toEqual([])
    })

    it('does not write when the set is not pinned', async () => {
      const { client, requests } = recordingClient()

      await client.services.clearDynamicBehaviorPin(
        SERVICE_ID,
        'release',
        '0a0a0a0a-1111-4222-8333-444444444444',
      )

      expect(requests.map(({ method }) => method)).toEqual(['GET'])
    })

    it('does not write when the stored entry has no pins', async () => {
      const entry = { ...RELEASE_ENTRY_FIXTURE, dynamic_behavior_sets: null }
      const { client, requests } = recordingClient({ service: serviceBody(entry) })

      await client.services.clearDynamicBehaviorPin(SERVICE_ID, 'release', SET_ID)

      expect(requests.map(({ method }) => method)).toEqual(['GET'])
    })

    it('throws ConflictError with the API body when the service changed after the read', async () => {
      const body = { detail: 'The service changed since it was read, so nothing was stored.' }
      const { client } = recordingClient({ putStatus: 409, putBody: body })

      const error = await client.services
        .clearDynamicBehaviorPin(SERVICE_ID, 'release', SET_ID)
        .catch((e) => e)

      expect(error).toBeInstanceOf(ConflictError)
      expect(error.errorBody).toEqual(body)
    })

    it('throws before writing when the service has no such version set', async () => {
      const { client, requests } = recordingClient()

      await expect(
        client.services.clearDynamicBehaviorPin(SERVICE_ID, 'missing', SET_ID),
      ).rejects.toBeInstanceOf(ConfigurationError)

      expect(requests.map(({ method }) => method)).toEqual(['GET'])
    })
  })
})
