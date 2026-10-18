import { describe, it, expect } from 'vitest'
import {
  AmigoClient,
  type AdvancedCallStatsResponse,
  type components,
  type EvalQualityResponse,
  type ToolPerformanceResponse,
} from '../../src/index.js'

type Schemas = components['schemas']

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const SERVICE_A = '00000000-0000-0000-0000-0000000000a1'
const SERVICE_B = '00000000-0000-0000-0000-0000000000b2'

const DASHBOARD_FIXTURE = {
  call_volume: { value: 150, delta_pct: 12.5 },
  avg_duration_s: { value: 240, delta_pct: -3.0 },
  avg_quality: { value: 0.78, delta_pct: 1.2 },
  avg_ttfb_ms: { value: 820, delta_pct: -5.0 },
  escalation_rate: { value: 0.04, delta_pct: -1.0 },
  tool_success_rate: { value: 0.96, delta_pct: 0.5 },
  period_days: 7,
} satisfies Schemas['AnalyticsDashboardResponse']

const CALLS_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  total_calls: 150,
  total_duration_seconds: 36000,
  avg_duration_seconds: 240,
  period_start: '2026-01-01',
  period_end: '2026-01-07',
  calls_by_date: [{ date: '2026-01-01', count: 20, avg_duration_seconds: 240 }],
} satisfies Schemas['CallStatsResponse']

const AGENTS_FIXTURE = {
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
  period: null,
} satisfies Schemas['AgentAnalyticsResponse']

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
} satisfies Schemas['CallQualityAnalyticsResponse']

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
  summary: {
    total_tool_calls: 200,
    total_succeeded: 190,
    total_failed: 10,
    overall_failure_rate: 0.05,
    avg_failure_rate_per_call: 0.04,
  },
  trend: [{ date: '2026-01-01T00:00:00Z', call_count: 40, total_tool_calls: 60, total_failed: 3 }],
  groups: null,
} satisfies ToolPerformanceResponse

const DATA_QUALITY_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  confidence_by_source: {},
  confidence_distribution: [{ confidence_range: 'projected_average', count: 100 }],
  period_start: '2026-01-01',
  period_end: '2026-01-07',
  review_pipeline: {},
  timeseries: [
    {
      date: '2026-01-07',
      avg_confidence: 0.82,
      total_events: 100,
      low_confidence: 0,
      high_confidence: 0,
    },
  ],
  total_events: 100,
} satisfies Schemas['DataQualityResponse']

const USAGE_FIXTURE = {
  workspace_id: TEST_WORKSPACE_ID,
  buckets: [{ event_type: 'call.started', event_date: '2026-01-01', count: 50 }],
  period_start: '2026-01-01',
  period_end: '2026-01-07',
  total_events: 25000,
} satisfies Schemas['UsageSummaryResponse']

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
} satisfies Schemas['EventBreakdownResponse']

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
} satisfies Schemas['OperatorPerformanceResponse']

const ADVANCED_CALL_STATS_FIXTURE = {
  summary: {
    total_calls: 150,
    escalated: 12,
    completed: 138,
    avg_duration_seconds: 240,
    p50_duration_seconds: 210,
    p95_duration_seconds: 540,
    p99_duration_seconds: 780,
    avg_quality_score: 82.5,
    p5_quality_score: 41,
    p50_quality_score: 85,
    p95_quality_score: 97,
  },
  trend: [
    {
      date: '2026-01-01T00:00:00Z',
      calls: 20,
      escalation_rate: 0.05,
      avg_duration_seconds: 230,
      avg_quality: 81,
      p50_quality: 84,
      p95_latency_ms: 910,
    },
  ],
  by_service: [
    { service_id: SERVICE_A, calls: 90, escalation_rate: 0.1, avg_quality: 80 },
    { service_id: SERVICE_B, calls: 60, escalation_rate: 0.05, avg_quality: 86 },
  ],
  by_direction: {
    inbound: { calls: 120, avg_quality: 82 },
    outbound: { calls: 30, avg_quality: 84 },
  },
  groups: null,
} satisfies AdvancedCallStatsResponse

