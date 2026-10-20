import { beforeEach, describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { NotFoundError } from '../../src/core/errors.js'
import type {
  TtsProvider,
  VoiceJudgeResultListResponse,
  VoiceSessionProvider,
  components,
} from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'

type ServiceResponse = components['schemas']['ServiceResponse']

const SERVICE_ID = 'svc-00000000-0000-0000-0000-000000000001'
let lastCreateBody: unknown
let lastUpdateBody: unknown

const SERVICE_FIXTURE = {
  id: SERVICE_ID,
  workspace_id: TEST_WORKSPACE_ID,
  name: 'Scheduling Service',
  description: 'External scheduling system integration',
  channel_type: 'voice',
  agent_id: 'agent-00000000-0000-0000-0000-000000000001',
  context_graph_id: 'cg-00000000-0000-0000-0000-000000000001',
  is_active: true,
  keyterms: [],
  tags: [],
  tool_capacity: 5,
  voice_config: {
    session_provider: 'amigo',
    tts_provider: 'cartesia',
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const VOICE_JUDGE_FIXTURE = {
  service_id: SERVICE_ID,
  count: 1,
  items: [
    {
      call_sid: 'CA00000000000000000000000000000001',
      call_entity_id: null,
      overall_score: 4.2,
      clarity_score: 4.5,
      flag_count: 1,
      critical_count: 0,
      judge_json: null,
      computed_at: '2026-10-11T18:00:00Z',
    },
  ],
} satisfies VoiceJudgeResultListResponse

const BASE = `/v1/${TEST_WORKSPACE_ID}`

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`POST ${BASE}/services`]: ({ body }) => {
      lastCreateBody = body
      return Response.json(SERVICE_FIXTURE, { status: 201 })
    },

    [`GET ${BASE}/services`]: () =>
      Response.json({ items: [SERVICE_FIXTURE], has_more: false, continuation_token: null }),

    [`GET ${BASE}/services/${SERVICE_ID}`]: () => Response.json(SERVICE_FIXTURE),

    [`GET ${BASE}/services/not-found`]: () =>
      Response.json({ detail: 'Service not found', error_code: 'not_found' }, { status: 404 }),

    [`PUT ${BASE}/services/${SERVICE_ID}`]: ({ body }) => {
      lastUpdateBody = body
      return Response.json({
        ...SERVICE_FIXTURE,
        name: 'Updated Service',
        is_active: false,
        voice_config: { session_provider: 'gpt_realtime', tts_provider: 'elevenlabs' },
      })
    },

    [`DELETE ${BASE}/services/${SERVICE_ID}`]: () => new Response(null, { status: 204 }),
  }),
})

