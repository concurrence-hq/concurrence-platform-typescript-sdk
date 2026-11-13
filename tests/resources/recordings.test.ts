import { describe, it, expect } from 'vitest'
import { AmigoClient } from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'

const CALL_SID = 'CA1234567890abcdef1234567890abcdef'

const URLS_FIXTURE = {
  call_sid: CALL_SID,
  inbound_url: 'https://recordings.example.com/rec-001-inbound.wav',
  outbound_url: 'https://recordings.example.com/rec-001-outbound.wav',
  stereo_url: 'https://recordings.example.com/rec-001-stereo.wav',
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
    [`GET ${BASE}/recordings/${CALL_SID}`]: () => Response.json(URLS_FIXTURE),
  }),
})

describe('RecordingsResource', () => {
  it('gets presigned recording URLs', async () => {
    const result = await client.recordings.get(CALL_SID)
    expect(result.call_sid).toBe(CALL_SID)
    expect(result.inbound_url).toContain('inbound')
    expect(result.outbound_url).toContain('outbound')
    expect(result.stereo_url).toContain('stereo')
  })
})