const GROUPED_ADVANCED_CALL_STATS_FIXTURE = {
  ...ADVANCED_CALL_STATS_FIXTURE,
  groups: [
    {
      service_id: SERVICE_A,
      summary: { total_calls: 90, escalated: 9, completed: 81 },
      trend: [{ date: '2026-01-01T00:00:00Z', calls: 12, escalation_rate: 0.08 }],
    },
    {
      service_id: SERVICE_B,
      summary: { total_calls: 60, escalated: 3, completed: 57 },
      trend: [{ date: '2026-01-01T00:00:00Z', calls: 8, escalation_rate: 0 }],
    },
  ],
} satisfies AdvancedCallStatsResponse

const GROUPED_TOOL_PERFORMANCE_FIXTURE = {
  ...TOOL_PERFORMANCE_FIXTURE,
  groups: [
    {
      service_id: SERVICE_A,
      summary: {
        total_tool_calls: 120,
        total_succeeded: 112,
        total_failed: 8,
        overall_failure_rate: 0.067,
      },
      trend: [
        { date: '2026-01-01T00:00:00Z', call_count: 25, total_tool_calls: 36, total_failed: 2 },
      ],
    },
    {
      service_id: SERVICE_B,
      summary: {
        total_tool_calls: 80,
        total_succeeded: 78,
        total_failed: 2,
        overall_failure_rate: 0.025,
      },
      trend: [
        { date: '2026-01-01T00:00:00Z', call_count: 15, total_tool_calls: 24, total_failed: 1 },
      ],
    },
  ],
} satisfies ToolPerformanceResponse

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
  groups: null,
} satisfies EvalQualityResponse

