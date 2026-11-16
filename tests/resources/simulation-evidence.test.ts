import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import type { components } from '../../src/index.js'

const digest = `sha256:${'a'.repeat(64)}`
const evidence = {
  service_config_digest: digest,
  harness: {
    kind: 'text',
    harness: 'openai',
    release: 'openai-v1.2.0',
    source: 'pin',
    sha256: 'b'.repeat(64),
  },
  receipts: [{ service_config_digest: digest, release: 'openai-v1.2.0' }],
} satisfies components['schemas']['SimulationHarnessExecution']

function recordingClient(responseBody: unknown) {
  const requests: { path: string; body: unknown }[] = []
  const client = new AmigoClient({
    apiKey: 'synthetic-api-key',
    workspaceId: '00000000-0000-0000-0000-000000000001',
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      requests.push({ path: new URL(request.url).pathname, body: await request.json() })
      return Response.json(responseBody)
    },
  })
  return { client, requests }
}

describe('simulation candidate identity over HTTP', () => {
  it('carries the exact digest in interactive and run session requests', async () => {
    const { client, requests } = recordingClient({
      session_id: 'synthetic-session',
      harness_execution: evidence,
    })
    const candidate = {
      service_id: '00000000-0000-0000-0000-000000000002',
      expected_service_config_digest: digest,
    }
    const interactive = await client.simulations.createSession(candidate)
    const run = await client.simulations.runs.createSession('synthetic-run', candidate)
    expect(requests.map((request) => request.body)).toEqual([candidate, candidate])
    expect(requests[0]?.path).toMatch(/\/simulations\/sessions$/)
    expect(requests[1]?.path).toMatch(/\/simulations\/runs\/synthetic-run\/sessions$/)
    expect(interactive.harness_execution).toEqual(evidence)
    expect(run.harness_execution?.service_config_digest).toBe(digest)
    expect(run.harness_execution?.harness?.source).toBe('pin')
  })

  it('returns the actual evidence on both step routes and each fork branch', async () => {
    const { client } = recordingClient({
      harness_execution: evidence,
      branches: [
        { session_id: 'successful-branch', harness_execution: evidence },
        {
          session_id: 'failed-branch',
          error: 'simulation_config_mismatch',
          harness_execution: null,
        },
      ],
    })
    const step = await client.simulations.step({ session_id: 'session', caller_text: 'hello' })
    const storedStep = await client.simulations.stepSession('session', { caller_text: 'hello' })
    const fork = await client.simulations.forkSession('session', {
      alternatives: [{ caller_text: 'hello' }],
    })
    expect(step.harness_execution?.receipts).toEqual(evidence.receipts)
    expect(storedStep.harness_execution).toEqual(evidence)
    expect(fork.branches[0]?.harness_execution).toEqual(evidence)
    expect(fork.branches[1]?.harness_execution).toBeNull()
    expect(fork.branches[1]?.error).toBe('simulation_config_mismatch')
  })

  it.each([null, undefined])(
    'does not synthesize missing execution evidence (%s)',
    async (value) => {
      const { client } = recordingClient({ session_id: 'legacy-session', harness_execution: value })
      const result = await client.simulations.createSession({
        service_id: '00000000-0000-0000-0000-000000000002',
      })
      expect(result.harness_execution).toBe(value)
    },
  )
})
