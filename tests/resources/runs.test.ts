import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  ConflictError,
  NetworkError,
  PermissionError,
  RequestTimeoutError,
  ServiceUnavailableError,
  isHttpException,
} from '../../src/core/errors.js'
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
const OPERATOR_ID = '00000000-0000-0000-0000-000000000301'
const OTHER_OPERATOR_ID = '00000000-0000-0000-0000-000000000302'
const REPLY_ID = '00000000-0000-0000-0000-000000000401'
const BASE = `/v1/${TEST_WORKSPACE_ID}`

// The server matches the hold token exactly, microseconds included, so the fixture keeps them.
const HOLD_TOKEN = '2026-10-27T14:03:05.123456+00:00'
const HOLD = {
  operator_id: OPERATOR_ID,
  since: '2026-10-27T14:03:05.123456Z',
  expires_at: '2026-10-27T14:04:35.123456Z',
}

function clientAnswering(answer: (request: Request) => Response | Promise<Response>) {
  return new AmigoClient({
    apiKey: TEST_API_KEY,
    workspaceId: TEST_WORKSPACE_ID,
    fetch: async (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      answer(input instanceof Request ? input : new Request(input, init)),
  })
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

  it('takeOver() on a text run returns the hold and the token that fences a renewal', async () => {
    const taking = clientAnswering(() =>
      Response.json({
        run_id: RUN_ID,
        mode: 'takeover',
        held_by: HOLD,
        hold_token: HOLD_TOKEN,
        lease_seconds: 90,
      }),
    )

    const res = await taking.runs.takeOver(RUN_ID, { operator_id: OPERATOR_ID })

    expect(res.held_by).toEqual(HOLD)
    expect(res.held_by?.expires_at).toBe(HOLD.expires_at)
    expect(res.hold_token).toBe(HOLD_TOKEN)
    expect(res.lease_seconds).toBe(90)
    expect(res.conference_sid).toBeUndefined()
  })

  it('takeOver() throws ConflictError naming the holder when another operator holds the run', async () => {
    const detail = {
      code: 'run_held',
      held_by: { ...HOLD, operator_id: OTHER_OPERATOR_ID },
      operator_name: 'Operator Two',
    }
    const held = clientAnswering(() => Response.json({ detail }, { status: 409 }))

    const refused = held.runs.takeOver(RUN_ID, { operator_id: OPERATOR_ID })

    await expect(refused).rejects.toBeInstanceOf(ConflictError)
    await expect(refused).rejects.toMatchObject({ statusCode: 409, errorBody: { detail } })
  })

  it('get() shows who holds a text run and until when', async () => {
    const run = {
      run_id: RUN_ID,
      workspace_id: TEST_WORKSPACE_ID,
      kind: 'conversation',
      status: 'running',
      channel: 'sms',
      source_conversation_id: CONVERSATION_IDS[0],
      started_at: '2026-10-27T14:00:00Z',
      takeover: { eligible: true, mode_options: ['takeover'], held_by: HOLD },
    } satisfies Run
    const reading = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async () => Response.json(run),
    })

    const res = await reading.runs.get(RUN_ID)

    expect(res.takeover.eligible).toBe(true)
    expect(res.takeover.held_by).toEqual(HOLD)
    expect(res.takeover.held_by?.expires_at).toBe(HOLD.expires_at)
  })

  describe('renewTakeover()', () => {
    const RENEWAL = { operator_id: OPERATOR_ID, hold_token: HOLD_TOKEN }
    const RENEWED_HOLD = { ...HOLD, expires_at: '2026-10-27T14:05:05.654321Z' }

    it('renews the hold with the token takeOver returned', async () => {
      let sent: { method: string; pathname: string; body: unknown } | undefined
      const renewing = clientAnswering(async (request) => {
        sent = {
          method: request.method,
          pathname: new URL(request.url).pathname,
          body: await request.json(),
        }
        return Response.json({ run_id: RUN_ID, held_by: RENEWED_HOLD, lease_seconds: 90 })
      })

      const res = await renewing.runs.renewTakeover(RUN_ID, RENEWAL)

      expect(sent).toEqual({
        method: 'POST',
        pathname: `${BASE}/runs/${RUN_ID}/takeover/renew`,
        body: RENEWAL,
      })
      expect(res.run_id).toBe(RUN_ID)
      expect(res.lease_seconds).toBe(90)
      expect(res.held_by.operator_id).toBe(OPERATOR_ID)
      expect(res.held_by.since).toBe(HOLD.since)
      expect(res.held_by.expires_at).toBe(RENEWED_HOLD.expires_at)
    })

    it('throws ConflictError with the server code hold_lost when the hold is gone', async () => {
      const gone = clientAnswering(() =>
        Response.json({ detail: { code: 'hold_lost' } }, { status: 409 }),
      )

      const error: unknown = await gone.runs.renewTakeover(RUN_ID, RENEWAL).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ConflictError)
      expect(error).toMatchObject({ statusCode: 409, errorBody: { detail: { code: 'hold_lost' } } })
      // The code sits under `detail`, so a caller reads it off the typed body without a cast.
      if (!isHttpException(error)) throw new Error('expected an HTTP exception body')
      const { detail } = error.errorBody
      expect(typeof detail === 'object' && !Array.isArray(detail) ? detail.code : undefined).toBe(
        'hold_lost',
      )
    })

    it('throws ServiceUnavailableError when the run is busy', async () => {
      const busy = clientAnswering(() =>
        Response.json(
          { detail: 'The run is busy, try again' },
          { status: 503, headers: { 'Retry-After': '1' } },
        ),
      )

      const refused = busy.runs.renewTakeover(RUN_ID, RENEWAL)

      await expect(refused).rejects.toBeInstanceOf(ServiceUnavailableError)
      await expect(refused).rejects.toMatchObject({ statusCode: 503 })
    })

    it.each([
      'Operators is a beta feature that is not enabled for this workspace',
      'You may only perform operator actions as your own operator identity.',
    ])('throws PermissionError on a 403 (%s)', async (detail) => {
      const refusing = clientAnswering(() => Response.json({ detail }, { status: 403 }))

      const refused = refusing.runs.renewTakeover(RUN_ID, RENEWAL)

      await expect(refused).rejects.toBeInstanceOf(PermissionError)
      await expect(refused).rejects.toMatchObject({ statusCode: 403, detail })
    })
  })

  describe('authorTurn()', () => {
    const REPLY = { operator_id: OPERATOR_ID, text: 'Your refill is ready for pickup.' }

    it('stages the operator reply on a taken-over text run', async () => {
      let sent: { method: string; pathname: string; body: unknown } | undefined
      const staging = clientAnswering(async (request) => {
        sent = {
          method: request.method,
          pathname: new URL(request.url).pathname,
          body: await request.json(),
        }
        return Response.json({ run_id: RUN_ID, staged: true })
      })

      const res = await staging.runs.authorTurn(RUN_ID, REPLY)

      expect(sent).toEqual({
        method: 'POST',
        pathname: `${BASE}/runs/${RUN_ID}/authored-turn`,
        body: REPLY,
      })
      expect(res.run_id).toBe(RUN_ID)
      expect(res.staged).toBe(true)
    })

    it('throws ConflictError on a voice run', async () => {
      const detail = 'Voice runs are driven live; author a turn only on non-voice runs'
      const voice = clientAnswering(() => Response.json({ detail }, { status: 409 }))

      const refused = voice.runs.authorTurn(RUN_ID, REPLY)

      await expect(refused).rejects.toBeInstanceOf(ConflictError)
      await expect(refused).rejects.toMatchObject({ statusCode: 409, detail })
    })

    it.each([
      'Operators is a beta feature that is not enabled for this workspace',
      'Identity JWT required for this operation',
    ])('throws PermissionError on a 403 (%s)', async (detail) => {
      const refusing = clientAnswering(() => Response.json({ detail }, { status: 403 }))

      const refused = refusing.runs.authorTurn(RUN_ID, REPLY)

      await expect(refused).rejects.toBeInstanceOf(PermissionError)
      await expect(refused).rejects.toMatchObject({ statusCode: 403, detail })
    })

    it('reports the staged reply and whether it waits for a person', async () => {
      const staging = clientAnswering(() =>
        Response.json({
          run_id: RUN_ID,
          staged: true,
          reply_id: REPLY_ID,
          expires_at: '2026-10-27T14:05:10Z',
          waits_for_person: true,
        }),
      )

      const res = await staging.runs.authorTurn(RUN_ID, REPLY)

      expect(res.reply_id).toBe(REPLY_ID)
      expect(res.expires_at).toBe('2026-10-27T14:05:10Z')
      expect(res.waits_for_person).toBe(true)
    })

    it.each([{ code: 'no_hold' }, { code: 'reply_pending', reply_id: REPLY_ID }])(
      'throws ConflictError carrying %j when the reply cannot be staged',
      async (detail) => {
        const refusing = clientAnswering(() => Response.json({ detail }, { status: 409 }))

        const refused = refusing.runs.authorTurn(RUN_ID, REPLY)

        await expect(refused).rejects.toBeInstanceOf(ConflictError)
        await expect(refused).rejects.toMatchObject({ statusCode: 409, errorBody: { detail } })
      },
    )
  })

  describe('getAuthoredTurn()', () => {
    it('reads what became of the reply last staged on the run', async () => {
      let sent: { method: string; pathname: string; body: string } | undefined
      const reading = clientAnswering(async (request) => {
        sent = {
          method: request.method,
          pathname: new URL(request.url).pathname,
          body: await request.text(),
        }
        return Response.json({
          run_id: RUN_ID,
          state: 'pending',
          reply_id: REPLY_ID,
          operator_id: OPERATOR_ID,
          staged_at: '2026-10-27T14:03:10Z',
          expires_at: '2026-10-27T14:05:10Z',
        })
      })

      const res = await reading.runs.getAuthoredTurn(RUN_ID)

      expect(sent).toEqual({
        method: 'GET',
        pathname: `${BASE}/runs/${RUN_ID}/authored-turn`,
        body: '',
      })
      expect(res.run_id).toBe(RUN_ID)
      expect(res.state).toBe('pending')
      expect(res.reply_id).toBe(REPLY_ID)
      expect(res.operator_id).toBe(OPERATOR_ID)
      expect(res.staged_at).toBe('2026-10-27T14:03:10Z')
      expect(res.expires_at).toBe('2026-10-27T14:05:10Z')
    })

    it.each(['none', 'pending', 'consumed', 'expired'] as const)(
      'reads the %s state',
      async (state) => {
        const reading = clientAnswering(() => Response.json({ run_id: RUN_ID, state }))

        const res = await reading.runs.getAuthoredTurn(RUN_ID)

        expect(res.state).toBe(state)
      },
    )

    it('leaves the reply fields null when nothing is known about a reply', async () => {
      const empty = clientAnswering(() =>
        Response.json({
          run_id: RUN_ID,
          state: 'none',
          reply_id: null,
          operator_id: null,
          staged_at: null,
          expires_at: null,
        }),
      )

      const res = await empty.runs.getAuthoredTurn(RUN_ID)

      expect(res.state).toBe('none')
      expect(res.reply_id).toBeNull()
      expect(res.operator_id).toBeNull()
      expect(res.staged_at).toBeNull()
      expect(res.expires_at).toBeNull()
    })

    it('throws PermissionError on a 403 in a workspace that is not enabled for operators', async () => {
      const detail = 'Operators is a beta feature that is not enabled for this workspace'
      const refusing = clientAnswering(() => Response.json({ detail }, { status: 403 }))

      const refused = refusing.runs.getAuthoredTurn(RUN_ID)

      await expect(refused).rejects.toBeInstanceOf(PermissionError)
      await expect(refused).rejects.toMatchObject({ statusCode: 403, detail })
    })
  })

  describe('handBack()', () => {
    it('hands the run back to the agent', async () => {
      let sent: { method: string; pathname: string; body: unknown } | undefined
      const handing = clientAnswering(async (request) => {
        sent = {
          method: request.method,
          pathname: new URL(request.url).pathname,
          body: await request.json(),
        }
        return Response.json({ run_id: RUN_ID, success: true })
      })

      const res = await handing.runs.handBack(RUN_ID, { operator_id: OPERATOR_ID })

      expect(sent).toEqual({
        method: 'POST',
        pathname: `${BASE}/runs/${RUN_ID}/handback`,
        body: { operator_id: OPERATOR_ID },
      })
      expect(res.success).toBe(true)
    })

    it('throws PermissionError when another operator holds the text run', async () => {
      const detail = 'Only the operator who holds this run, or an admin or owner, can hand it back'
      const refusing = clientAnswering(() => Response.json({ detail }, { status: 403 }))

      const refused = refusing.runs.handBack(RUN_ID, { operator_id: OPERATOR_ID })

      await expect(refused).rejects.toBeInstanceOf(PermissionError)
      await expect(refused).rejects.toMatchObject({ statusCode: 403, detail })
    })
  })

  // The console calls `runs.withOptions({ signal, timeout, maxRetries }).handBack`. The lease
  // methods take the same options the same way, so each call below runs through all three.
  describe('per-call request options', () => {
    type RunsCall = (runs: AmigoClient['runs']) => Promise<unknown>
    // [name, the status the SDK retries for that verb, call]. A POST is retried only on a 429 with
    // Retry-After; a GET is retried on a 5xx.
    const callsUnderTest: Array<[string, number, RunsCall]> = [
      [
        'renewTakeover',
        429,
        (runs) => runs.renewTakeover(RUN_ID, { operator_id: OPERATOR_ID, hold_token: HOLD_TOKEN }),
      ],
      ['getAuthoredTurn', 503, (runs) => runs.getAuthoredTurn(RUN_ID)],
      ['handBack', 429, (runs) => runs.handBack(RUN_ID, { operator_id: OPERATOR_ID })],
    ]

    function runsOver(fetch: typeof globalThis.fetch) {
      return new AmigoClient({ apiKey: TEST_API_KEY, workspaceId: TEST_WORKSPACE_ID, fetch }).runs
    }

    // A request that never settles is reachable only through its own signal, so a garbage
    // collection could drop the whole call. Holding it here does what an open connection does.
    const inFlight: Request[] = []
    afterEach(() => {
      inFlight.length = 0
    })

    // A transport that never answers: it fails only when the request's signal is aborted, as fetch does.
    function neverAnswering(onRequest: (request: Request) => void = () => {}) {
      return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const request = input instanceof Request ? input : new Request(input, init)
        inFlight.push(request)
        onRequest(request)
        return new Promise<Response>((_, reject) => {
          if (request.signal.aborted) reject(new Error('aborted'))
          else {
            request.signal.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            })
          }
        })
      }
    }

    it.each(callsUnderTest)('%s stops retrying at maxRetries', async (_name, status, call) => {
      const attemptsWith = async (maxRetries: number) => {
        const answering = vi.fn(async () =>
          Response.json({ detail: 'try again' }, { status, headers: { 'Retry-After': '0' } }),
        )
        await call(runsOver(answering).withOptions({ maxRetries })).catch(() => undefined)
        return answering.mock.calls.length
      }

      expect(await attemptsWith(0)).toBe(1)
      expect(await attemptsWith(1)).toBe(2)
    })

    it.each(callsUnderTest)('%s times out at timeout', async (_name, _status, call) => {
      const pending = call(runsOver(neverAnswering()).withOptions({ timeout: 10 }))

      await expect(pending).rejects.toBeInstanceOf(RequestTimeoutError)
      await expect(pending).rejects.toMatchObject({ timeoutMs: 10 })
    })

    // The signal is aborted before the call, so that it reaches the request without depending on timing.
    it.each(callsUnderTest)(
      '%s hands the signal given with timeout and maxRetries to the request',
      async (_name, _status, call) => {
        const controller = new AbortController()
        controller.abort()
        let signalAborted: boolean | undefined
        const runs = runsOver(
          neverAnswering((request) => {
            signalAborted = request.signal.aborted
          }),
        ).withOptions({ signal: controller.signal, timeout: 60_000, maxRetries: 0 })

        const pending = call(runs)

        await expect(pending).rejects.toBeInstanceOf(NetworkError)
        await expect(pending).rejects.not.toBeInstanceOf(RequestTimeoutError)
        expect(signalAborted).toBe(true)
      },
    )
  })
})
