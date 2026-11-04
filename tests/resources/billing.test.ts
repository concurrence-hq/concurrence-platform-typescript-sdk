import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

describe('BillingResource', () => {
  it('getCost calls GET /cost', async () => {
    const { client, requests } = recordRoutes(200)
    await client.billing.getCost({ start_date: '2026-01-01', end_date: '2026-01-01' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/cost`)
    expect(requests[0]?.search).toContain('start_date=2026-01-01')
    expect(requests[0]?.search).toContain('end_date=2026-01-01')
  })

  it('getUsage calls GET /usage', async () => {
    const { client, requests } = recordRoutes(200)
    await client.billing.getUsage({ start_date: '2026-01-01', end_date: '2026-01-01' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/usage`)
    expect(requests[0]?.search).toContain('start_date=2026-01-01')
    expect(requests[0]?.search).toContain('end_date=2026-01-01')
  })

  it('getUsageCostExcluded calls GET /usage-cost/excluded', async () => {
    const { client, requests } = recordRoutes(200)
    await client.billing.getUsageCostExcluded({
      start_date: '2026-01-01',
      end_date: '2026-01-01',
    } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/usage-cost/excluded`)
    expect(requests[0]?.search).toContain('start_date=2026-01-01')
    expect(requests[0]?.search).toContain('end_date=2026-01-01')
  })

  it('getUsageCostModels calls GET /usage-cost/models', async () => {
    const { client, requests } = recordRoutes(200)
    await client.billing.getUsageCostModels({
      start_date: '2026-01-01',
      end_date: '2026-01-01',
    } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/usage-cost/models`)
    expect(requests[0]?.search).toContain('start_date=2026-01-01')
    expect(requests[0]?.search).toContain('end_date=2026-01-01')
  })

  it('getUsageCostOverview calls GET /usage-cost/overview', async () => {
    const { client, requests } = recordRoutes(200)
    await client.billing.getUsageCostOverview({
      start_date: '2026-01-01',
      end_date: '2026-01-01',
    } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/usage-cost/overview`)
    expect(requests[0]?.search).toContain('start_date=2026-01-01')
    expect(requests[0]?.search).toContain('end_date=2026-01-01')
  })
})
