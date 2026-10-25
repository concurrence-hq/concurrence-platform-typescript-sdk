import { describe, expect, it } from 'vitest'
import {
  AmigoClient,
  AuthenticationError,
  ConfigurationError,
  PermissionError,
  type StagingCloneBatchResult,
  type StagingClonePreviewResponse,
  type StagingPairing,
} from '../../src/index.js'

const SOURCE = '00000000-0000-4000-8000-000000000001'
const DESTINATION = '00000000-0000-4000-8000-000000000002'
const PAIRING = '00000000-0000-4000-8000-000000000003'
const AGENT = '00000000-0000-4000-8000-000000000004'
const GRAPH = '00000000-0000-4000-8000-000000000005'
const SOURCE_TOKEN = 'ephemeral-production-credential'
const DESTINATION_TOKEN = 'staging-credential'
const DIGEST = 'a'.repeat(64)
const sourceOrigin = 'https://platform.api-eu.concurrence.com'
const stagingOrigin = 'https://platform.api-staging.concurrence.com'
const pairing = {
  id: PAIRING,
  workspace_id: DESTINATION,
  source_workspace_id: SOURCE,
  source_region: 'eu-central-1',
  created_by_credential_id: AGENT,
  created_at: '2026-10-25T07:00:00Z',
} satisfies StagingPairing
const body = {
  pairing_id: PAIRING,
  source_region: 'eu-central-1',
  source_workspace_id: SOURCE,
  source_token: SOURCE_TOKEN,
  tool_mapping: { lookup_patient: 'staging_lookup' },
} as const

function preview(id: string): StagingClonePreviewResponse {
  return {
    source_workspace_id: SOURCE,
    source_service_id: id,
    source_agent_id: AGENT,
    source_context_graph_id: GRAPH,
    source_region: 'eu-central-1',
    destination_workspace_id: DESTINATION,
    pairing_id: PAIRING,
    agent_name: 'Staging persona',
    graph_name: 'Staging workflow',
    plan: {
      service_id: id,
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
      agent_source_digests: {},
      graph_source_digests: {},
      unresolved_tools: [],
      excluded_fields: ['voice_config'],
      source_digest: DIGEST,
    },
  }
}

function harness(
  options: {
    previewStatus?: number
    pairing?: StagingPairing
    sourceWorkspace?: string
    sourceRegion?: string
    sourceStatus?: number
  } = {},
) {
  const requests: Request[] = []
  const items = ['6', '7', '8', '9', 'a', 'b'].map((digit, index) => ({
    id: `00000000-0000-4000-8000-00000000000${digit}`,
    name: `Service ${index + 1}`,
  }))
  const source = new AmigoClient({
    apiKey: SOURCE_TOKEN,
    workspaceId: SOURCE,
    baseUrl: sourceOrigin,
    fetch: async (input) => {
      const request = new Request(input)
      requests.push(request.clone())
      if (options.sourceStatus)
        return Response.json({ detail: 'Source access denied' }, { status: options.sourceStatus })
      const second = new URL(request.url).searchParams.has('continuation_token')
      return Response.json({
        source_workspace_id: options.sourceWorkspace ?? SOURCE,
        source_region: options.sourceRegion ?? 'eu-central-1',
        items: second ? items.slice(3) : items.slice(0, 3),
        has_more: !second,
        continuation_token: second ? null : 'opaque-page-2',
      })
    },
  }).stagingClones
  const destination = new AmigoClient({
    apiKey: DESTINATION_TOKEN,
    workspaceId: DESTINATION,
    baseUrl: stagingOrigin,
    fetch: async (input) => {
      const request = new Request(input)
      requests.push(request.clone())
      if (request.url.endsWith('/pairing')) return Response.json(options.pairing ?? pairing)
      const payload = await request.json()
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('source_service_id' in payload) ||
        typeof payload.source_service_id !== 'string'
      )
        throw new Error('Expected a source service ID')
      if (request.url.endsWith('/preview')) {
        if (options.previewStatus)
          return Response.json({ detail: SOURCE_TOKEN }, { status: options.previewStatus })
        const result = preview(payload.source_service_id)
        if (payload.source_service_id === items[1]!.id)
          result.plan.unresolved_tools = ['other_tool']
        return Response.json(result)
      }
      const index = items.findIndex((item) => item.id === payload.source_service_id)
      const status = [200, 200, 409, 422, 404, 503][index]!
      if (status !== 200) return Response.json({ detail: SOURCE_TOKEN }, { status })
      return Response.json({
        pairing_id: PAIRING,
        workspace_id: DESTINATION,
        source_service_id: payload.source_service_id,
        service_id: payload.source_service_id,
        agent_id: AGENT,
        context_graph_id: GRAPH,
        source_digest: DIGEST,
        created_by_credential_id: AGENT,
        created_at: pairing.created_at,
      })
    },
  }).stagingClones
  return { source, destination, requests, items }
}

