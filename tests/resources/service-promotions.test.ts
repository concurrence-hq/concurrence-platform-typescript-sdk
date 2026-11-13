import { describe, expect, it } from 'vitest'
import { ConflictError, ServiceUnavailableError, ValidationError } from '../../src/index.js'
import type {
  PromoteServiceConfigurationRequest,
  ServicePromotionReceipt,
} from '../../src/index.js'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

const SERVICE_ID = '00000000-0000-0000-0000-000000000002'
const PROMOTIONS = `/v1/${WORKSPACE}/services/${SERVICE_ID}/promotions`
const REVIEWED_DIGEST = `sha256:${'a'.repeat(64)}`
const PROMOTED_DIGEST = `sha256:${'b'.repeat(64)}`
const REVIEWED_AT = '2026-11-12T02:03:04.123456+00:00'

const REQUEST = {
  request_id: '11111111-1111-4111-8111-111111111111',
  expected_updated_at: REVIEWED_AT,
  reviewed_base: [
    { version_set: 'release', service_config_digest: REVIEWED_DIGEST },
    { version_set: 'staging_candidate', service_config_digest: PROMOTED_DIGEST },
  ],
  target_version_set: 'release',
  version_set: { agent_version_number: 3, context_graph_version_number: 7 },
  harness_pins: [],
  settings: {},
} satisfies PromoteServiceConfigurationRequest

const RECEIPT = {
  promotion_id: '22222222-2222-4222-8222-222222222222',
  request_id: REQUEST.request_id,
  workspace_id: WORKSPACE,
  service_id: SERVICE_ID,
  target_version_set: 'release',
  request_fingerprint: `sha256:${'c'.repeat(64)}`,
  reviewed_base: REQUEST.reviewed_base,
  base_updated_at: REVIEWED_AT,
  service_config_digest: PROMOTED_DIGEST,
  updated_at: '2026-11-12T02:03:05.654321+00:00',
  promoted_at: '2026-11-12T02:03:05.654321+00:00',
} satisfies ServicePromotionReceipt

function refusal(status: number, detail: Record<string, unknown>) {
  return Response.json({ detail }, { status })
}

