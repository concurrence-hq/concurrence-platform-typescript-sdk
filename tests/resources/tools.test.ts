import { describe, it, expect } from 'vitest'
import { AmigoClient, ServiceUnavailableError } from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

const TEST_API_KEY = 'test-api-key'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const SERVICE_ID = 'svc-001'
const BASE = `/v1/${TEST_WORKSPACE_ID}`

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`POST ${BASE}/tools/execute`]: () => Response.json({ ok: true, output: {} }),
    [`GET ${BASE}/services/${SERVICE_ID}/tools/resolve`]: () => Response.json({ tools: [] }),
    [`GET ${BASE}/tools/catalog`]: () =>
      Response.json({
        tools: [
          {
            tool_name: 'world_persons_lookup',
            tool_type: 'world_tool',
            tier: 'core',
            is_write: false,
            input_schema: { type: 'object', properties: { name: { type: 'string' } } },
          },
        ],
      }),
  }),
})

describe('ToolsResource', () => {
  it('executes a tool', async () => {
    const result = await client.tools.execute({} as Parameters<typeof client.tools.execute>[0])
    expect(result).toMatchObject({ ok: true })
  })

  it('resolves bindings for a service', async () => {
    expect(await client.tools.resolveForService(SERVICE_ID)).toMatchObject({ tools: [] })
  })

  it('lists the built-in tool catalog', async () => {
    const catalog = await client.tools.listCatalog()

    expect(catalog.tools.map((tool) => tool.tool_name)).toEqual(['world_persons_lookup'])
    expect(catalog.tools[0]?.is_write).toBe(false)
  })

  it('throws ServiceUnavailableError when the agent engine is unreachable', async () => {
    const unavailable = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      maxRetries: 0,
      fetch: mockFetch({
        [`GET ${BASE}/tools/catalog`]: () =>
          Response.json({ detail: 'Voice agent error: timeout' }, { status: 503 }),
      }),
    })

    await expect(unavailable.tools.listCatalog()).rejects.toBeInstanceOf(ServiceUnavailableError)
  })
})
