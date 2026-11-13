import { describe, it, expect } from 'vitest'
import { AmigoClient, type ClientConfig } from '../../src/index.js'

const TEST_API_KEY = 'test-api-key'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'

describe('ClientConfigResource', () => {
  it('gets the browser-safe client config', async () => {
    const config = { google_maps_api_key: 'maps-key' } satisfies ClientConfig
    const requests: Request[] = []
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init)
        requests.push(request)
        return Response.json(config)
      },
    })

    const result = await client.clientConfig.get()

    expect(requests[0]?.method).toBe('GET')
    expect(new URL(requests[0]!.url).pathname).toBe(`/v1/${TEST_WORKSPACE_ID}/config/client`)
    expect(result.google_maps_api_key).toBe('maps-key')
  })
})
