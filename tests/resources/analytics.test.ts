import { describe, it, expect } from 'vitest'
import { AmigoClient, type EvalQualityResponse } from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'

const DASHBOARD_FIXTURE = {
  call_volume: { value: 150, delta_pct: 12.5 },
  avg_duration_s: { value: 240, delta_pct: -3.0 },
  avg_quality: { value: 0.78, delta_pct: 1.2 },
  avg_ttfb_ms: { value: 820, delta_pct: -5.0 },
  escalation_rate: { value: 0.04, delta_pct: -1.0 },
  tool_success_rate: { value: 0.96, delta_pct: 0.5 },
  period_days: 7,
}

const CALLS_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  total_calls: 150,
  total_duration_seconds: 36000,
  avg_duration_seconds: 240,
  period_start: '2026-01-01',
  period_end: '2026-01-07',
  calls_by_date: [{ date: '2026-01-01', count: 20, avg_duration_seconds: 240 }],
}

const AGENTS_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  agents: [
    {
      agent_id: 'agent-001',
      agent_name: 'Scheduler',
      total_calls: 80,
      avg_duration_seconds: 200,
      completed_calls: 75,
      completion_rate: 0.94,
    },
  ],
}

const CALL_QUALITY_FIXTURE = {
  summary: {
    avg_quality_score: 82.5,
    p50_quality_score: 85,
    p95_quality_score: 95,
    total_calls: 150,
    escalation_rate: 0.1,
    avg_duration_seconds: 200,
  },
  trend: [{ date: '2026-01-01T00:00:00Z', avg_quality: 80, call_count: 50, escalation_count: 5 }],
  quality_distribution: { excellent_90_100: 60, good_70_89: 70, fair_50_69: 15, poor_0_49: 5 },
}

const EMOTION_TRENDS_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  timeseries: [{ timestamp: '2026-01-01T00:00:00Z', positive: 0.6, neutral: 0.3, negative: 0.1 }],
}

const LATENCY_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  avg_ttfb_ms: 320,
  avg_response_time_ms: 850,
}

const TOOL_PERFORMANCE_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  tools: [{ name: 'book_appointment', success_rate: 0.95, avg_latency_ms: 450 }],
}

const DATA_QUALITY_FIXTURE = {
  confidence_by_source: {},
  confidence_distribution: [
    { confidence_range: 'verified', count: 88 },
    { confidence_range: 'raw', count: 12 },
  ],
  period_start: '2026-01-01',
  period_end: '2026-01-07',
  review_pipeline: {},
}

const USAGE_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  buckets: [{ event_type: 'call.started', event_date: '2026-01-01', count: 50 }],
  period_start: '2026-01-01',
  period_end: '2026-01-07',
  total_events: 25000,
}

const EVENT_BREAKDOWN_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  by_type: [
    { key: 'call.started', count: 150 },
    { key: 'call.ended', count: 148 },
  ],
  by_source: [],
  period_start: '2026-01-01',
  period_end: '2026-01-07',
  total_events: 298,
}

const OPERATOR_PERFORMANCE_FIXTURE = {
  summary: {
    escalated_count: 12,
    escalation_rate: 0.08,
    operator_handled_count: 10,
    total_calls: 150,
    avg_escalated_duration_seconds: 300,
    avg_escalated_quality_score: 0.85,
    avg_non_escalated_quality_score: 0.9,
  },
  trend: [{ date: '2026-01-01', escalated_count: 3, total_calls: 20 }],
}

const ADVANCED_CALL_STATS_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  abandonment_rate: 0.05,
  transfer_rate: 0.12,
  avg_silence_seconds: 3.2,
}

const EVAL_QUALITY_FIXTURE = {
  summary: { eval_key: null, total_evals: 40, judged: 36, pass_rate: 0.75, avg_score: null },
  by_eval_key: [
    {
      eval_key: 'resolved_on_first_call',
      total_evals: 40,
      judged: 36,
      pass_rate: 0.75,
      avg_score: null,
    },
  ],
  trend: [{ date: '2026-10-10', total_evals: 12, judged: 11, pass_rate: 0.8, avg_score: null }],
} satisfies EvalQualityResponse

