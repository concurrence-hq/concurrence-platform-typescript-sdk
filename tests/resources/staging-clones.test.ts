import { describe, expect, it } from 'vitest'
import {
  AmigoClient,
  ConflictError,
  NotFoundError,
  PermissionError,
  ValidationError,
  type StagingCloneApplyRequest,
  type StagingClonePreviewResponse,
  type StagingClonePullRequest,
  type StagingCloneReceipt,
  type StagingPairing,
} from '../../src/index.js'

const SOURCE = '00000000-0000-4000-8000-000000000001'
const DESTINATION = '00000000-0000-4000-8000-000000000002'
const SERVICE = '00000000-0000-4000-8000-000000000003'
const PAIRING = '00000000-0000-4000-8000-000000000004'
const AGENT = '00000000-0000-4000-8000-000000000005'
const GRAPH = '00000000-0000-4000-8000-000000000006'
const CLONE = '00000000-0000-4000-8000-000000000007'
const DIGEST = 'a'.repeat(64)
const SOURCE_TOKEN = 'request-scoped-production-token'
const DESTINATION_TOKEN = 'staging-token'
const SOURCE_ORIGIN = 'https://platform.api-eu.concurrence.com'
const STAGING_ORIGIN = 'https://platform.api-staging.concurrence.com'

const pull = {
  source_region: 'eu-central-1',
  source_workspace_id: SOURCE,
  source_service_id: SERVICE,
  destination_workspace_id: DESTINATION,
  pairing_id: PAIRING,
  source_token: SOURCE_TOKEN,
  tool_mapping: {},
} satisfies StagingClonePullRequest
const apply = { ...pull, expected_source_digest: DIGEST } satisfies StagingCloneApplyRequest
const pairing = {
  id: PAIRING,
  workspace_id: DESTINATION,
  source_workspace_id: SOURCE,
  source_region: 'eu-central-1',
  created_by_credential_id: AGENT,
  created_at: '2026-10-25T06:00:00Z',
} satisfies StagingPairing
const receipt = {
  pairing_id: PAIRING,
  workspace_id: DESTINATION,
  source_service_id: SERVICE,
  service_id: CLONE,
  agent_id: AGENT,
  context_graph_id: GRAPH,
  source_digest: DIGEST,
  created_by_credential_id: AGENT,
  created_at: pairing.created_at,
} satisfies StagingCloneReceipt
const preview = {
  source_workspace_id: SOURCE,
  source_service_id: SERVICE,
  source_agent_id: AGENT,
  source_context_graph_id: GRAPH,
  source_region: 'eu-central-1',
  destination_workspace_id: DESTINATION,
  pairing_id: PAIRING,
  agent_name: 'Staging agent',
  graph_name: 'Staging graph',
  plan: {
    service_id: CLONE,
    service: {
      name: 'Staging service',
      agent_id: AGENT,
      context_graph_id: GRAPH,
      is_active: false,
    },
    agent_versions: {},
    graph_versions: {},
    agent_version_map: {},
    graph_version_map: {},
    unresolved_tools: ['lookup_patient'],
    excluded_fields: ['voice_config'],
    source_digest: DIGEST,
  },
} satisfies StagingClonePreviewResponse

