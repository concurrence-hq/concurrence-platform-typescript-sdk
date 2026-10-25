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
  type StagingMirrorApplyRequest,
  type StagingMirrorReceipt,
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
    graph_source_digests: {},
    unresolved_tools: ['lookup_patient'],
    excluded_fields: ['voice_config'],
    source_digest: DIGEST,
  },
} satisfies StagingClonePreviewResponse

describe('staging clone authority and revision contract', () => {
  it('applies the reviewed revisions and explicit conflict choices using staging authority', async () => {
    const requests: Request[] = []
    const body = {
      ...apply,
      expected_destination_digest: 'b'.repeat(64),
      operation_id: '00000000-0000-4000-8000-000000000008',
      resolutions: { '/description': 'production' },
    } satisfies StagingMirrorApplyRequest
    const mirrored = {
      operation_id: body.operation_id,
      pairing_id: PAIRING,
      workspace_id: DESTINATION,
      source_service_id: SERVICE,
      service_id: CLONE,
      source_digest: DIGEST,
      destination_digest: body.expected_destination_digest,
      created_by_credential_id: AGENT,
      created_at: pairing.created_at,
    } satisfies StagingMirrorReceipt
    const staging = new AmigoClient({
      apiKey: DESTINATION_TOKEN,
      workspaceId: DESTINATION,
      baseUrl: STAGING_ORIGIN,
      fetch: async (input) => {
        requests.push(new Request(input))
        return Response.json(mirrored)
      },
    }).withOptions({ headers: { 'X-Request-ID': 'mirror-apply' } })
    expect(await staging.stagingClones.applyMirror(body)).toEqual(mirrored)
    expect(await staging.stagingClones.applyMirror(body)).toEqual(mirrored)
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      expect(request.url).toBe(`${STAGING_ORIGIN}/v1/${DESTINATION}/staging-clones/mirror`)
      expect(request.method).toBe('POST')
      expect(request.headers.get('Authorization')).toBe(`Bearer ${DESTINATION_TOKEN}`)
      expect(request.headers.get('X-Request-ID')).toBe('mirror-apply')
      expect(await request.json()).toEqual(body)
    }
    expect(JSON.stringify(mirrored)).not.toContain(SOURCE_TOKEN)
  })

  it('reads a mirror proposal through staging authority without storing or returning the production token', async () => {
    const requests: Request[] = []
    const proposal = {
      service_id: CLONE,
      source_digest: DIGEST,
      destination_digest: 'b'.repeat(64),
      current_configuration: { name: 'Staging name' },
      incoming_configuration: { name: 'Production name' },
      configuration: { name: 'Staging name' },
      conflicts: ['/name'],
      new_agent_versions: 0,
      new_graph_versions: 1,
    }
    const staging = new AmigoClient({
      apiKey: DESTINATION_TOKEN,
      workspaceId: DESTINATION,
      baseUrl: STAGING_ORIGIN,
      fetch: async (input) => {
        requests.push(new Request(input))
        return Response.json(proposal)
      },
    }).withOptions({ headers: { 'X-Request-ID': 'mirror-preview' } })
    const result = await staging.stagingClones.previewMirror(pull)
    expect(result).toEqual(proposal)
    expect(JSON.stringify(result)).not.toContain(SOURCE_TOKEN)
    expect(requests).toHaveLength(1)
    const request = requests[0]!
    expect(request.url).toBe(`${STAGING_ORIGIN}/v1/${DESTINATION}/staging-clones/mirror-preview`)
    expect(request.method).toBe('POST')
    expect(request.headers.get('Authorization')).toBe(`Bearer ${DESTINATION_TOKEN}`)
    expect(request.headers.get('X-Request-ID')).toBe('mirror-preview')
    expect(await request.json()).toEqual(pull)
  })

  it('paginates source discovery on the production client with opaque continuation tokens', async () => {
    const requests: Request[] = []
    const items = [
      { id: SERVICE, name: 'First service' },
      { id: CLONE, name: 'Second service' },
    ]
    const production = new AmigoClient({
      apiKey: SOURCE_TOKEN,
      workspaceId: SOURCE,
      baseUrl: SOURCE_ORIGIN,
      fetch: async (input) => {
        requests.push(new Request(input))
        const page = requests.length - 1
        return Response.json({
          source_workspace_id: SOURCE,
          source_region: 'eu-central-1',
          items: [items[page]],
          has_more: page === 0,
          continuation_token: page === 0 ? 'opaque-next-page' : null,
        })
      },
    })
    const result = []
    for await (const item of production.stagingClones.listSourceServicesAutoPaging({ limit: 1 })) {
      result.push(item)
    }
    expect(result).toEqual(items)
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      const url = new URL(request.url)
      expect(url.origin).toBe(SOURCE_ORIGIN)
      expect(url.pathname).toBe(`/v1/${SOURCE}/staging-clones/source-services`)
      expect(url.searchParams.get('limit')).toBe('1')
      expect(request.headers.get('Authorization')).toBe(`Bearer ${SOURCE_TOKEN}`)
      expect(request.method).toBe('GET')
      expect(await request.text()).toBe('')
    }
    expect(new URL(requests[0]!.url).searchParams.has('continuation_token')).toBe(false)
    expect(new URL(requests[1]!.url).searchParams.get('continuation_token')).toBe(
      'opaque-next-page',
    )
  })

  it('paginates original staging receipts without sending source authority', async () => {
    const requests: Request[] = []
    const second = { ...receipt, source_service_id: AGENT, service_id: GRAPH }
    const staging = new AmigoClient({
      apiKey: DESTINATION_TOKEN,
      workspaceId: DESTINATION,
      baseUrl: STAGING_ORIGIN,
      fetch: async (input) => {
        requests.push(new Request(input))
        return Response.json({
          items: [requests.length === 1 ? receipt : second],
          has_more: requests.length === 1,
          continuation_token: requests.length === 1 ? 1 : null,
        })
      },
    }).withOptions({ headers: { 'X-Request-ID': 'resume-clones' } })
    const result = []
    for await (const item of staging.stagingClones.listImportsAutoPaging({ limit: 1 }))
      result.push(item)
    expect(result).toEqual([receipt, second])
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      const url = new URL(request.url)
      expect(url.origin).toBe(STAGING_ORIGIN)
      expect(url.pathname).toBe(`/v1/${DESTINATION}/staging-clones/imports`)
      expect(request.headers.get('Authorization')).toBe(`Bearer ${DESTINATION_TOKEN}`)
      expect(request.headers.get('X-Request-ID')).toBe('resume-clones')
      expect(await request.text()).toBe('')
      expect(request.url).not.toContain(SOURCE_TOKEN)
    }
    expect(new URL(requests[1]!.url).searchParams.get('continuation_token')).toBe('1')
  })

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
