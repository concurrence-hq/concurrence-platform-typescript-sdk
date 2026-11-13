import { describe, it, expect } from 'vitest'
import { AmigoClient } from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}`

function mockFetch(
  routes: Record<string, () => Response | Promise<Response>>,
): typeof globalThis.fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let url: string
    let method: string
    if (input instanceof Request) {
      url = input.url
      method = input.method.toUpperCase()
    } else {
      url = typeof input === 'string' ? input : input.toString()
      method = (init?.method ?? 'GET').toUpperCase()
    }
    const pathname = new URL(url).pathname
    for (const [pattern, handler] of Object.entries(routes)) {
      const [pMethod, ...pPathParts] = pattern.split(' ')
      if (pMethod === method && pPathParts.join(' ') === pathname) return handler()
    }
    return new Response(JSON.stringify({ detail: `No mock for ${method} ${pathname}` }), {
      status: 500,
    })
  }
}

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/agent-runs/harness-context`]: () =>
      Response.json({
        source: 'api',
        context_version: 1,
        config_fingerprint: 'sha256:abc',
        identity: null,
        world_scope: { workspace_id: TEST_WORKSPACE_ID, scoped_entity_ids: [] },
        tools: { read_tool_names: ['world_read'], write_tool_names: [] },
        guardrails: {},
        write_floor: { clinical_write_principal: 'provider-only' },
        runtime: { channel_kind: 'api' },
      }),
  }),
})

describe('AgentRunsResource', () => {
  it('harnessContext() fetches the CONTEXT edge', async () => {
    const res = await client.agentRuns.harnessContext({
      serviceId: 'svc-1',
      versionSet: 'release',
    })
    expect(res.write_floor.clinical_write_principal).toBe('provider-only')
    expect(res.tools.read_tool_names).toContain('world_read')
  })

  it('harnessContext() serializes camelCase params to the snake_case query', async () => {
    let capturedUrl = ''
    const capturing = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = input instanceof Request ? input.url : input.toString()
        return Response.json({
          source: 'api',
          context_version: 1,
          identity: null,
          world_scope: {},
          tools: { read_tool_names: [], write_tool_names: [] },
          guardrails: {},
          write_floor: { clinical_write_principal: 'provider-only' },
          runtime: {},
        })
      },
    })
    await capturing.agentRuns.harnessContext({ serviceId: 'svc-1', versionSet: 'edge' })
    const query = new URL(capturedUrl).searchParams
    expect(query.get('service_id')).toBe('svc-1')
    expect(query.get('version_set')).toBe('edge')
  })
})
