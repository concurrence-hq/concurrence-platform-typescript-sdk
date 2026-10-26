import { describe, expect, expectTypeOf, it } from 'vitest'
import { AmigoClient, type CreateIdentityHumanCredential } from '../../src/index.js'

const workspace = '635fd22d-35b1-4ea9-9118-8eda13b4b753'
const entity = '919a5b49-8cc2-4e8a-bd1e-cf6fb81406cd'
const id = 'a265c823-0016-4d15-b708-27b5c28d896b'
const expiresAt = '2026-11-25T16:10:11.123456+00:00'
const credential = {
  id,
  workspace_id: workspace,
  entity_id: entity,
  credential_type: 'api_key',
  key_id: 'key-id',
  sso_provider: null,
  role: null,
  name: 'Automation',
  scopes: ['identity:admin'],
  is_active: true,
  rate_tier: 'standard',
  expires_at: expiresAt,
  last_used_at: null,
  created_at: null,
}

function setup(response: unknown = credential, status = 200) {
  const requests: Request[] = []
  const client = new AmigoClient({
    apiKey: 'admin-token',
    workspaceId: workspace,
    baseUrl: 'https://console.example/api/platform',
    identityBaseUrl: 'https://console.example/api/identity',
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init))
      return status === 204
        ? new Response(null, { status })
        : Response.json(response, { status, headers: { 'Retry-After': '0' } })
    },
  })
  return { client, requests }
}

describe('Identity credential administration', () => {
  it('lists at the generic Identity root with the supported filters and exact timestamps', async () => {
    const page = { items: [credential], has_more: true, continuation_token: 20 }
    const { client, requests } = setup(page)
    const result = await client.identityCredentials.list({
      workspace_id: workspace,
      is_active: false,
      search: 'Automation',
      sort_by: '-last_used_at',
      limit: 20,
      continuation_token: 0,
    })
    expect(result).toEqual(page)
    const url = new URL(requests[0]!.url)
    expect(url.origin + url.pathname).toBe('https://console.example/api/identity/admin/credentials')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      workspace_id: workspace,
      is_active: 'false',
      search: 'Automation',
      sort_by: '-last_used_at',
      limit: '20',
      continuation_token: '0',
    })
  })

  it('preserves the Identity BFF prefix, scoped headers, auth and response safety', async () => {
    const { client, requests } = setup()
    await client
      .withOptions({ headers: { 'x-client-scope': 'client' } })
      .identityCredentials.withOptions({ headers: { 'x-resource-scope': 'resource' } })
      .get(id)
    expect(requests[0]?.url).toBe(`https://console.example/api/identity/admin/credentials/${id}`)
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer admin-token')
    expect(requests[0]?.headers.get('x-client-scope')).toBe('client')
    expect(requests[0]?.headers.get('x-resource-scope')).toBe('resource')
    expect(requests[0]?.cache).toBe('no-store')
    expect(requests[0]?.redirect).toBe('error')
    expect(requests[0]?.credentials).toBe('same-origin')
  })

  it('retains the one-time machine creation envelope and exact expiry', async () => {
    const created = { credential, client_id: 'key-id', client_secret: 'one-time-secret' }
    const { client, requests } = setup(created)
    const body = {
      entity_id: entity,
      workspace_id: workspace,
      credential_type: 'api_key' as const,
      name: 'Automation',
      expires_at: expiresAt,
    }
    const actual = await client.identityCredentials.create(body)
    expectTypeOf(actual.client_secret).toEqualTypeOf<string>()
    expectTypeOf(actual.credential.expires_at).toEqualTypeOf<string | null>()
    expect(actual).toEqual(created)
    expect(requests[0]?.method).toBe('POST')
    expect(await requests[0]?.json()).toEqual(body)
  })

  it('retains the flat human creation response and omitted expiry', async () => {
    expectTypeOf<CreateIdentityHumanCredential['expires_at']>().toEqualTypeOf<undefined>()
    const created = { ...credential, credential_type: 'sso', expires_at: null }
    const { client, requests } = setup(created)
    const body = {
      entity_id: entity,
      workspace_id: workspace,
      credential_type: 'sso' as const,
      sso_provider: 'oidc',
      sso_subject: 'subject',
    }
    const actual = await client.identityCredentials.create(body)
    expectTypeOf(actual.expires_at).toEqualTypeOf<string | null>()
    expect(actual).toEqual(created)
    expect(await requests[0]?.json()).toEqual(body)
  })

  it.each([{ name: 'Renamed' }, { expires_at: null }, { expires_at: expiresAt }])(
    'PATCH preserves omitted expiry versus an explicit clear or timestamp: %j',
    async (body) => {
      const { client, requests } = setup()
      await client.identityCredentials.update(id, body)
      expect(requests[0]?.url).toBe(`https://console.example/api/identity/admin/credentials/${id}`)
      expect(requests[0]?.method).toBe('PATCH')
      expect(await requests[0]?.json()).toEqual(body)
    },
  )

  it('deactivates via DELETE without expecting a response body', async () => {
    const { client, requests } = setup(undefined, 204)
    await expect(client.identityCredentials.deactivate(id)).resolves.toBeUndefined()
    expect(requests[0]?.method).toBe('DELETE')
    expect(requests[0]?.url).toBe(`https://console.example/api/identity/admin/credentials/${id}`)
  })

  it.each(['create', 'update', 'deactivate'] as const)(
    '%s never retries or exposes response secrets, including scoped retry overrides',
    async (operation) => {
      const { client, requests } = setup({ detail: 'provider client_secret=secret-marker' }, 429)
      const scoped = client.withOptions({ maxRetries: 3 })
      const resource = scoped.identityCredentials.withOptions({ maxRetries: 2 })
      const request =
        operation === 'create'
          ? resource.create({
              entity_id: entity,
              workspace_id: workspace,
              credential_type: 'api_key',
            })
          : operation === 'update'
            ? resource.update(id, { expires_at: null })
            : resource.deactivate(id)
      await expect(request).rejects.toMatchObject({ statusCode: 429 })
      await expect(request).rejects.not.toThrow('secret-marker')
      expect(requests).toHaveLength(1)
    },
  )
})
