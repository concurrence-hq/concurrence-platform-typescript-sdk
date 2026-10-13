import { describe, it, expect } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { NotFoundError } from '../../src/core/errors.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'

const SESSION_ID = 'sim-00000000-0000-0000-0000-000000000001'
const AGENT_ID = 'agent-00000000-0000-0000-0000-000000000001'
const RUN_ID = 'run-00000000-0000-0000-0000-000000000001'
const SERVICE_ID = 'svc-00000000-0000-0000-0000-000000000001'
const CASE_ID = '00000000-0000-0000-0000-0000000000c1'
const SUITE_ID = '00000000-0000-0000-0000-0000000000a1'
const SUITE_RUN_ID = '00000000-0000-0000-0000-0000000000b1'

interface RecordedRequest {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
}

/**
 * A client whose fetch records each request's method, path, query and JSON
 * body, so a test can assert what goes over the wire. DELETE answers 204, any
 * other method answers 200 with `responseBody`.
 */
function recordingClient(responseBody: unknown = {}) {
  const requests: RecordedRequest[] = []
  const recording = new AmigoClient({
    apiKey: TEST_API_KEY,
    workspaceId: TEST_WORKSPACE_ID,
    fetch: async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input, init)
      const url = new URL(request.url)
      const text = await request.text()
      requests.push({
        method: request.method,
        path: url.pathname,
        query: url.searchParams,
        body: text ? JSON.parse(text) : undefined,
      })
      if (request.method === 'DELETE') return new Response(null, { status: 204 })
      return Response.json(responseBody)
    },
  })
  return { client: recording, requests }
}

const SESSION_FIXTURE = {
  session_id: SESSION_ID,
  workspace_id: TEST_WORKSPACE_ID,
  agent_id: AGENT_ID,
  greeting: 'Hello! Thank you for calling Acme Health. How can I help you today?',
  snapshot: {
    turn_count: 0,
    state: 'greeting',
    context: {},
  },
  created_at: '2026-01-01T00:00:00Z',
}

const STEP_RESULT_FIXTURE = {
  observation: {
    agent_text: 'I can help you schedule an appointment. What date works best for you?',
    is_terminal: false,
    tools_called: [],
  },
  snapshot: {
    turn_count: 1,
    state: 'collect_info',
    context: { topic: 'appointment_scheduling' },
  },
}

const RECOMMEND_FIXTURE = {
  session_id: SESSION_ID,
  suggestions: [
    { text: "I'd like to schedule an appointment for next Tuesday", category: 'happy_path' },
    { text: 'What insurance do you accept?', category: 'clarification' },
    { text: 'I need to cancel my existing appointment', category: 'edge_case' },
  ],
}

const INTELLIGENCE_FIXTURE = {
  session_id: SESSION_ID,
  intelligence: {
    summary: 'Patient called to schedule a routine check-up.',
    sentiment: 'positive',
    quality_score: 0.92,
  },
}

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