const COMPARISON_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  current: { total_calls: 150, avg_duration_seconds: 240 },
  previous: { total_calls: 120, avg_duration_seconds: 220 },
  delta: { total_calls: 30, avg_duration_seconds: 20 },
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
    [`GET ${BASE}/analytics/dashboard`]: () => Response.json(DASHBOARD_FIXTURE),
    [`GET ${BASE}/analytics/calls`]: () => Response.json(CALLS_FIXTURE),
    [`GET ${BASE}/analytics/agents`]: () => Response.json(AGENTS_FIXTURE),
    [`GET ${BASE}/analytics/call-quality`]: () => Response.json(CALL_QUALITY_FIXTURE),
    [`GET ${BASE}/analytics/emotion-trends`]: () => Response.json(EMOTION_TRENDS_FIXTURE),
    [`GET ${BASE}/analytics/latency`]: () => Response.json(LATENCY_FIXTURE),
    [`GET ${BASE}/analytics/tool-performance`]: () => Response.json(TOOL_PERFORMANCE_FIXTURE),
    [`GET ${BASE}/analytics/data-quality`]: () => Response.json(DATA_QUALITY_FIXTURE),
    [`GET ${BASE}/analytics/usage`]: () => Response.json(USAGE_FIXTURE),
    [`GET ${BASE}/analytics/events`]: () => Response.json(EVENT_BREAKDOWN_FIXTURE),
    [`GET ${BASE}/analytics/operator-performance`]: () =>
      Response.json(OPERATOR_PERFORMANCE_FIXTURE),
    [`GET ${BASE}/analytics/calls/advanced`]: () => Response.json(ADVANCED_CALL_STATS_FIXTURE),
    [`GET ${BASE}/analytics/calls/comparison`]: () => Response.json(COMPARISON_FIXTURE),
    [`GET ${BASE}/analytics/eval-quality`]: () => Response.json(EVAL_QUALITY_FIXTURE),
  }),
})

describe('AnalyticsResource', () => {
  it('gets the dashboard', async () => {
    const result = await client.analytics.getDashboard()
    expect(result.call_volume.value).toBe(150)
    expect(result.period_days).toBe(7)
  })

  it('gets the dashboard with days param', async () => {
    const result = await client.analytics.getDashboard({ days: 30 })
    expect(result.call_volume.value).toBe(150)
  })

  it('gets call analytics', async () => {
    const result = await client.analytics.getCalls()
    expect(result.total_calls).toBe(150)
    expect(result.calls_by_date).toHaveLength(1)
  })

  it('gets call analytics with filter params', async () => {
    const result = await client.analytics.getCalls({
      days: 14,
      interval: '1d',
      date_from: '2026-01-01',
      date_to: '2026-01-14',
    })
    expect(result.total_calls).toBe(150)
  })

  it('gets agent analytics', async () => {
    const result = await client.analytics.getAgents()
    expect(result.agents).toHaveLength(1)
    expect(result.agents[0]?.agent_name).toBe('Scheduler')
  })

  it('gets call quality', async () => {
    const result = await client.analytics.getCallQuality()
    expect(result.summary.total_calls).toBe(150)
    expect(result.summary.avg_quality_score).toBe(82.5)
    expect(result.quality_distribution.excellent_90_100).toBe(60)
    expect(result.trend[0]?.call_count).toBe(50)
  })

  it('gets emotion trends', async () => {
    const result = await client.analytics.getEmotionTrends()
    const timeseries = result.timeseries as { positive: number }[]
    expect(timeseries).toHaveLength(1)
    expect(timeseries[0]?.positive).toBe(0.6)
  })

  it('gets latency metrics', async () => {
    const result = await client.analytics.getLatency()
    expect(result.avg_ttfb_ms).toBe(320)
    expect(result.avg_response_time_ms).toBe(850)
  })

  it('gets tool performance', async () => {
    const result = await client.analytics.getToolPerformance()
    const tools = result.tools as { success_rate: number }[]
    expect(tools).toHaveLength(1)
    expect(tools[0]?.success_rate).toBe(0.95)
  })

  it('gets data quality', async () => {
    const result = await client.analytics.getDataQuality()
    expect(result.confidence_distribution).toHaveLength(2)
    expect(result.period_start).toBe('2026-01-01')
  })

  it('gets usage', async () => {
    const result = await client.analytics.getUsage()
    expect(result.total_events).toBe(25000)
    expect(result.workspace_id).toBe(TEST_WORKSPACE_ID)
  })

  it('gets event breakdown', async () => {
    const result = await client.analytics.getEventBreakdown()
    expect(result.by_type).toHaveLength(2)
    expect(result.by_type[0]?.key).toBe('call.started')
  })

  it('gets operator performance', async () => {
    const result = await client.analytics.getOperatorPerformance()
    expect(result.summary.escalated_count).toBe(12)
    expect(result.trend).toHaveLength(1)
  })

  it('gets advanced call stats', async () => {
    const result = await client.analytics.getAdvancedCallStats()
    expect(result.abandonment_rate).toBe(0.05)
    expect(result.transfer_rate).toBe(0.12)
  })

  it('gets production eval quality', async () => {
    const result = await client.analytics.getEvalQuality()
    expect(result.summary.pass_rate).toBe(0.75)
    expect(result.by_eval_key[0]?.eval_key).toBe('resolved_on_first_call')
    expect(result.trend[0]?.judged).toBe(11)
  })

  it('compares call periods', async () => {
    const result = await client.analytics.compareCallPeriods({
      current_from: '2026-01-08',
      current_to: '2026-01-14',
      previous_from: '2026-01-01',
      previous_to: '2026-01-07',
    })
    expect(result.current).toBeDefined()
    expect(result.previous).toBeDefined()
    expect(result.delta).toBeDefined()
  })
})

