import { describe, expect, expectTypeOf, it } from 'vitest'
import { AmigoClient, type components } from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const key: components['schemas']['ApiKeyResponse'] = {
  id: '00000000-0000-4000-8000-000000000002',
  workspace_id: workspaceId,
  key_id: 'key-existing',
  name: 'Existing integration',
  role: 'member',
  permissions: [],
  expires_at: null,
  last_used_at: null,
  created_by_entity_id: null,
  created_by_credential_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('API key reporting', () => {
  it('preserves absent expiry and missing usage in listed existing keys', async () => {
    const client = new AmigoClient({
      apiKey: 'test-key',
      workspaceId,
      fetch: mockFetch({
        [`GET /v1/${workspaceId}/api-keys`]: () =>
          Response.json({ items: [key], has_more: false, continuation_token: null }),
      }),
    })

    const result = await client.apiKeys.list()
    expect(result.items[0]).toEqual(key)
    expectTypeOf(result.items[0]!.expires_at).toEqualTypeOf<string | null>()
  })

  it('preserves null expiry in authentication info without inventing a deadline', async () => {
    const authInfo: components['schemas']['AuthInfoResponse'] = {
      workspace_id: workspaceId,
      key_id: key.key_id,
      name: key.name,
      expires_at: null,
      expires_in_seconds: null,
    }
    const client = new AmigoClient({
      apiKey: 'test-key',
      workspaceId,
      fetch: mockFetch({ 'GET /v1/auth/me': () => Response.json(authInfo) }),
    })

    const result = await client.apiKeys.me()
    expect(result).toEqual(authInfo)
    expectTypeOf(result.expires_at).toEqualTypeOf<string | null>()
    expectTypeOf(result.expires_in_seconds).toEqualTypeOf<number | null>()
  })

  it('keeps expiry required for newly created and rotated keys', () => {
    expectTypeOf<
      components['schemas']['CreateApiKeyResponse']['expires_at']
    >().toEqualTypeOf<string>()
  })
})