const BASE = `/v1/${TEST_WORKSPACE_ID}`

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`POST ${BASE}/simulations/sessions`]: () => Response.json(SESSION_FIXTURE, { status: 201 }),

    [`GET ${BASE}/simulations/sessions/${SESSION_ID}`]: () => Response.json(SESSION_FIXTURE),

    [`GET ${BASE}/simulations/sessions/not-found`]: () =>
      Response.json({ detail: 'Session not found', error_code: 'not_found' }, { status: 404 }),

    [`DELETE ${BASE}/simulations/sessions/${SESSION_ID}`]: () =>
      Response.json({ status: 'destroyed' }),

    [`POST ${BASE}/simulations/sessions/step`]: () => Response.json(STEP_RESULT_FIXTURE),

    [`POST ${BASE}/simulations/sessions/recommend`]: () => Response.json(RECOMMEND_FIXTURE),

    [`GET ${BASE}/simulations/sessions/${SESSION_ID}/intelligence`]: () =>
      Response.json(INTELLIGENCE_FIXTURE),

    [`POST ${BASE}/simulations/sessions/${SESSION_ID}/fork`]: () =>
      Response.json({ fork_turn_index: 1, branches: [{ session_id: 'sim-fork-1' }] }),

    [`POST ${BASE}/simulations/sessions/${SESSION_ID}/score`]: () =>
      Response.json({ status: 'scored' }),

    [`POST ${BASE}/simulations/sessions/${SESSION_ID}/promote`]: () =>
      Response.json({ run_id: RUN_ID, session_id: SESSION_ID, already_bound: false }),

    [`GET ${BASE}/simulations/runs`]: () => Response.json({ items: [{ id: RUN_ID }] }),
    [`POST ${BASE}/simulations/runs`]: () => Response.json({ id: RUN_ID }, { status: 201 }),
    [`GET ${BASE}/simulations/runs/${RUN_ID}`]: () =>
      Response.json({ id: RUN_ID, service_id: SERVICE_ID, status: 'running' }),
    [`POST ${BASE}/simulations/runs/${RUN_ID}/complete`]: () => Response.json({ ok: true }),
    [`POST ${BASE}/simulations/runs/${RUN_ID}/sessions`]: () => Response.json(SESSION_FIXTURE),

    [`POST ${BASE}/simulations/bridge`]: () => Response.json({ run_id: RUN_ID }),

    [`GET ${BASE}/simulations/services/${SERVICE_ID}/graph`]: () => Response.json({ nodes: [] }),
    [`DELETE ${BASE}/simulations/services/${SERVICE_ID}/graph`]: () => Response.json({ ok: true }),
    [`GET ${BASE}/simulations/services/${SERVICE_ID}/graph/paths`]: () =>
      Response.json({ paths: [] }),
    [`GET ${BASE}/simulations/services/${SERVICE_ID}/sessions`]: () => Response.json({ items: [] }),
    [`GET ${BASE}/simulations/services/${SERVICE_ID}/turns`]: () => Response.json({ items: [] }),
  }),
})