function capturingClient() {
  const captured: { url?: string } = {}
  const client = new AmigoClient({
    apiKey: TEST_API_KEY,
    workspaceId: TEST_WORKSPACE_ID,
    fetch: async (input: string | URL | Request): Promise<Response> => {
      captured.url = input instanceof Request ? input.url : input.toString()
      return Response.json({})
    },
  })
  return { client, captured }
}

describe('AnalyticsResource eval quality param forwarding', () => {
  it('forwards the window, interval and service', async () => {
    const { client, captured } = capturingClient()
    await client.analytics.getEvalQuality({
      days: 14,
      interval: '1w',
      service_id: '00000000-0000-0000-0000-0000000000a1',
    })
    const url = new URL(captured.url!)
    expect(url.pathname).toBe(`/v1/${TEST_WORKSPACE_ID}/analytics/eval-quality`)
    expect(url.searchParams.get('days')).toBe('14')
    expect(url.searchParams.get('interval')).toBe('1w')
    expect(url.searchParams.get('service_id')).toBe('00000000-0000-0000-0000-0000000000a1')
  })
})

describe('AnalyticsResource surfaces analytics param forwarding', () => {
  it('forwards completion-rates filters (date range, interval, entity)', async () => {
    const { client, captured } = capturingClient()
    await client.analytics.surfaces.getCompletionRates({
      days: 30,
      date_from: '2026-06-01',
      date_to: '2026-06-30',
      interval: '1d',
      entity_id: 'ent-001',
    })
    const query = new URL(captured.url!).searchParams
    expect(query.get('days')).toBe('30')
    expect(query.get('date_from')).toBe('2026-06-01')
    expect(query.get('date_to')).toBe('2026-06-30')
    expect(query.get('interval')).toBe('1d')
    expect(query.get('entity_id')).toBe('ent-001')
  })

  it('forwards channel-effectiveness date range', async () => {
    const { client, captured } = capturingClient()
    await client.analytics.surfaces.getChannelEffectiveness({
      days: 14,
      date_from: '2026-06-01',
      date_to: '2026-06-14',
    })
    const query = new URL(captured.url!).searchParams
    expect(query.get('days')).toBe('14')
    expect(query.get('date_from')).toBe('2026-06-01')
    expect(query.get('date_to')).toBe('2026-06-14')
  })

  it('forwards field-abandonment date range', async () => {
    const { client, captured } = capturingClient()
    await client.analytics.surfaces.getFieldAbandonment({
      days: 7,
      date_from: '2026-06-01',
      date_to: '2026-06-07',
    })
    const query = new URL(captured.url!).searchParams
    expect(query.get('days')).toBe('7')
    expect(query.get('date_from')).toBe('2026-06-01')
    expect(query.get('date_to')).toBe('2026-06-07')
  })

  it('forwards the entity surface-history limit', async () => {
    const { client, captured } = capturingClient()
    await client.analytics.surfaces.getForEntity('ent-001', { limit: 5 })
    const url = new URL(captured.url!)
    expect(url.pathname).toBe(`/v1/${TEST_WORKSPACE_ID}/analytics/surfaces/entity/ent-001`)
    expect(url.searchParams.get('limit')).toBe('5')
  })
})
