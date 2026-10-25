import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'

const workspace = '635fd22d-35b1-4ea9-9118-8eda13b4b753'
const connection = 'a265c823-0016-4d15-b708-27b5c28d896b'
const revision = '919a5b49-8cc2-4e8a-bd1e-cf6fb81406cd'
const observedAt = '2026-10-25T18:45:11.123456Z'
const validUntil = '2026-10-25T18:49:11.123456Z'
const status = {
  workspace_id: workspace,
  connection_id: connection,
  connection_revision: revision,
  connection_enabled: true,
  configuration: {
    id: workspace,
    revision,
    connection_revision: revision,
    provider: 'okta',
    login_app_id: 'login-app',
    client_id: 'reader-client',
    enabled: true,
  },
  items: [
    {
      binding_id: connection,
      entity_id: workspace,
      state: 'active',
      reason: 'active',
      authority: {
        generation_id: revision,
        generation_number: 3,
        observed_at: observedAt,
        valid_until: validUntil,
      },
    },
    {
      binding_id: revision,
      entity_id: workspace,
      state: 'unavailable',
      reason: 'evidence_expired_or_invalid',
      authority: null,
    },
  ],
  has_more: true,
  continuation_token: '40',
}

function setup(response: unknown = status) {
  const requests: Request[] = []
  const client = new AmigoClient({
    workspaceId: workspace,
    apiKey: 'human-token',
    baseUrl: 'https://console.example/api/platform',
    identityBaseUrl: 'https://console.example/api/identity',
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init))
      return Response.json(response)
    },
  })
  return { client, requests }
}

describe('lifecycle authority status', () => {
  it('preserves per-binding authority, nulls and precise timestamps through the Identity BFF', async () => {
    const { client, requests } = setup()
    const result = await client.ssoLifecycle
      .withOptions({ headers: { 'x-trace-id': 'trace' } })
      .getStatus({
        limit: 20,
        continuation_token: '20',
        sort_by: ['+created_at'],
      })
    expect(result).toEqual(status)
    const request = requests[0]!
    const url = new URL(request.url)
    expect(url.origin + url.pathname).toBe(
      `https://console.example/api/identity/admin/workspaces/${workspace}/sso/lifecycle/status`,
    )
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.get('continuation_token')).toBe('20')
    expect(url.searchParams.getAll('sort_by')).toEqual(['+created_at'])
    expect(request.method).toBe('GET')
    expect(request.cache).toBe('no-store')
    expect(request.redirect).toBe('error')
    expect(request.headers.get('authorization')).toBe('Bearer human-token')
    expect(request.headers.get('x-trace-id')).toBe('trace')
    expect(result.items[0]?.authority?.observed_at).toBe(observedAt)
    expect(result.items[1]?.authority).toBeNull()
  })

  it('does not fabricate a configuration or authority for an empty page', async () => {
    const empty = {
      ...status,
      configuration: null,
      items: [],
      has_more: false,
      continuation_token: null,
    }
    const { client } = setup(empty)
    expect(await client.ssoLifecycle.getStatus()).toEqual(empty)
  })

  it.each([0, -1, 9007199254740992])(
    'rejects an invalid or imprecise accepted generation (%s)',
    async (generation) => {
      const { client } = setup({
        ...status,
        items: [
          {
            ...status.items[0],
            authority: { ...status.items[0]?.authority, generation_number: generation },
          },
        ],
      })
      await expect(client.ssoLifecycle.getStatus()).rejects.toThrow('cannot be represented safely')
    },
  )
})