describe('SimulationsResource', () => {
  it('creates a simulation session', async () => {
    const result = await client.simulations.createSession({
      agent_id: AGENT_ID,
    } as never)
    expect(result.session_id).toBe(SESSION_ID)
    expect(result.greeting).toContain('Acme Health')
    expect(result.snapshot.turn_count).toBe(0)
  })

  it('gets a simulation session', async () => {
    const result = await client.simulations.getSession(SESSION_ID)
    expect(result.session_id).toBe(SESSION_ID)
    expect(result.agent_id).toBe(AGENT_ID)
  })

  it('throws NotFoundError for missing session', async () => {
    await expect(client.simulations.getSession('not-found')).rejects.toThrow(NotFoundError)
  })

  it('deletes a simulation session', async () => {
    const result = await client.simulations.deleteSession(SESSION_ID)
    expect(result.status).toBe('destroyed')
  })

  it('steps through a simulation turn', async () => {
    const result = await client.simulations.step({
      session_id: SESSION_ID,
      caller_message: "I'd like to schedule an appointment",
    } as never)
    expect(result.observation).toBeDefined()
    expect(result.observation.agent_text).toContain('schedule an appointment')
    expect(result.snapshot).toBeDefined()
  })

  it('gets caller message recommendations', async () => {
    const result = await client.simulations.recommend({
      session_id: SESSION_ID,
    } as never)
    expect(result.suggestions).toBeDefined()
  })

  it('gets session intelligence', async () => {
    const result = await client.simulations.getIntelligence(SESSION_ID)
    expect(result.session_id).toBe(SESSION_ID)
    expect(result.intelligence).toBeDefined()
  })

  it('forks a session into branches', async () => {
    const result = await client.simulations.forkSession(SESSION_ID, {
      alternatives: [{ caller_text: 'What if I ask about pricing?' }],
    })
    const branches = (result as { branches?: { session_id: string }[] }).branches
    expect(branches?.[0]?.session_id).toBe('sim-fork-1')
  })

  it('scores a session', async () => {
    const result = await client.simulations.scoreSession(SESSION_ID, {
      score: 0.9,
      score_rationale: 'clear and complete',
    })
    expect((result as { status?: string }).status).toBe('scored')
  })

  it('promotes a run-less session into a coverage run', async () => {
    const result = await client.simulations.promoteSession(SESSION_ID)
    expect(result.run_id).toBe(RUN_ID)
    expect(result.session_id).toBe(SESSION_ID)
    expect(result.already_bound).toBe(false)
  })

  describe('runs', () => {
    it('lists, creates, gets, completes, and adds sessions to a run', async () => {
      expect(await client.simulations.runs.list()).toMatchObject({ items: [{ id: RUN_ID }] })
      expect(
        await client.simulations.runs.create(
          {} as Parameters<typeof client.simulations.runs.create>[0],
        ),
      ).toMatchObject({ id: RUN_ID })
      expect(await client.simulations.runs.get(RUN_ID)).toMatchObject({
        id: RUN_ID,
        service_id: SERVICE_ID,
      })
      expect(await client.simulations.runs.complete(RUN_ID)).toMatchObject({ ok: true })
      expect(
        await client.simulations.runs.createSession(RUN_ID, {
          service_id: SERVICE_ID,
        }),
      ).toMatchObject({ session_id: SESSION_ID })
    })
  })

  describe('bridge', () => {
    it('runs a bridge', async () => {
      expect(
        await client.simulations.bridge.run(
          {} as Parameters<typeof client.simulations.bridge.run>[0],
        ),
      ).toMatchObject({ run_id: RUN_ID })
    })
  })

  describe('services', () => {
    it('graphs / paths / sessions / turns', async () => {
      expect(await client.simulations.services.getGraph(SERVICE_ID)).toMatchObject({ nodes: [] })
      expect(await client.simulations.services.deleteGraph(SERVICE_ID)).toMatchObject({
        ok: true,
      })
      expect(await client.simulations.services.getGraphPaths(SERVICE_ID)).toMatchObject({
        paths: [],
      })
      expect(await client.simulations.services.listSessions(SERVICE_ID)).toMatchObject({
        items: [],
      })
      expect(await client.simulations.services.listTurns(SERVICE_ID)).toMatchObject({
        items: [],
      })
    })

    it('sends the run, include_turns, limit and transition filters', async () => {
      const { client: recording, requests } = recordingClient()
      await recording.simulations.services.getGraph(SERVICE_ID, {
        run_id: RUN_ID,
        include_turns: true,
      })
      await recording.simulations.services.getGraphPaths(SERVICE_ID, { run_id: RUN_ID })
      await recording.simulations.services.listSessions(SERVICE_ID, { run_id: RUN_ID, limit: 25 })
      await recording.simulations.services.listTurns(SERVICE_ID, {
        from_state: 'greeting',
        to_state: 'collect_info',
        limit: 10,
      })

      const services = `${BASE}/simulations/services/${SERVICE_ID}`
      expect(requests.map((r) => r.path)).toEqual([
        `${services}/graph`,
        `${services}/graph/paths`,
        `${services}/sessions`,
        `${services}/turns`,
      ])
      expect(Object.fromEntries(requests[0]!.query)).toEqual({
        run_id: RUN_ID,
        include_turns: 'true',
      })
      expect(Object.fromEntries(requests[1]!.query)).toEqual({ run_id: RUN_ID })
      expect(Object.fromEntries(requests[2]!.query)).toEqual({ run_id: RUN_ID, limit: '25' })
      expect(Object.fromEntries(requests[3]!.query)).toEqual({
        from_state: 'greeting',
        to_state: 'collect_info',
        limit: '10',
      })
    })
  })

  describe('session turns, performance and turn policy', () => {
    it('steps the session named in the path and sends the body as given', async () => {
      const { client: recording, requests } = recordingClient(STEP_RESULT_FIXTURE)
      const result = await recording.simulations.stepSession(SESSION_ID, {
        caller_text: "I'd like to schedule an appointment",
        emotion: 'calm',
        valence: 0.4,
      })

      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({
        method: 'POST',
        path: `${BASE}/simulations/sessions/${SESSION_ID}/step`,
        body: { caller_text: "I'd like to schedule an appointment", emotion: 'calm', valence: 0.4 },
      })
      expect(result.observation.agent_text).toContain('schedule an appointment')
    })

    it('reads a session turns, the performance rollup and the turn policy', async () => {
      const { client: recording, requests } = recordingClient()
      await recording.simulations.getSessionTurns(SESSION_ID)
      await recording.simulations.getPerformance({ service_id: SERVICE_ID, limit: 30 })
      await recording.simulations.configToPolicy({ config: { greeting_shield_s: 1.5 } })

      expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        `GET ${BASE}/simulations/sessions/${SESSION_ID}/turns`,
        `GET ${BASE}/simulations/performance`,
        `POST ${BASE}/simulations/config-to-policy`,
      ])
      expect(Object.fromEntries(requests[1]!.query)).toEqual({
        service_id: SERVICE_ID,
        limit: '30',
      })
      expect(requests[2]!.body).toEqual({ config: { greeting_shield_s: 1.5 } })
    })
  })

  describe('runs.complete', () => {
    it('sends the failure reason as the error query parameter', async () => {
      const { client: recording, requests } = recordingClient({ status: 'failed' })
      const result = await recording.simulations.runs.complete(RUN_ID, {
        error: 'All 3 scenarios failed',
      })

      expect(requests[0]).toMatchObject({
        method: 'POST',
        path: `${BASE}/simulations/runs/${RUN_ID}/complete`,
        body: undefined,
      })
      expect(requests[0]!.query.get('error')).toBe('All 3 scenarios failed')
      expect(result.status).toBe('failed')
    })

    it('sends no error when the run completed', async () => {
      const { client: recording, requests } = recordingClient({ status: 'completed' })
      await recording.simulations.runs.complete(RUN_ID)

      expect(requests[0]!.query.has('error')).toBe(false)
    })
  })

  describe('cases', () => {
    const caseItem = {
      description: 'Refill request in Spanish',
      scenario: { instructions: 'Ask for a refill of your blood pressure medication.' },
      tags: ['intake', 'spanish'],
    }

    it('calls every case route with its path, query and body', async () => {
      const { client: recording, requests } = recordingClient()
      await recording.simulations.cases.list({
        service_id: SERVICE_ID,
        tags: ['intake', 'spanish'],
        search: 'refill',
        sort_by: ['-updated_at'],
        limit: 20,
        continuation_token: 20,
      })
      await recording.simulations.cases.create({ cases: [caseItem] })
      await recording.simulations.cases.get(CASE_ID)
      await recording.simulations.cases.update(CASE_ID, { service_id: SERVICE_ID })
      await recording.simulations.cases.delete(CASE_ID)
      await recording.simulations.cases.run(CASE_ID, { max_turns: 8 })

      const cases = `${BASE}/simulations/cases`
      expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        `GET ${cases}`,
        `POST ${cases}`,
        `GET ${cases}/${CASE_ID}`,
        `PATCH ${cases}/${CASE_ID}`,
        `DELETE ${cases}/${CASE_ID}`,
        `POST ${cases}/${CASE_ID}/run`,
      ])
      const listQuery = requests[0]!.query
      expect(listQuery.getAll('tags')).toEqual(['intake', 'spanish'])
      expect(listQuery.getAll('sort_by')).toEqual(['-updated_at'])
      expect(listQuery.get('service_id')).toBe(SERVICE_ID)
      expect(listQuery.get('search')).toBe('refill')
      expect(listQuery.get('limit')).toBe('20')
      expect(listQuery.get('continuation_token')).toBe('20')
      expect(requests[1]!.body).toEqual({ cases: [caseItem] })
      expect(requests[3]!.body).toEqual({ service_id: SERVICE_ID })
      expect(requests[5]!.body).toEqual({ max_turns: 8 })
    })

    it('returns nothing from delete and surfaces a missing case as NotFoundError', async () => {
      const { client: recording } = recordingClient()
      await expect(recording.simulations.cases.delete(CASE_ID)).resolves.toBeUndefined()

      const missing = new AmigoClient({
        apiKey: TEST_API_KEY,
        workspaceId: TEST_WORKSPACE_ID,
        fetch: mockFetch({
          [`DELETE ${BASE}/simulations/cases/${CASE_ID}`]: () =>
            Response.json({ detail: 'Simulation case not found' }, { status: 404 }),
        }),
      })
      await expect(missing.simulations.cases.delete(CASE_ID)).rejects.toThrow(NotFoundError)
    })
  })

  describe('suites', () => {
    it('calls every suite route with its path, query and body', async () => {
      const { client: recording, requests } = recordingClient()
      await recording.simulations.suites.list()
      await recording.simulations.suites.create({ name: 'Intake', required_tags: ['intake'] })
      await recording.simulations.suites.get(SUITE_ID)
      await recording.simulations.suites.update(SUITE_ID, { case_ids: [CASE_ID] })
      await recording.simulations.suites.delete(SUITE_ID)
      await recording.simulations.suites.run(SUITE_ID, { service_id: SERVICE_ID, max_cases: 50 })
      await recording.simulations.suites.listRuns(SUITE_ID, { limit: 5 })
      await recording.simulations.suites.listCases(SUITE_ID, { search: 'refill', limit: 50 })

      const suites = `${BASE}/simulations/suites`
      expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        `GET ${suites}`,
        `POST ${suites}`,
        `GET ${suites}/${SUITE_ID}`,
        `PATCH ${suites}/${SUITE_ID}`,
        `DELETE ${suites}/${SUITE_ID}`,
        `POST ${suites}/${SUITE_ID}/run`,
        `GET ${suites}/${SUITE_ID}/runs`,
        `GET ${suites}/${SUITE_ID}/cases`,
      ])
      expect(requests[1]!.body).toEqual({ name: 'Intake', required_tags: ['intake'] })
      expect(requests[3]!.body).toEqual({ case_ids: [CASE_ID] })
      expect(requests[5]!.body).toEqual({ service_id: SERVICE_ID, max_cases: 50 })
      expect(Object.fromEntries(requests[6]!.query)).toEqual({ limit: '5' })
      expect(Object.fromEntries(requests[7]!.query)).toEqual({ search: 'refill', limit: '50' })
    })
  })

  describe('suiteRuns and benchmarks', () => {
    it('reads a suite run and runs and aggregates a benchmark', async () => {
      const { client: recording, requests } = recordingClient()
      await recording.simulations.suiteRuns.get(SUITE_RUN_ID)
      await recording.simulations.benchmarks.run({ required_tags: ['intake'], max_cases: 20 })
      await recording.simulations.benchmarks.getResults({ run_ids: [RUN_ID] })

      expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        `GET ${BASE}/simulations/suite-runs/${SUITE_RUN_ID}`,
        `POST ${BASE}/simulations/benchmarks/run`,
        `POST ${BASE}/simulations/benchmarks/results`,
      ])
      expect(requests[1]!.body).toEqual({ required_tags: ['intake'], max_cases: 20 })
      expect(requests[2]!.body).toEqual({ run_ids: [RUN_ID] })
    })
  })
})