describe('ServicesResource', () => {
  beforeEach(() => {
    lastCreateBody = undefined
    lastUpdateBody = undefined
  })

  it('creates a service', async () => {
    const sessionProvider = 'amigo' satisfies VoiceSessionProvider
    const ttsProvider = 'cartesia' satisfies TtsProvider
    const body = {
      name: 'Scheduling Service',
      channel_type: 'voice',
      context_graph_id: 'cg-00000000-0000-0000-0000-000000000001',
      voice_config: {
        session_provider: sessionProvider,
        tts_provider: ttsProvider,
      },
    } as Parameters<typeof client.services.create>[0]
    const result = await client.services.create(body)
    expect(result.id).toBe(SERVICE_ID)
    expect(result.name).toBe('Scheduling Service')
    expect(result.voice_config?.session_provider).toBe(sessionProvider)
    expect(result.voice_config?.tts_provider).toBe(ttsProvider)
    expect(lastCreateBody).toMatchObject({
      voice_config: {
        session_provider: sessionProvider,
        tts_provider: ttsProvider,
      },
    })
  })

  it('sends and reads back platform caller verification and the medical emergency ending', async () => {
    const service = {
      id: SERVICE_ID,
      workspace_id: TEST_WORKSPACE_ID,
      name: 'Front Desk',
      description: 'Answers practice questions',
      agent_id: '00000000-0000-0000-0000-000000000011',
      context_graph_id: '00000000-0000-0000-0000-000000000012',
      keyterms: [],
      is_active: true,
      version_sets: {},
      tags: [],
      tool_capacity: 5,
      platform_caller_verification: false,
      medical_emergency_ending: 'end_after_script',
      allow_unverified_integration_results: false,
      created_at: '2026-10-20T00:00:00Z',
      updated_at: '2026-10-20T00:00:00Z',
    } satisfies ServiceResponse
    const bodies: unknown[] = []
    const recording = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: mockFetch({
        [`POST ${BASE}/services`]: ({ body }) => {
          bodies.push(body)
          return Response.json(service, { status: 201 })
        },
        [`PUT ${BASE}/services/${SERVICE_ID}`]: ({ body }) => {
          bodies.push(body)
          return Response.json({ ...service, platform_caller_verification: true })
        },
      }),
    })

    const created = await recording.services.create({
      name: 'Front Desk',
      agent_id: service.agent_id,
      context_graph_id: service.context_graph_id,
      platform_caller_verification: false,
      medical_emergency_ending: 'end_after_script',
    })
    const updated = await recording.services.update(SERVICE_ID, {
      platform_caller_verification: true,
    })

    expect(bodies).toEqual([
      {
        name: 'Front Desk',
        agent_id: service.agent_id,
        context_graph_id: service.context_graph_id,
        platform_caller_verification: false,
        medical_emergency_ending: 'end_after_script',
      },
      { platform_caller_verification: true },
    ])
    expect(created.platform_caller_verification).toBe(false)
    expect(created.medical_emergency_ending).toBe('end_after_script')
    expect(updated.platform_caller_verification).toBe(true)
  })

  it('lists services', async () => {
    const result = await client.services.list()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.name).toBe('Scheduling Service')
    expect(result.has_more).toBe(false)
  })

  it('gets a service by id', async () => {
    const result = await client.services.get(SERVICE_ID)
    expect(result.id).toBe(SERVICE_ID)
    expect(result.channel_type).toBe('voice')
  })

  it('throws NotFoundError for missing service', async () => {
    await expect(client.services.get('not-found')).rejects.toThrow(NotFoundError)
  })

  it('updates a service', async () => {
    const sessionProvider = 'gpt_realtime' satisfies VoiceSessionProvider
    const ttsProvider = 'elevenlabs' satisfies TtsProvider
    const body = {
      name: 'Updated Service',
      is_active: false,
      voice_config: {
        session_provider: sessionProvider,
        tts_provider: ttsProvider,
      },
    } as Parameters<typeof client.services.update>[1]
    const result = await client.services.update(SERVICE_ID, body)
    expect(result.name).toBe('Updated Service')
    expect(result.is_active).toBe(false)
    expect(result.voice_config?.session_provider).toBe('gpt_realtime')
    expect(lastUpdateBody).toMatchObject({
      voice_config: {
        session_provider: sessionProvider,
        tts_provider: ttsProvider,
      },
    })
  })

  it('upserts one version set by name and surfaces a missing pinned version', async () => {
    const requests: Request[] = []
    const versionSetClient = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init)
        requests.push(request.clone())
        const { version_set } = (await request.json()) as {
          version_set: { agent_version_number?: number }
        }
        return version_set.agent_version_number === 99
          ? Response.json({ detail: 'Agent version 99 not found' }, { status: 404 })
          : new Response(null, { status: 204 })
      },
    })

    const result = await versionSetClient.services.upsertVersionSet(SERVICE_ID, 'canary', {
      version_set: { agent_version_number: 3, context_graph_version_number: 7 },
    })

    expect(result).toBeUndefined()
    expect(requests[0]?.method).toBe('PUT')
    expect(new URL(requests[0]!.url).pathname).toBe(
      `${BASE}/services/${SERVICE_ID}/version-sets/canary`,
    )
    expect(await requests[0]?.json()).toEqual({
      version_set: { agent_version_number: 3, context_graph_version_number: 7 },
    })
    await expect(
      versionSetClient.services.upsertVersionSet(SERVICE_ID, 'canary', {
        version_set: { agent_version_number: 99 },
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deletes a service', async () => {
    await expect(client.services.delete(SERVICE_ID)).resolves.toBeUndefined()
  })
})

describe('ServicesResource voice-judge results', () => {
  it('lists recent voice-judge results for one service, forwarding limit and offset', async () => {
    let captured: URL | undefined
    const voiceJudgeClient = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init)
        captured = new URL(request.url)
        return Response.json(VOICE_JUDGE_FIXTURE)
      },
    })

    const result = await voiceJudgeClient.services.listVoiceJudgeResults(SERVICE_ID, {
      limit: 10,
      offset: 20,
    })

    expect(captured?.pathname).toBe(`${BASE}/services/${SERVICE_ID}/voice-judge/recent`)
    expect(captured?.searchParams.get('limit')).toBe('10')
    expect(captured?.searchParams.get('offset')).toBe('20')
    expect(result.count).toBe(1)
    expect(result.items[0]?.overall_score).toBe(4.2)
  })
})
