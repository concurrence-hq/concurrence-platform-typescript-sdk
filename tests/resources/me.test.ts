import { describe, expect, it } from 'vitest'
import type { components } from '../../src/generated/api.js'
import { AmigoClient, type StagingWorkspaceSource } from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'

const WORKSPACE_FIXTURE: components['schemas']['WorkspaceResponse'] = {
  id: TEST_WORKSPACE_ID,
  name: 'Acme Health',
  slug: 'acme-health',
  membership_provisioning: 'domain_policies',
  backend_org_id: null,
  region: 'us-east-1',
  connector_type: null,
  timezone: 'America/New_York',
  topic_modeling_enabled: false,
  delta_sharing_enabled: false,
  delta_sharing_mode: 'open',
  delta_sharing_identifier: null,
  provisioned_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const NOT_CAPTURED = Symbol('body not captured')

interface CapturedRequest {
  url: string
  method: string
  body: unknown
}

/**
 * Build a fetch impl that records the outgoing request and returns a
 * canned response. Captures ``url`` (full path-and-query),
 * ``method``, and decoded JSON ``body``. ``body`` is initialized to a
 * sentinel symbol, so a transport change that silently stops invoking
 * the body-capture branch fails the assertion (instead of vacuously
 * passing on ``undefined``).
 */
function recordingFetch(
  cannedResponse: () => Response | Promise<Response>,
  captured: CapturedRequest,
): typeof globalThis.fetch {
  return async (input, init) => {
    // openapi-fetch always emits a ``Request`` for non-GET; in that
    // path ``init`` is undefined and the body lives on the Request.
    // Older transports could pass ``init.body`` for a string-URL input
    // — we don't exercise that today, but support it cheaply for
    // forward-compatibility (the assertion above would catch a
    // regression, since either path will set ``captured.body``).
    if (input instanceof Request) {
      captured.url = new URL(input.url).pathname
      captured.method = input.method.toUpperCase()
      if (input.body) captured.body = await input.clone().json()
      else captured.body = null
    } else {
      const urlStr = typeof input === 'string' ? input : input.toString()
      captured.url = new URL(urlStr).pathname
      captured.method = (init?.method ?? 'GET').toUpperCase()
      captured.body = init?.body ? JSON.parse(init.body as string) : null
    }
    return cannedResponse()
  }
}

describe('MeResource', () => {
  it('keeps production authority in the staging creation body and destination authority in the header', async () => {
    const source: StagingWorkspaceSource = {
      source_region: 'eu-central-1',
      source_workspace_id: '00000000-0000-4000-8000-000000000002',
      source_service_id: '00000000-0000-4000-8000-000000000003',
      source_token: 'request-scoped-source-token',
    }
    const body = { slug: 'acme-staging', name: 'Acme staging', staging_source: source }
    let requests = 0
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      baseUrl: 'https://platform.api-staging.concurrence.com',
      fetch: async (input) => {
        expect(input).toBeInstanceOf(Request)
        const request = input as Request
        expect(request.url).toBe('https://platform.api-staging.concurrence.com/v1/me/workspaces')
        expect(request.headers.get('Authorization')).toBe(`Bearer ${TEST_API_KEY}`)
        expect(await request.json()).toEqual(body)
        requests += 1
        return Response.json(WORKSPACE_FIXTURE, { status: 201 })
      },
    })
    expect(await client.me.createWorkspace(body)).toEqual(WORKSPACE_FIXTURE)
    expect(requests).toBe(1)
  })

  it('createWorkspace posts to exactly /v1/me/workspaces with no workspace prefix', async () => {
    // Account-scoped routes must NOT carry a workspace prefix or an
    // ``X-Workspace-Id``-style header derived from the bound
    // ``workspaceId`` slot. ``MeResource`` extends
    // ``WorkspaceScopedResource`` (for ``withOptions`` / iterator
    // helpers) but the underlying ``PlatformFetch`` middleware does
    // not auto-inject workspace context. This test pins the
    // outgoing URL exactly so any future middleware change that
    // starts injecting workspace context fails loudly here.
    const captured: CapturedRequest = {
      url: '',
      method: '',
      body: NOT_CAPTURED,
    }

    const requestBody: components['schemas']['CreateWorkspaceRequest'] = {
      slug: 'acme-health',
      name: 'Acme Health',
      backend_org_id: null,
    }

    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: recordingFetch(() => Response.json(WORKSPACE_FIXTURE, { status: 201 }), captured),
    })

    const result = await client.me.createWorkspace(requestBody)

    // Exact-URL pin — workspace_id MUST NOT appear anywhere in the path.
    expect(captured.url).toBe('/v1/me/workspaces')
    expect(captured.url).not.toContain(TEST_WORKSPACE_ID)
    expect(captured.method).toBe('POST')
    // Sentinel check: ensure the body-capture branch actually ran.
    expect(captured.body).not.toBe(NOT_CAPTURED)
    expect(captured.body).toEqual(requestBody)
    // Full response shape pin (not just a couple of fields) — catches
    // a silent schema drop.
    expect(result).toEqual(WORKSPACE_FIXTURE)
  })

  it('does not expose createSelfService anywhere on the client (regression)', () => {
    // The legacy method was removed in SDK 0.28.0 (platform-api PR #2472
    // deleted the underlying ``POST /v1/workspaces/self-service`` route).
    // SDK consumers must migrate to ``client.me.createWorkspace``. Check
    // BOTH ``client.workspaces`` and ``client.me`` so a future contributor
    // can't accidentally re-add the legacy name on either resource and
    // bypass this guard.
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async () => new Response(null, { status: 500 }),
    })
    expect(
      (client.workspaces as unknown as { createSelfService?: unknown }).createSelfService,
    ).toBeUndefined()
    expect(
      (client.me as unknown as { createSelfService?: unknown }).createSelfService,
    ).toBeUndefined()
  })
})
