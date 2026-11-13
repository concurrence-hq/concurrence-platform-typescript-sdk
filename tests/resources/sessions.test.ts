import { describe, it, expect } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

const TEST_API_KEY = 'test-api-key'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const CALL_SID = 'CA1234567890abcdef1234567890abcdef'
const BASE = `/v1/${TEST_WORKSPACE_ID}`

const FLEET_STATUS_FIXTURE = {
  fleet: 'agent-voice',
  namespace: 'agent-voice',
  ready: 3,
  allocated: 5,
  total: 8,
  max_replicas: 32,
  headroom: 27,
  by_state: { Ready: 3, Allocated: 5 },
}

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/sessions/active`]: () => Response.json({ sessions: [] }),
    [`GET ${BASE}/sessions/fleet-status`]: () => Response.json(FLEET_STATUS_FIXTURE),
    [`POST ${BASE}/sessions/${CALL_SID}/inject`]: () =>
      Response.json({ status: 'queued', injection_id: 'inj-1' }),
  }),
})

describe('SessionsResource', () => {
  it('lists active sessions', async () => {
    expect(await client.sessions.listActive()).toMatchObject({ sessions: [] })
  })

  it('gets fleet status', async () => {
    expect(await client.sessions.getFleetStatus()).toMatchObject({
      fleet: 'agent-voice',
      allocated: 5,
      headroom: 27,
    })
  })

  it('injects into a live call', async () => {
    const result = await client.sessions.inject(
      CALL_SID,
      {} as Parameters<typeof client.sessions.inject>[1],
    )
    expect(result).toMatchObject({ status: 'queued' })
  })
})

describe('SessionsResource.getFleetStatus fleet param', () => {
  const requestUrls: string[] = []
  const capturingFetch: typeof globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    requestUrls.push(request.url)
    return Response.json(FLEET_STATUS_FIXTURE)
  }
  const fleetClient = new AmigoClient({
    apiKey: TEST_API_KEY,
    workspaceId: TEST_WORKSPACE_ID,
    fetch: capturingFetch,
  })

  it('omits the fleet query param by default (server defaults to voice)', async () => {
    await fleetClient.sessions.getFleetStatus()
    const url = new URL(requestUrls.at(-1)!)
    expect(url.pathname).toBe(`${BASE}/sessions/fleet-status`)
    expect(url.searchParams.has('fleet')).toBe(false)
  })

  it('rejects an unsupported selector instead of mislabeling voice capacity', async () => {
    const before = requestUrls.length
    // @ts-expect-error The live endpoint has no fleet selector.
    await expect(fleetClient.sessions.getFleetStatus({ fleet: 'tool-runner' })).rejects.toThrow(
      'does not accept fleet options',
    )
    expect(requestUrls).toHaveLength(before)
  })
})
