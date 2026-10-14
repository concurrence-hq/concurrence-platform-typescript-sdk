import { describe, it, expect, beforeAll } from 'vitest'
import { AmigoClient } from '../../src/index.js'

const API_KEY = process.env.AMIGO_TEST_API_KEY
const WORKSPACE_ID = process.env.AMIGO_TEST_WORKSPACE_ID
const BASE_URL = process.env.AMIGO_TEST_BASE_URL ?? 'https://platform.api-staging.concurrence.com'

describe.skipIf(!API_KEY || !WORKSPACE_ID)('Integration: smoke', () => {
  // Lazy init — AmigoClient constructor throws without valid credentials,
  // so we must not construct it when the suite is skipped.
  let client: AmigoClient

  beforeAll(() => {
    client = new AmigoClient({
      apiKey: API_KEY!,
      workspaceId: WORKSPACE_ID!,
      baseUrl: BASE_URL,
    })
  })

  it('lists agents', async () => {
    const result = await client.agents.list()
    expect(result.items).toBeDefined()
    expect(Array.isArray(result.items)).toBe(true)
  })

  it('lists actions', async () => {
    const result = await client.actions.list()
    expect(result.items).toBeDefined()
    expect(Array.isArray(result.items)).toBe(true)
  })

  it('lists services', async () => {
    const result = await client.services.list()
    expect(result.items).toBeDefined()
    expect(Array.isArray(result.items)).toBe(true)
  })
})
