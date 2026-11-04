import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('M42Resource', () => {
  it('listRankedAnomalies calls GET /m42/anomalies/ranked', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.listRankedAnomalies({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/anomalies/ranked`)
    expect(requests[0]?.search).toContain('limit=5')
  })

  it('getCatalog calls GET /m42/catalog', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.getCatalog()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/catalog`)
  })

  it('listClusterForecast calls GET /m42/clusters/forecast', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.listClusterForecast({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/clusters/forecast`)
    expect(requests[0]?.search).toContain('limit=5')
  })

  it('listClusterSummary calls GET /m42/clusters/summary', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.listClusterSummary({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/clusters/summary`)
    expect(requests[0]?.search).toContain('limit=5')
  })

  it('listForecastFan calls GET /m42/forecast-fan', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.listForecastFan({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/forecast-fan`)
    expect(requests[0]?.search).toContain('limit=5')
  })

  it('listForecastFanDraws calls GET /m42/forecast-fan/draws', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.listForecastFanDraws()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/forecast-fan/draws`)
  })

  it('listModelRegistry calls GET /m42/model-registry', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.listModelRegistry({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/model-registry`)
    expect(requests[0]?.search).toContain('limit=5')
  })

  it('getNotesRollup calls GET /m42/notes/rollup', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.getNotesRollup()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/notes/rollup`)
  })

  it('listPatientTopology calls GET /m42/patient-topology', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.listPatientTopology({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/patient-topology`)
    expect(requests[0]?.search).toContain('limit=5')
  })

  it('listPatientLabs calls GET /m42/patients/{patient_id}/labs', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.listPatientLabs('patient_id-1', { limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/patients/patient_id-1/labs`)
    expect(requests[0]?.search).toContain('limit=5')
  })

  it('getPatientNote calls GET /m42/patients/{patient_id}/note', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.getPatientNote('patient_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/patients/patient_id-1/note`)
  })

  it('listStratifiedFits calls GET /m42/stratified-fits', async () => {
    const { client, requests } = recordRoutes(200)
    await client.m42.listStratifiedFits({ limit: 5 } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/m42/stratified-fits`)
    expect(requests[0]?.search).toContain('limit=5')
  })
})