async function collect(iterator: AsyncIterable<StagingCloneBatchResult>) {
  const results: StagingCloneBatchResult[] = []
  for await (const result of iterator) results.push(result)
  return results
}

describe('automatic staging configuration copies', () => {
  it('paginates sources, previews before each import, and preserves partial progress and tool recovery', async () => {
    const { source, destination, requests, items } = harness()
    const result = await collect(destination.importAll(source, body))
    expect(result.map((item) => item.status)).toEqual([
      'imported',
      'needs_tools',
      'failed',
      'failed',
      'failed',
      'failed',
    ])
    expect(result.map((item) => item.source_service)).toEqual(items)
    expect(result[1]).toEqual({
      source_service: items[1],
      status: 'needs_tools',
      unresolved_tools: ['other_tool'],
    })
    expect(result.slice(2).map((item) => 'reason' in item && item.reason)).toEqual([
      'conflict',
      'validation',
      'not_found',
      'unavailable',
    ])
    expect(JSON.stringify(result)).not.toContain(SOURCE_TOKEN)
    expect(requests[0]!.url).toBe(`${stagingOrigin}/v1/${DESTINATION}/staging-clones/pairing`)
    const pages = requests.filter((request) => new URL(request.url).origin === sourceOrigin)
    expect(pages).toHaveLength(2)
    expect(new URL(pages[1]!.url).searchParams.get('continuation_token')).toBe('opaque-page-2')
    const imports = requests.filter((request) => request.url.endsWith('/import'))
    expect(imports).toHaveLength(5)
    for (const request of requests) {
      const isSource = new URL(request.url).origin === sourceOrigin
      expect(request.headers.get('Authorization')).toBe(
        `Bearer ${isSource ? SOURCE_TOKEN : DESTINATION_TOKEN}`,
      )
      expect(request.url).not.toContain(SOURCE_TOKEN)
      if (request.method === 'POST') {
        const payload = await request.json()
        expect(payload).toMatchObject({ ...body, destination_workspace_id: DESTINATION })
        if (request.url.endsWith('/import'))
          expect(payload).toMatchObject({ expected_source_digest: DIGEST })
      }
    }
  })

  it('does not queue later imports when the consumer stops reading progress', async () => {
    const { source, destination, requests } = harness()
    for await (const result of destination.importAll(source, body)) {
      expect(result.status).toBe('imported')
      break
    }
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(2)
  })

  it('retries through the server rather than treating historical receipts as current copies', async () => {
    const { source, destination, requests } = harness()
    const first = await destination.importAll(source, body).next()
    const second = await destination.importAll(source, body).next()
    expect(first.value).toEqual(second.value)
    expect(requests.filter((request) => request.url.endsWith('/import'))).toHaveLength(2)
    expect(requests.some((request) => request.url.endsWith('/imports'))).toBe(false)
  })

  it.each([401, 403])('stops after a staging authorization failure (%i)', async (previewStatus) => {
    const { source, destination, requests } = harness({ previewStatus })
    await expect(collect(destination.importAll(source, body))).rejects.toBeInstanceOf(
      previewStatus === 401 ? AuthenticationError : PermissionError,
    )
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1)
  })

  it.each([401, 403])(
    'does not import after a production authorization failure (%i)',
    async (sourceStatus) => {
      const { source, destination, requests } = harness({ sourceStatus })
      await expect(collect(destination.importAll(source, body))).rejects.toBeInstanceOf(
        sourceStatus === 401 ? AuthenticationError : PermissionError,
      )
      expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0)
    },
  )

  it.each([
    { pairing: { ...pairing, workspace_id: SOURCE } },
    { pairing: { ...pairing, id: SOURCE } },
    { pairing: { ...pairing, source_workspace_id: DESTINATION } },
    { pairing: { ...pairing, source_region: 'us-east-1' as const } },
    { sourceWorkspace: DESTINATION },
    { sourceRegion: 'us-east-1' },
  ])('refuses mixed source/destination identities before importing: %j', async (options) => {
    const { source, destination, requests } = harness(options)
    await expect(collect(destination.importAll(source, body))).rejects.toBeInstanceOf(
      ConfigurationError,
    )
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0)
  })

  it('aborts before any network access and between completed imports', async () => {
    const { source, destination, requests } = harness()
    const controller = new AbortController()
    controller.abort()
    await expect(
      collect(destination.importAll(source, body, controller.signal)),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(requests).toHaveLength(0)
    const running = new AbortController()
    const iterator = destination.importAll(source, body, running.signal)
    expect((await iterator.next()).value?.status).toBe('imported')
    running.abort()
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' })
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(2)
  })
})