describe('ServicesResource.promoteConfiguration', () => {
  it('posts the caller request unchanged and returns the 201 receipt', async () => {
    const { client, requests } = recordRoutes(200, () => Response.json(RECEIPT, { status: 201 }))

    const receipt = await client.services.promoteConfiguration(SERVICE_ID, REQUEST)

    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(PROMOTIONS)
    expect(requests[0]?.search).toBe('')
    expect(requests[0]?.body).toEqual(REQUEST)
    expect(receipt).toEqual(RECEIPT)
    expect(receipt.lastResponse.statusCode).toBe(201)
  })

  it('leaves out harness pins and settings the caller did not name', async () => {
    const { client, requests } = recordRoutes(200, () => Response.json(RECEIPT, { status: 201 }))
    const versionSetOnly = {
      request_id: REQUEST.request_id,
      expected_updated_at: REQUEST.expected_updated_at,
      reviewed_base: REQUEST.reviewed_base,
      target_version_set: REQUEST.target_version_set,
      version_set: REQUEST.version_set,
    } satisfies PromoteServiceConfigurationRequest

    await client.services.promoteConfiguration(SERVICE_ID, versionSetOnly)

    expect(requests[0]?.body).toEqual(versionSetOnly)
    expect(requests[0]?.body).not.toHaveProperty('harness_pins')
    expect(requests[0]?.body).not.toHaveProperty('settings')
  })

  it('returns the historical receipt of a repeat as 200, not as a new promotion', async () => {
    const { client, requests } = recordRoutes(200, () => Response.json(RECEIPT, { status: 200 }))

    const receipt = await client.services.promoteConfiguration(SERVICE_ID, REQUEST)

    expect(requests).toHaveLength(1)
    expect(receipt).toEqual(RECEIPT)
    expect(receipt.lastResponse.statusCode).toBe(200)
  })

  it.each([
    {
      code: 'promotion_base_changed',
      message: 'The reviewed configuration changed, so nothing was stored.',
      changed: ['release', 'service'],
    },
    {
      code: 'promotion_request_mismatch',
      message: 'This request_id was used with another request.',
    },
  ])('keeps the $code conflict detail and sends nothing again', async (detail) => {
    const { client, requests } = recordRoutes(200, () => refusal(409, detail))

    const promotion = client.services.promoteConfiguration(SERVICE_ID, REQUEST)

    await expect(promotion).rejects.toBeInstanceOf(ConflictError)
    await expect(promotion).rejects.toMatchObject({ statusCode: 409, errorBody: { detail } })
    expect(requests).toHaveLength(1)
  })

  it('keeps the version sets an incomplete reviewed base is missing', async () => {
    const detail = {
      code: 'promotion_base_incomplete',
      message: 'The reviewed base does not name every version set the promotion replaces.',
      version_sets: ['canary'],
    }
    const { client, requests } = recordRoutes(200, () => refusal(422, detail))

    const promotion = client.services.promoteConfiguration(SERVICE_ID, REQUEST)

    await expect(promotion).rejects.toBeInstanceOf(ValidationError)
    await expect(promotion).rejects.toMatchObject({ statusCode: 422, errorBody: { detail } })
    expect(requests).toHaveLength(1)
  })

  it.each([
    { code: 'promotion_lock_timeout', message: 'Another write held the configuration.' },
    { code: 'harness_bake_unconfirmed', message: 'Releases could not be confirmed.' },
    { code: 'promotion_transaction_timeout', message: 'Timed out.', outcome: 'not_stored' },
    { code: 'promotion_transaction_timeout', message: 'Timed out.', outcome: 'unknown' },
  ])('surfaces 503 $code ($outcome) once, with its outcome', async (detail) => {
    const { client, requests } = recordRoutes(200, () => refusal(503, detail))

    const promotion = client.services.promoteConfiguration(SERVICE_ID, REQUEST)

    await expect(promotion).rejects.toBeInstanceOf(ServiceUnavailableError)
    await expect(promotion).rejects.toMatchObject({ statusCode: 503, errorBody: { detail } })
    expect(requests).toHaveLength(1)
  })

  it('resolves an unknown commit outcome by the identical retry, with one stored promotion', async () => {
    const stored = new Map<string, { body: string; receipt: ServicePromotionReceipt }>()
    let writes = 0
    const { client, requests } = recordRoutes(200, async (request) => {
      const text = await request.text()
      const { request_id: requestId } = JSON.parse(text) as { request_id: string }
      const earlier = stored.get(requestId)
      if (earlier) {
        return earlier.body === text
          ? Response.json(earlier.receipt, { status: 200 })
          : refusal(409, { code: 'promotion_request_mismatch', message: 'Another request.' })
      }
      writes += 1
      stored.set(requestId, { body: text, receipt: RECEIPT })
      return refusal(503, {
        code: 'promotion_transaction_timeout',
        message: 'The deadline passed while the commit was being acknowledged.',
        outcome: 'unknown',
      })
    })

    await expect(client.services.promoteConfiguration(SERVICE_ID, REQUEST)).rejects.toMatchObject({
      statusCode: 503,
      errorBody: { detail: { code: 'promotion_transaction_timeout', outcome: 'unknown' } },
    })
    expect(requests).toHaveLength(1)

    const receipt = await client.services.promoteConfiguration(SERVICE_ID, REQUEST)

    expect(requests).toHaveLength(2)
    expect(requests[1]?.body).toEqual(requests[0]?.body)
    expect(requests[1]?.body).toMatchObject({ request_id: REQUEST.request_id })
    expect(receipt).toEqual(RECEIPT)
    expect(receipt.lastResponse.statusCode).toBe(200)
    expect(writes).toBe(1)
  })

  it('carries the reviewed digest from identity through simulation evidence to the promotion', async () => {
    const evidence = {
      service_config_digest: REVIEWED_DIGEST,
      harness: {
        kind: 'text',
        harness: 'openai',
        release: 'openai-v1.2.0',
        source: 'pin',
        sha256: 'd'.repeat(64),
      },
      receipts: [{ service_config_digest: REVIEWED_DIGEST, release: 'openai-v1.2.0' }],
    }
    const { client, requests } = recordRoutes(200, (request) => {
      const { pathname } = new URL(request.url)
      if (pathname.endsWith('/configuration-identity')) {
        return Response.json({
          workspace_id: WORKSPACE,
          service_id: SERVICE_ID,
          version_set: 'release',
          service_config_digest: REVIEWED_DIGEST,
          updated_at: REVIEWED_AT,
        })
      }
      if (pathname.endsWith('/simulations/sessions')) {
        return Response.json({ session_id: 'synthetic-session', harness_execution: evidence })
      }
      return Response.json(RECEIPT, { status: 201 })
    })

    const identity = await client.services.getConfigurationIdentity(SERVICE_ID, {
      version_set: 'release',
    })
    const session = await client.simulations.createSession({
      service_id: SERVICE_ID,
      expected_service_config_digest: identity.service_config_digest,
    })
    const receipt = await client.services.promoteConfiguration(SERVICE_ID, {
      request_id: REQUEST.request_id,
      expected_updated_at: identity.updated_at,
      reviewed_base: [
        {
          version_set: identity.version_set,
          service_config_digest: identity.service_config_digest,
        },
      ],
      target_version_set: 'release',
      version_set: REQUEST.version_set,
    })

    expect(session.harness_execution).toEqual(evidence)
    expect(requests.map((request) => request.pathname)).toEqual([
      `/v1/${WORKSPACE}/services/${SERVICE_ID}/configuration-identity`,
      `/v1/${WORKSPACE}/simulations/sessions`,
      PROMOTIONS,
    ])
    expect(requests[1]?.body).toEqual({
      service_id: SERVICE_ID,
      expected_service_config_digest: REVIEWED_DIGEST,
    })
    expect(requests[2]?.body).toEqual({
      request_id: REQUEST.request_id,
      expected_updated_at: REVIEWED_AT,
      reviewed_base: [{ version_set: 'release', service_config_digest: REVIEWED_DIGEST }],
      target_version_set: 'release',
      version_set: REQUEST.version_set,
    })
    expect(receipt.service_config_digest).toBe(PROMOTED_DIGEST)
  })
})
