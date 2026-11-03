import { describe, expect, it, vi } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { TEST_API_KEY, TEST_WORKSPACE_ID } from '../test-helpers.js'

const EMPTY_BODY = {} as never

function createClientWithRecorder() {
  const requests: string[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)

    requests.push(`${request.method} ${url.pathname}`)

    return Response.json({
      id: 'test-id',
      items: [],
      has_more: false,
      continuation_token: null,
      ok: true,
    })
  })

  const client = new AmigoClient({
    apiKey: TEST_API_KEY,
    workspaceId: TEST_WORKSPACE_ID,
    fetch: fetchImpl as typeof fetch,
  })

  return { client, requests, fetchImpl }
}

describe('resource surface smoke tests', () => {
  it('covers the untested public resource wrappers end-to-end', async () => {
    const { client, requests, fetchImpl } = createClientWithRecorder()

    await client.me.createWorkspace(EMPTY_BODY)
    await client.workspaces.list({ limit: 5 })
    await client.workspaces.get()
    await client.workspaces.update(EMPTY_BODY)
    await client.workspaces.archive(EMPTY_BODY)

    await client.apiKeys.me()
    await client.apiKeys.create(EMPTY_BODY)
    await client.apiKeys.list({ limit: 5, mine_only: true })
    await client.apiKeys.revoke('key-001')
    await client.apiKeys.rotate('key-001', EMPTY_BODY)

    await client.analytics.getDashboard({ days: 7 })
    await client.analytics.getCalls({ days: 7 })
    await client.analytics.getAgents({ period: '7d' })
    await client.analytics.getCallQuality({ days: 7 })
    await client.analytics.getLatency({ days: 7 })
    await client.analytics.getToolPerformance({ days: 7 })
    await client.analytics.getDataQuality({ days: 7 })
    await client.analytics.getUsage({ days: 7 })
    await client.analytics.getAdvancedCallStats({ days: 7 })
    await client.analytics.compareCallPeriods({
      current_from: '2026-01-01',
      current_to: '2026-01-07',
      previous_from: '2025-12-25',
      previous_to: '2025-12-31',
    })
    await client.metrics.listLatest()
    await client.metrics.getCatalog()
    await client.metrics.getValues('voice_quality_score', { limit: 30 })
    await client.metrics.getTrend('voice_quality_score', { days: 14 })

    await client.contextGraphs.create(EMPTY_BODY)
    await client.contextGraphs.list({ limit: 5 })
    await client.contextGraphs.get('cg-001')
    await client.contextGraphs.update('cg-001', EMPTY_BODY)
    await client.contextGraphs.delete('cg-001')
    await client.contextGraphs.createVersion('cg-001', EMPTY_BODY)
    await client.contextGraphs.listVersions('cg-001', { limit: 5 })
    await client.contextGraphs.getVersion('cg-001', 2)

    await client.dataSources.create(EMPTY_BODY)
    await client.dataSources.list({ limit: 5, status: 'healthy' })
    await client.dataSources.get('ds-001')
    await client.dataSources.update('ds-001', EMPTY_BODY)
    await client.dataSources.delete('ds-001')
    await client.dataSources.getStatus('ds-001')
    await client.dataSources.getSyncHistory('ds-001')

    await client.recordings.get('call-001')

    await client.audit.list({ limit: 5 })
    await client.audit.getSummary({ date_from: '2026-01-01', date_to: '2026-01-31' })
    await client.audit.getPhiAccess({ limit: 5 })
    await client.audit.createExport(EMPTY_BODY)
    await client.audit.getExport('statement-001')
    await client.audit.getEntityAccessLog('entity-001', { limit: 5 })
    await client.audit.listMyAuditEvents({ limit: 5 })
    await client.audit.listPlatformAuditEvents({ limit: 5 })

    await client.compliance.getDashboard()
    await client.compliance.getHipaa({ report_period_days: 30 })
    await client.compliance.getAccessReview()

    await client.simulations.createSession(EMPTY_BODY)
    await client.simulations.getSession('sim-001')
    await client.simulations.deleteSession('sim-001')
    await client.simulations.step(EMPTY_BODY)
    await client.simulations.recommend(EMPTY_BODY)
    await client.simulations.getIntelligence('sim-001')

    await client.skills.create(EMPTY_BODY)
    await client.skills.list({ limit: 5, search: 'lookup' })
    await client.skills.get('skill-001')
    await client.skills.update('skill-001', EMPTY_BODY)
    await client.skills.delete('skill-001')
    await client.skills.test('skill-001', EMPTY_BODY)

    await client.functions.list()
    await client.functions.get('lookup_patient')
    await client.functions.deploy('lookup_patient', EMPTY_BODY)
    await client.functions.delete('lookup_patient')
    await client.functions.invoke('lookup_patient', EMPTY_BODY)
    await client.functions.test('lookup_patient', EMPTY_BODY)

    await client.world.listEntities({ limit: 5, q: 'Jane' })
    await client.world.getEntity('entity-001')
    await client.world.getRelationships('entity-001')
    await client.world.getGraph('entity-001')
    await client.world.getProvenance('entity-001')
    await client.world.getLineage('entity-001')
    await client.world.getMerged('entity-001')
    await client.world.listEntityTypes()
    await client.world.listDuplicates({ entity_type: 'patient' })
    await client.world.search({ q: 'Jane Doe', entity_type: 'patient', limit: 5 })
    await client.world.getTimeline('entity-001', { limit: 5 })
    await client.world.getStats()
    await client.world.getSourceBreakdown()

    await client.workspaceDataQueries.list()
    await client.workspaceDataQueries.create(EMPTY_BODY)
    await client.workspaceDataQueries.get('query-001')
    await client.workspaceDataQueries.update('query-001', EMPTY_BODY)
    await client.workspaceDataQueries.invoke('query-001')
    await client.workspaceDataQueries.delete('query-001')

    await client.surfaces.list({ limit: 5 })
    await client.surfaces.listForReview({ limit: 5 })
    await client.surfaces.create(EMPTY_BODY)
    await client.surfaces.get('surface-001')
    await client.surfaces.update('surface-001', EMPTY_BODY)
    await client.surfaces.deliver('surface-001', EMPTY_BODY)
    await client.surfaces.getProgress('surface-001')
    await client.surfaces.approve('surface-001')
    await client.surfaces.reject('surface-001', EMPTY_BODY)
    await client.surfaces.reshape('surface-001')
    await client.surfaces.archive('surface-001')

    await client.analytics.surfaces.getCompletionRates({ days: 7 })
    await client.analytics.surfaces.getChannelEffectiveness({ days: 7 })
    await client.analytics.surfaces.getFieldAbandonment({ days: 7 })
    await client.analytics.surfaces.getForEntity('entity-001')

    expect(fetchImpl).toHaveBeenCalled()
    expect(requests).toEqual(
      expect.arrayContaining([
        'GET /v1/auth/me',
        `GET /v1/${TEST_WORKSPACE_ID}/analytics/calls/comparison`,
        `POST /v1/${TEST_WORKSPACE_ID}/data_queries/query-001/invoke`,
        `GET /v1/${TEST_WORKSPACE_ID}/world/entities/entity-001/graph`,
        `POST /v1/workspaces/${TEST_WORKSPACE_ID}/archive`,
        `GET /v1/${TEST_WORKSPACE_ID}/surfaces`,
        `POST /v1/${TEST_WORKSPACE_ID}/surfaces/surface-001/reshape`,
        `GET /v1/${TEST_WORKSPACE_ID}/surfaces/surface-001/progress`,
        `GET /v1/${TEST_WORKSPACE_ID}/analytics/surfaces/completion-rates`,
      ]),
    )
  })
})
