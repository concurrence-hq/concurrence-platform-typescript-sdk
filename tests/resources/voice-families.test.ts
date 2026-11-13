import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}`

describe('VoiceFamiliesResource', () => {
  it('lists the voice families', async () => {
    const families = { families: [] }
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: mockFetch({ [`GET ${BASE}/voice-families`]: () => Response.json(families) }),
    })

    expect(await client.voiceFamilies.list()).toEqual(families)
  })

  it('pages the voices of one family with its filters', async () => {
    const urls: string[] = []
    const page = { voices: [], next_cursor: null }
    const routes = mockFetch({
      [`GET ${BASE}/voice-families/eleven_realtime/voices`]: () => Response.json(page),
    })
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: (input, init) => {
        urls.push(input instanceof Request ? input.url : String(input))
        return routes(input, init)
      },
    })

    const result = await client.voiceFamilies.listVoices('eleven_realtime', {
      search: 'warm',
      language: 'es',
      limit: 10,
      cursor: 'abc',
    })

    expect(result).toEqual(page)
    const query = new URL(urls[0] ?? '').searchParams
    expect(Object.fromEntries(query)).toEqual({
      search: 'warm',
      language: 'es',
      limit: '10',
      cursor: 'abc',
    })
  })
})
