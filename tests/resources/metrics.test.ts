import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AmigoClient,
  type BooleanMetricValue,
  type CategoricalMetricValue,
  type MetricCatalogResponse,
  type MetricListResponse,
  type MetricValue,
  type MetricValueListResponse,
  type MetricValueResponse,
  type NumericalMetricValue,
} from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}`
const SERVICE_ID = '00000000-0000-0000-0000-0000000000a1'
const RUN_ID = '00000000-0000-0000-0000-0000000000b1'

const NUMERICAL_METRIC_VALUE = {
  metric_key: 'voice_quality_score',
  metric_type: 'numerical',
  period_start: '2026-04-25T00:00:00Z',
  period_end: '2026-04-26T00:00:00Z',
  value: 0.87,
  event_count: 12,
  avg_confidence: 0.91,
  unit: 'score',
  computed_at: '2026-04-26T12:00:00Z',
  source: 'production',
} satisfies NumericalMetricValue

const CATEGORICAL_METRIC_VALUE = {
  metric_key: 'dominant_sentiment',
  metric_type: 'categorical',
  period_start: '2026-04-25T00:00:00Z',
  period_end: '2026-04-26T00:00:00Z',
  value: 'positive',
  distribution: [
    { value: 'positive', count: 8 },
    { value: 'neutral', count: 4 },
  ],
  event_count: 12,
  avg_confidence: null,
  unit: null,
  computed_at: null,
  source: 'production',
} satisfies CategoricalMetricValue

const BOOLEAN_METRIC_VALUE = {
  metric_key: 'call_resolved',
  metric_type: 'boolean',
  period_start: '2026-04-25T00:00:00Z',
  period_end: '2026-04-26T00:00:00Z',
  value: true,
  event_count: 12,
  avg_confidence: null,
  unit: null,
  computed_at: null,
  source: 'production',
} satisfies BooleanMetricValue

const METRIC_LIST_FIXTURE: MetricValueListResponse = {
  metrics: [NUMERICAL_METRIC_VALUE, CATEGORICAL_METRIC_VALUE, BOOLEAN_METRIC_VALUE],
  has_more: true,
  continuation_token: 3,
}

const METRIC_CATALOG_FIXTURE: MetricCatalogResponse = {
  metrics: [
    {
      key: 'voice_quality_score',
      name: 'Voice quality score',
      description: 'Overall voice quality score.',
      metric_type: 'numerical',
      extraction_mode: 'static',
      granularity: 'aggregate',
      model_tier: 'free',
      unit: 'score',
      has_prompt: false,
      builtin: true,
      source: 'call_intelligence',
    },
  ],
}

const METRIC_HISTORY_VALUE = {
  metric_key: 'voice_quality_score',
  metric_type: 'numerical',
  period_start: '2026-04-24T00:00:00Z',
  period_end: '2026-04-25T00:00:00Z',
  value: 0.91,
  event_count: 30,
  avg_confidence: 0.94,
  unit: 'score',
  computed_at: '2026-04-25T12:00:00Z',
  source: 'production',
} satisfies NumericalMetricValue

const METRIC_VALUES_FIXTURE: MetricListResponse = {
  metrics: [METRIC_HISTORY_VALUE],
}

const METRIC_TREND_VALUE = {
  metric_key: 'voice_quality_score',
  metric_type: 'numerical',
  period_start: '2026-04-12T00:00:00Z',
  period_end: '2026-04-13T00:00:00Z',
  value: 0.77,
  event_count: 14,
  avg_confidence: 0.88,
  unit: 'score',
  computed_at: '2026-04-13T12:00:00Z',
  source: 'production',
} satisfies NumericalMetricValue

const METRIC_TREND_FIXTURE: MetricListResponse = {
  metrics: [METRIC_TREND_VALUE],
}

const METRIC_VARIANT_FIXTURES = {
  numerical: NUMERICAL_METRIC_VALUE,
  categorical: CATEGORICAL_METRIC_VALUE,
  boolean: BOOLEAN_METRIC_VALUE,
} satisfies {
  numerical: NumericalMetricValue
  categorical: CategoricalMetricValue
  boolean: BooleanMetricValue
}

function asMetricValue(value: MetricValue): MetricValue {
  return value
}

type RouteHandler = (request: Request) => Response | Promise<Response>

function mockFetch(routes: Record<string, RouteHandler>): typeof globalThis.fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let request: Request
    if (input instanceof Request) {
      request = input
    } else {
      request = new Request(input, init)
    }
    const { pathname } = new URL(request.url)
    const method = request.method.toUpperCase()
    for (const [pattern, handler] of Object.entries(routes)) {
      const [pMethod, ...pPathParts] = pattern.split(' ')
      if (pMethod === method && pPathParts.join(' ') === pathname) return handler(request)
    }
    return new Response(JSON.stringify({ detail: `No mock for ${method} ${pathname}` }), {
      status: 500,
    })
  }
}

const listHandler = vi.fn((_request: Request) => Response.json(METRIC_LIST_FIXTURE))

const getValuesHandler = vi.fn((_request: Request) => Response.json(METRIC_VALUES_FIXTURE))

const getTrendHandler = vi.fn((_request: Request) => Response.json(METRIC_TREND_FIXTURE))

function expectExhaustiveMetricValue(value: MetricValue): string | number | boolean | null {
  switch (value.metric_type) {
    case 'numerical':
      return value.value
    case 'categorical':
      return value.value
    case 'boolean':
      return value.value
    default: {
      const exhaustive: never = value
      throw new Error(`Unhandled metric value variant: ${JSON.stringify(exhaustive)}`)
    }
  }
}

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/metrics`]: listHandler,
    [`GET ${BASE}/metrics/catalog`]: () => Response.json(METRIC_CATALOG_FIXTURE),
    [`GET ${BASE}/metrics/voice_quality_score`]: getValuesHandler,
    [`GET ${BASE}/metrics/voice_quality_score/trend`]: getTrendHandler,
  }),
})