const GROUPED_EVAL_QUALITY_FIXTURE = {
  ...EVAL_QUALITY_FIXTURE,
  groups: [
    {
      service_id: SERVICE_A,
      summary: { eval_key: null, total_evals: 25, judged: 24, pass_rate: 0.8, avg_score: null },
      by_eval_key: [
        {
          eval_key: 'resolved_on_first_call',
          total_evals: 25,
          judged: 24,
          pass_rate: 0.8,
          avg_score: null,
        },
      ],
      trend: [{ date: '2026-10-10', total_evals: 8, judged: 8, pass_rate: 0.875, avg_score: null }],
    },
  ],
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

  it('gets call analytics with a days window', async () => {
    const result = await client.analytics.getCalls({ days: 14 })
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
    expect(result.summary.total_tool_calls).toBe(200)
    expect(result.summary.total_succeeded).toBe(190)
    expect(result.summary.overall_failure_rate).toBe(0.05)
    expect(result.trend[0]?.total_failed).toBe(3)
    expect(result.groups).toBeNull()
  })

  it('gets data quality', async () => {
    const result = await client.analytics.getDataQuality()
    expect(result.confidence_distribution).toHaveLength(1)
    expect(result.total_events).toBe(100)
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
    expect(result.summary.total_calls).toBe(150)
    expect(result.summary.escalated).toBe(12)
    expect(result.summary.p95_duration_seconds).toBe(540)
    expect(result.trend[0]?.calls).toBe(20)
    expect(result.by_service.map((row) => row.service_id)).toEqual([SERVICE_A, SERVICE_B])
    expect(result.by_direction.inbound?.calls).toBe(120)
    expect(result.groups).toBeNull()
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

function capturingClient(body: unknown = {}) {
  const captured: { url?: string } = {}
  const client = new AmigoClient({
    apiKey: TEST_API_KEY,
    workspaceId: TEST_WORKSPACE_ID,
    fetch: async (input: string | URL | Request): Promise<Response> => {
      captured.url = input instanceof Request ? input.url : input.toString()
      return Response.json(body)
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
      service_id: SERVICE_A,
    })
    const url = new URL(captured.url!)
    expect(url.pathname).toBe(`/v1/${TEST_WORKSPACE_ID}/analytics/eval-quality`)
    expect(url.searchParams.get('days')).toBe('14')
    expect(url.searchParams.get('interval')).toBe('1w')
    expect(url.searchParams.get('service_id')).toBe(SERVICE_A)
  })

  it('forwards group_by and reads each service group', async () => {
    const { client, captured } = capturingClient(GROUPED_EVAL_QUALITY_FIXTURE)
    const result = await client.analytics.getEvalQuality({ days: 30, group_by: 'service_id' })
    const query = new URL(captured.url!).searchParams
    expect(query.get('group_by')).toBe('service_id')
    expect(query.get('days')).toBe('30')
    expect(result.groups?.map((group) => group.service_id)).toEqual([SERVICE_A])
    expect(result.groups?.[0]?.by_eval_key[0]?.eval_key).toBe('resolved_on_first_call')
    expect(result.groups?.[0]?.trend[0]?.pass_rate).toBe(0.875)
  })
})

describe('AnalyticsResource advanced call stats param forwarding', () => {
  it('forwards the date range, interval, service and direction', async () => {
    const { client, captured } = capturingClient(ADVANCED_CALL_STATS_FIXTURE)
    await client.analytics.getAdvancedCallStats({
      date_from: '2026-01-01',
      date_to: '2026-01-07',
      interval: '1h',
      service_id: SERVICE_A,
      direction: 'outbound',
    })
    const url = new URL(captured.url!)
    expect(url.pathname).toBe(`/v1/${TEST_WORKSPACE_ID}/analytics/calls/advanced`)
    expect(url.searchParams.get('date_from')).toBe('2026-01-01')
    expect(url.searchParams.get('date_to')).toBe('2026-01-07')
    expect(url.searchParams.get('interval')).toBe('1h')
    expect(url.searchParams.get('service_id')).toBe(SERVICE_A)
    expect(url.searchParams.get('direction')).toBe('outbound')
    expect(url.searchParams.has('group_by')).toBe(false)
  })

  it('forwards group_by and reads each service group', async () => {
    const { client, captured } = capturingClient(GROUPED_ADVANCED_CALL_STATS_FIXTURE)
    const result = await client.analytics.getAdvancedCallStats({
      days: 30,
      group_by: 'service_id',
    })
    const query = new URL(captured.url!).searchParams
    expect(query.get('group_by')).toBe('service_id')
    expect(query.get('days')).toBe('30')
    expect(result.groups?.map((group) => group.service_id)).toEqual([SERVICE_A, SERVICE_B])
    expect(result.groups?.[0]?.summary.total_calls).toBe(90)
    expect(result.groups?.[1]?.trend[0]?.calls).toBe(8)
    expect(result.summary.total_calls).toBe(150)
  })
})

describe('AnalyticsResource tool performance param forwarding', () => {
  it('forwards the date range, interval and service', async () => {
    const { client, captured } = capturingClient(TOOL_PERFORMANCE_FIXTURE)
    await client.analytics.getToolPerformance({
      date_from: '2026-01-01',
      date_to: '2026-01-31',
      interval: '1w',
      service_id: SERVICE_B,
    })
    const url = new URL(captured.url!)
    expect(url.pathname).toBe(`/v1/${TEST_WORKSPACE_ID}/analytics/tool-performance`)
    expect(url.searchParams.get('date_from')).toBe('2026-01-01')
    expect(url.searchParams.get('date_to')).toBe('2026-01-31')
    expect(url.searchParams.get('interval')).toBe('1w')
    expect(url.searchParams.get('service_id')).toBe(SERVICE_B)
    expect(url.searchParams.has('group_by')).toBe(false)
  })

  it('forwards group_by and reads each service group', async () => {
    const { client, captured } = capturingClient(GROUPED_TOOL_PERFORMANCE_FIXTURE)
    const result = await client.analytics.getToolPerformance({
      days: 7,
      group_by: 'service_id',
    })
    const query = new URL(captured.url!).searchParams
    expect(query.get('group_by')).toBe('service_id')
    expect(query.get('days')).toBe('7')
    expect(result.groups?.map((group) => group.service_id)).toEqual([SERVICE_A, SERVICE_B])
    expect(result.groups?.[0]?.summary.total_failed).toBe(8)
    expect(result.groups?.[1]?.trend[0]?.total_tool_calls).toBe(24)
  })
})

describe('AnalyticsResource agent analytics param forwarding', () => {
  it('forwards the window and the period label', async () => {
    const { client, captured } = capturingClient(AGENTS_FIXTURE)
    await client.analytics.getAgents({
      days: 14,
      date_from: '2026-01-01',
      date_to: '2026-01-14',
      period: 'first half of January',
    })
    const url = new URL(captured.url!)
    expect(url.pathname).toBe(`/v1/${TEST_WORKSPACE_ID}/analytics/agents`)
    expect(url.searchParams.get('days')).toBe('14')
    expect(url.searchParams.get('date_from')).toBe('2026-01-01')
    expect(url.searchParams.get('date_to')).toBe('2026-01-14')
    expect(url.searchParams.get('period')).toBe('first half of January')
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
