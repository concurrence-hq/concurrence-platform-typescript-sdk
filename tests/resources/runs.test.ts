import { describe, it, expect } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import type { Run, RunManifest } from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const RUN_ID = 'run-00000000-0000-0000-0000-000000000001'
const SERVICE_IDS = ['00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102']
const CONVERSATION_IDS = [
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202',
]
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
    [`GET ${BASE}/runs`]: () =>
      Response.json({
        items: [
          {
            run_id: RUN_ID,
            workspace_id: TEST_WORKSPACE_ID,
            kind: 'framework',
            status: 'completed',
            framework: 'claude-agent-sdk',
            started_at: '2026-07-01T12:00:00Z',
          },
        ],
        has_more: true,
        continuation_token: 50,
      }),
    [`GET ${BASE}/runs/summary`]: () =>
      Response.json({
        total: 10,
        live: 3,
        running: 2,
        paused: 1,
        completed: 5,
        failed: 1,
        timed_out: 1,
        by_status: { completed: 5 },
        by_kind: { conversation: 7, framework: 3 },
      }),
    [`GET ${BASE}/runs/${RUN_ID}`]: () =>
      Response.json({
        run_id: RUN_ID,
        workspace_id: TEST_WORKSPACE_ID,
        kind: 'framework',
        status: 'completed',
        framework: 'claude-agent-sdk',
        started_at: '2026-07-01T12:00:00Z',
      }),
    [`GET ${BASE}/runs/${RUN_ID}/trajectory`]: () =>
      Response.json({
        steps: [
          { seq: 0, kind: 'perception' },
          { seq: 1, kind: 'tool', tool_name: 'lookup' },
        ],
        truncated: false,
      }),
    [`POST ${BASE}/runs/${RUN_ID}/guidance`]: () =>
      Response.json({ status: 'delivered', run_id: RUN_ID }),
    [`POST ${BASE}/runs/${RUN_ID}/takeover`]: () =>
      Response.json({
        run_id: RUN_ID,
        mode: 'takeover',
        participant_call_sid: 'CA1',
        conference_sid: 'CF1',
      }),
  }),
})

describe('RunsResource', () => {
  it('list() returns runs of any kind + the opaque cursor', async () => {
    const res = await client.runs.list({ kind: ['framework'], limit: 25 })
    expect(res.items[0]?.run_id).toBe(RUN_ID)
    expect(res.has_more).toBe(true)
    expect(res.continuation_token).toBe(50)
  })

  it('list() serializes multi-value filters into repeated query params', async () => {
    let capturedUrl = ''
    const capturing = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = input instanceof Request ? input.url : input.toString()
        return Response.json({ items: [], has_more: false, continuation_token: null })
      },
    })
    await capturing.runs.list({
      serviceId: SERVICE_IDS,
      kind: ['conversation', 'framework'],
      status: ['live', 'completed'],
      channel: ['voice'],
      limit: 25,
      continuationToken: 'next-page',
    })
    const query = new URL(capturedUrl).searchParams
    expect(query.getAll('service_id')).toEqual(SERVICE_IDS)
    expect(query.has('serviceId')).toBe(false)
    expect(query.getAll('kind')).toEqual(['conversation', 'framework'])
    expect(query.getAll('status')).toEqual(['live', 'completed'])
    expect(query.getAll('channel')).toEqual(['voice'])
    expect(query.get('limit')).toBe('25')
    expect(query.get('continuation_token')).toBe('next-page')
  })

  it.each([undefined, { serviceId: [] }])('list(%j) leaves services unfiltered', async (params) => {
    let capturedUrl = ''
    const capturing = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = input instanceof Request ? input.url : input.toString()
        return Response.json({ items: [], has_more: false, continuation_token: null })
      },
    })

    await capturing.runs.list(params)

    expect(new URL(capturedUrl).searchParams.has('service_id')).toBe(false)
  })

  it('list() accepts one service alongside a page cursor', async () => {
    let capturedUrl = ''
    const capturing = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = input instanceof Request ? input.url : input.toString()
        return Response.json({ items: [], has_more: false, continuation_token: null })
      },
    })

    await capturing.runs.list({ serviceId: [SERVICE_IDS[0]!], continuationToken: 'next-page' })

    const query = new URL(capturedUrl).searchParams
    expect(query.getAll('service_id')).toEqual([SERVICE_IDS[0]])
    expect(query.get('continuation_token')).toBe('next-page')
  })

  it('list() filters by source conversation with repeated source_conversation_id params', async () => {
    let capturedUrl = ''
    const capturing = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = input instanceof Request ? input.url : input.toString()
        return Response.json({ items: [], has_more: false, continuation_token: null })
      },
    })

    await capturing.runs.list({ sourceConversationId: CONVERSATION_IDS, channel: ['web'] })

    const query = new URL(capturedUrl).searchParams
    expect(query.getAll('source_conversation_id')).toEqual(CONVERSATION_IDS)
    expect(query.has('sourceConversationId')).toBe(false)
    expect(query.getAll('channel')).toEqual(['web'])

    await capturing.runs.list({ sourceConversationId: [] })

    expect(new URL(capturedUrl).searchParams.has('source_conversation_id')).toBe(false)
  })

  it('get() reads the manifest a run executed with', async () => {
    const run = {
      run_id: RUN_ID,
      workspace_id: TEST_WORKSPACE_ID,
      kind: 'conversation',
      status: 'completed',
      channel: 'voice',
      source_conversation_id: CONVERSATION_IDS[0],
      started_at: '2026-10-20T12:00:00Z',
      takeover: { eligible: false, mode_options: [], reason: 'run is not live' },
      manifest: {
        llm_model: 'gpt-5.4',
        image_sha: '0123456789abcdef0123456789abcdef01234567',
        runtime_release_id: 'release-2026-10-20',
        temperature: null,
        engage_prompt_template_hash: 'sha256:1111',
        navigation_prompt_template_hash: 'sha256:2222',
        tts_language: 'es',
        decider_kind: 'decisions',
        cooperative_stop: true,
        effect_shadow: false,
        emergency_floor_enforced: true,
      },
    } satisfies Run
    const reading = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async () => Response.json(run),
    })

    const res = await reading.runs.get(RUN_ID)

    const manifest: RunManifest | null | undefined = res.manifest
    expect(manifest).toEqual(run.manifest)
    expect(manifest?.decider_kind).toBe('decisions')
    expect(manifest?.tts_language).toBe('es')
  })

  it('summary() returns aggregate counts', async () => {
    const res = await client.runs.summary()
    expect(res.total).toBe(10)
    expect(res.by_kind.framework).toBe(3)
  })

  it('get() resolves one run by run_id', async () => {
    const res = await client.runs.get(RUN_ID)
    expect(res.run_id).toBe(RUN_ID)
    expect(res.kind).toBe('framework')
  })

  it('trajectory() returns ordered structural steps', async () => {
    const res = await client.runs.trajectory(RUN_ID)
    expect(res.steps).toHaveLength(2)
    expect(res.steps[1]?.tool_name).toBe('lookup')
    expect(res.truncated).toBe(false)
  })

  it('sendGuidance() posts operator guidance to a live run', async () => {
    const res = await client.runs.sendGuidance(RUN_ID, {
      operator_id: 'op-1',
      message: 'ask about allergies',
    })
    expect(res.status).toBe('delivered')
  })

  it('takeOver() returns the audio-leg coordinates', async () => {
    const res = await client.runs.takeOver(RUN_ID, { operator_id: 'op-1', mode: 'takeover' })
    expect(res.mode).toBe('takeover')
    expect(res.participant_call_sid).toBe('CA1')
  })
})