describe('MetricsResource', () => {
  beforeEach(() => {
    listHandler.mockClear()
    getValuesHandler.mockClear()
    getTrendHandler.mockClear()
  })

  it('lists the latest typed metric values', async () => {
    const result = await client.metrics.listLatest()
    const first = result.metrics[0]
    const request = listHandler.mock.calls[0]?.[0]
    if (!request) throw new Error('Expected listLatest request to be captured')

    expect([...new URL(request.url).searchParams.keys()]).toEqual([])
    expect(result.metrics).toHaveLength(3)
    expect(result.has_more).toBe(true)
    expect(result.continuation_token).toBe(3)
    expect(first?.metric_type).toBe('numerical')
    if (first?.metric_type === 'numerical') {
      const value: number | null = first.value
      expect(value).toBe(0.87)
    }
    const categorical = result.metrics[1]
    if (categorical?.metric_type !== 'categorical') {
      throw new Error(`Expected categorical metric value, received ${categorical?.metric_type}`)
    }
    expect(categorical.distribution).toEqual([
      { value: 'positive', count: 8 },
      { value: 'neutral', count: 4 },
    ])
  })

  it('forwards list filters, sort order and the continuation token', async () => {
    await client.metrics.listLatest({
      source: 'all',
      scope: 'entity',
      entity_type: 'call',
      entity_id: 'call-001',
      service_id: SERVICE_ID,
      run_id: RUN_ID,
      session_id: 'session-001',
      date_from: '2026-10-01T00:00:00Z',
      date_to: '2026-10-11T00:00:00Z',
      latest_only: false,
      limit: 200,
      sort_by: ['+metric_key', '-period_start'],
      continuation_token: 200,
    })
    const request = listHandler.mock.calls[0]?.[0]

    expect(listHandler).toHaveBeenCalledTimes(1)
    if (!request) throw new Error('Expected listLatest request to be captured')

    const searchParams = new URL(request.url).searchParams
    expect(searchParams.get('source')).toBe('all')
    expect(searchParams.get('scope')).toBe('entity')
    expect(searchParams.get('entity_type')).toBe('call')
    expect(searchParams.get('entity_id')).toBe('call-001')
    expect(searchParams.get('service_id')).toBe(SERVICE_ID)
    expect(searchParams.get('run_id')).toBe(RUN_ID)
    expect(searchParams.get('session_id')).toBe('session-001')
    expect(searchParams.get('date_from')).toBe('2026-10-01T00:00:00Z')
    expect(searchParams.get('date_to')).toBe('2026-10-11T00:00:00Z')
    expect(searchParams.get('latest_only')).toBe('false')
    expect(searchParams.get('limit')).toBe('200')
    expect(searchParams.getAll('sort_by')).toEqual(['+metric_key', '-period_start'])
    expect(searchParams.get('continuation_token')).toBe('200')
  })

  it('returns catalog entries', async () => {
    const result = await client.metrics.getCatalog()

    expect(result.metrics[0]?.key).toBe('voice_quality_score')
    expect(result.metrics[0]?.metric_type).toBe('numerical')
  })

  it('gets values for one metric', async () => {
    const result = await client.metrics.getValues('voice_quality_score', {
      date_from: '2026-04-01T00:00:00Z',
      date_to: '2026-04-26T00:00:00Z',
      limit: 30,
    })
    const request = getValuesHandler.mock.calls[0]?.[0]

    expect(getValuesHandler).toHaveBeenCalledTimes(1)
    expect(request).toBeDefined()
    if (!request) throw new Error('Expected getValues request to be captured')

    const searchParams = new URL(request.url).searchParams
    expect(searchParams.get('date_from')).toBe('2026-04-01T00:00:00Z')
    expect(searchParams.get('date_to')).toBe('2026-04-26T00:00:00Z')
    expect(searchParams.get('limit')).toBe('30')
    expect([...searchParams.keys()].sort()).toEqual(['date_from', 'date_to', 'limit'])
    expect(result.metrics).toHaveLength(1)
    const metric = result.metrics[0]!
    expect(metric.metric_key).toBe('voice_quality_score')
    expect(metric.event_count).toBe(30)
    expect(metric.metric_type).toBe('numerical')
    if (metric.metric_type === 'numerical') {
      const value: number | null = metric.value
      expect(value).toBe(0.91)
    }
  })

  it('gets a metric trend', async () => {
    const result = await client.metrics.getTrend('voice_quality_score', { days: 14 })
    const request = getTrendHandler.mock.calls[0]?.[0]

    expect(getTrendHandler).toHaveBeenCalledTimes(1)
    expect(request).toBeDefined()
    if (!request) throw new Error('Expected getTrend request to be captured')

    const searchParams = new URL(request.url).searchParams
    expect(searchParams.get('days')).toBe('14')
    expect([...searchParams.keys()]).toEqual(['days'])
    expect(result.metrics).toHaveLength(1)
    const metric = result.metrics[0]!
    expect(metric.metric_key).toBe('voice_quality_score')
    expect(metric.period_start).toBe('2026-04-12T00:00:00Z')
    expect(metric.value).toBe(0.77)
  })

  it('exposes a discriminated MetricValue type', () => {
    const value = asMetricValue(METRIC_VARIANT_FIXTURES.boolean)

    expect(value.metric_type).toBe('boolean')
    if (value.metric_type === 'boolean') {
      const resolved: boolean | null = value.value
      expect(resolved).toBe(true)
    } else {
      throw new Error(`Expected boolean metric value, received ${value.metric_type}`)
    }
  })

  it('keeps the previous MetricValueResponse export as a compatibility alias', () => {
    const value: MetricValueResponse = METRIC_VARIANT_FIXTURES.numerical

    expect(value.metric_type).toBe('numerical')
    expect(value.value).toBe(0.87)
    expect(value.unit).toBe('score')
  })

  it('exhaustively handles generated MetricValue variants', () => {
    expect(METRIC_LIST_FIXTURE.metrics.map(expectExhaustiveMetricValue)).toEqual([
      0.87,
      'positive',
      true,
    ])
  })
})
