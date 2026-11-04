import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('MetricStoreResource', () => {
  it('setup calls POST /v1/metric-store/setup', async () => {
    const { client, requests } = recordRoutes(200)
    await client.metricStore.setup()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/metric-store/setup`)
  })

  it('refresh calls POST /v1/metric-store/refresh', async () => {
    const { client, requests } = recordRoutes(200)
    await client.metricStore.refresh()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/metric-store/refresh`)
  })

  it('getRun calls GET /v1/metric-store/runs/{run_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.metricStore.getRun('run_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/metric-store/runs/run_id-1`)
  })
})