describe('staging clone authority and revision contract', () => {
  it('reads a local staging pairing without a source credential or request body', async () => {
    const requests: Request[] = []
    const staging = new AmigoClient({
      apiKey: DESTINATION_TOKEN,
      workspaceId: DESTINATION,
      baseUrl: STAGING_ORIGIN,
      fetch: async (input) => {
        requests.push(new Request(input))
        return Response.json(pairing)
      },
    })
    expect(await staging.stagingClones.getPairing()).toEqual(pairing)
    expect(requests).toHaveLength(1)
    const request = requests[0]!
    expect(request.method).toBe('GET')
    expect(request.url).toBe(`${STAGING_ORIGIN}/v1/${DESTINATION}/staging-clones/pairing`)
    expect(request.headers.get('Authorization')).toBe(`Bearer ${DESTINATION_TOKEN}`)
    expect(await request.text()).toBe('')
  })

  it('reports an unpaired workspace as NotFoundError', async () => {
    const staging = new AmigoClient({
      apiKey: DESTINATION_TOKEN,
      workspaceId: DESTINATION,
      baseUrl: STAGING_ORIGIN,
      fetch: async () =>
        Response.json({ detail: 'Workspace has no staging pairing' }, { status: 404 }),
    })
    await expect(staging.stagingClones.getPairing()).rejects.toThrow(NotFoundError)
  })

  it('uses production authority only for the source preview', async () => {
    const requests: Request[] = []
    const production = new AmigoClient({
      apiKey: SOURCE_TOKEN,
      workspaceId: SOURCE,
      baseUrl: SOURCE_ORIGIN,
      fetch: async (input) => {
        requests.push(new Request(input))
        return Response.json(preview)
      },
    })
    const body = { destination_workspace_id: DESTINATION, pairing_id: PAIRING }
    expect(await production.stagingClones.previewSource(SERVICE, body)).toEqual(preview)
    expect(requests).toHaveLength(1)
    const request = requests[0]!
    expect(request.url).toBe(
      `${SOURCE_ORIGIN}/v1/${SOURCE}/services/${SERVICE}/staging-clone-preview`,
    )
    expect(request.method).toBe('POST')
    expect(request.headers.get('Authorization')).toBe(`Bearer ${SOURCE_TOKEN}`)
    expect(await request.json()).toEqual(body)
  })

  it('keeps destination authority separate and sends source credentials only with each pull', async () => {
    const requests: Request[] = []
    const staging = new AmigoClient({
      apiKey: DESTINATION_TOKEN,
      workspaceId: DESTINATION,
      baseUrl: STAGING_ORIGIN,
      fetch: async (input) => {
        const request = new Request(input)
        requests.push(request)
        if (request.url.endsWith('/pairing')) return Response.json(pairing)
        if (request.url.endsWith('/import')) return Response.json(receipt)
        return Response.json(preview)
      },
    }).withOptions({ headers: { 'X-Request-ID': 'clone-review' }, maxRetries: 0 })

    expect(await staging.stagingClones.previewImport(pull)).toEqual(preview)
    expect(await staging.stagingClones.pairWorkspace(pull)).toEqual(pairing)
    expect(await staging.stagingClones.importService(apply)).toEqual(receipt)
    // The resource does not retain the last call's production credential.
    const freshPull = { ...pull, source_token: 'fresh-production-token' }
    await staging.stagingClones.previewImport(freshPull)
    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ['POST', `${STAGING_ORIGIN}/v1/${DESTINATION}/staging-clones/preview`],
      ['PUT', `${STAGING_ORIGIN}/v1/${DESTINATION}/staging-clones/pairing`],
      ['POST', `${STAGING_ORIGIN}/v1/${DESTINATION}/staging-clones/import`],
      ['POST', `${STAGING_ORIGIN}/v1/${DESTINATION}/staging-clones/preview`],
    ])
    for (const request of requests) {
      expect(request.headers.get('Authorization')).toBe(`Bearer ${DESTINATION_TOKEN}`)
      expect(request.headers.get('X-Request-ID')).toBe('clone-review')
      expect(request.url).not.toContain(SOURCE_TOKEN)
    }
    expect(await Promise.all(requests.map((request) => request.json()))).toEqual([
      pull,
      pull,
      apply,
      freshPull,
    ])
  })

  it.each([
    [403, PermissionError],
    [409, ConflictError],
    [422, ValidationError],
  ])('surfaces HTTP %s without retrying an import', async (status, errorType) => {
    let attempts = 0
    const staging = new AmigoClient({
      apiKey: DESTINATION_TOKEN,
      workspaceId: DESTINATION,
      baseUrl: STAGING_ORIGIN,
      fetch: async () => {
        attempts += 1
        return Response.json({ detail: 'Import requires review' }, { status })
      },
    })
    await expect(staging.stagingClones.importService(apply)).rejects.toThrow(errorType)
    expect(attempts).toBe(1)
  })
})
