import { describe, expect, it } from 'vitest'
import { AmigoClient, ConfigurationError } from '../../src/index.js'
import type { SsoGroupManagedGrant, SsoGroupManagedGrantList } from '../../src/index.js'

const workspace = '635fd22d-35b1-4ea9-9118-8eda13b4b753'
const mapping = '919a5b49-8cc2-4e8a-bd1e-cf6fb81406cd'
const grant = 'd0767abc-a8cb-4d16-b173-fc6da2b48142'
const revision = 'a265c823-0016-4d15-b708-27b5c28d896b'
const manual = '2b151559-34c1-47a2-8f22-65b6dd2fd7c5'
const updatedAt = '2026-10-29T17:00:01.123456+00:00'
const identity = 'https://console.example/api/identity'
const snapshot = {
  mapping_id: mapping,
  mapping_revision: revision,
  grant_id: grant,
  independent: { id: manual, role: 'member', scopes: [], is_active: true, updated_at: updatedAt },
}
const groupGrant: SsoGroupManagedGrant = {
  id: grant,
  workspace_id: workspace,
  membership_id: '60af67f9-c0c6-41cc-a710-919e58af9dc9',
  entity_id: 'bacf92ef-c185-4b72-b9c0-1a3ac056c5fd',
  connection_id: '14dc4134-90ca-4fae-9e5c-737d7b921b0e',
  binding_id: 'd345846e-7f59-4a8d-8ae3-bca9896cac6b',
  role: 'member',
  is_active: true,
  source_version: 0,
  source_event_id: null,
  approved_by_entity_id: '351bdd42-6a64-4397-877e-1d475202ac4f',
  revoked_at: null,
  created_at: updatedAt,
  updated_at: updatedAt,
  mapping_id: mapping,
  mapping_revision: revision,
}
const groupGrants: SsoGroupManagedGrantList = {
  items: [groupGrant],
  has_more: false,
  continuation_token: null,
}

function setup(response: unknown = snapshot, status = 200, workspaceId = workspace) {
  const requests: Request[] = []
  const client = new AmigoClient({
    apiKey: 'independent-human-token',
    workspaceId,
    baseUrl: 'https://console.example/api/platform',
    identityBaseUrl: identity,
    maxRetries: 5,
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init))
      return Response.json(response, { status, headers: { 'retry-after': '0' } })
    },
  })
  return { client, requests }
}

describe('group-managed grant discovery', () => {
  it('lists mapping-bound grants through the workspace Identity origin', async () => {
    const { client, requests } = setup(groupGrants)
    const result: SsoGroupManagedGrantList = await client.ssoGroupGrants.list()
    expect(result).toEqual(groupGrants)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.url).toBe(`${identity}/admin/workspaces/${workspace}/sso/group-grants`)
    expect(requests[0]?.cache).toBe('no-store')
    expect(requests[0]?.redirect).toBe('error')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer independent-human-token')
  })

  it('forwards pagination and ordering without changing the continuation token', async () => {
    const token = 'next/+?=&page'
    const page = { ...groupGrants, has_more: true, continuation_token: token }
    const { client, requests } = setup(page)
    const first = await client.ssoGroupGrants.list({ limit: 20, sort_by: ['+created_at'] })
    expect(first.has_more).toBe(true)
    expect(first.continuation_token).toBe(token)
    await client.ssoGroupGrants.withOptions({ timeout: 15000 }).list({
      limit: 20,
      sort_by: ['+created_at'],
      continuation_token: first.continuation_token,
    })
    expect(requests).toHaveLength(2)
    const url = new URL(requests[1]!.url)
    expect(url.pathname).toBe(`/api/identity/admin/workspaces/${workspace}/sso/group-grants`)
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.getAll('sort_by')).toEqual(['+created_at'])
    expect(url.searchParams.get('continuation_token')).toBe(token)
    expect([...url.searchParams.keys()]).toHaveLength(3)
  })

  it('returns an empty final page without inventing group or app grants', async () => {
    const empty = { items: [], has_more: false, continuation_token: null }
    const { client, requests } = setup(empty)
    expect(await client.ssoGroupGrants.list()).toEqual(empty)
    expect(requests).toHaveLength(1)
  })

  it('preserves the largest safely representable source revision', async () => {
    const page = {
      ...groupGrants,
      items: [{ ...groupGrant, source_version: Number.MAX_SAFE_INTEGER }],
    }
    const { client } = setup(page)
    expect((await client.ssoGroupGrants.list()).items[0]?.source_version).toBe(
      Number.MAX_SAFE_INTEGER,
    )
  })

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', null])(
    'rejects an invalid or unsafe source revision (%s)',
    async (sourceVersion) => {
      const { client } = setup({
        ...groupGrants,
        items: [groupGrant, { ...groupGrant, source_version: sourceVersion }],
      })
      await expect(client.ssoGroupGrants.list()).rejects.toThrow(
        'Managed grant revision cannot be represented safely',
      )
    },
  )

  it.each([403, 404, 422, 503])(
    'preserves HTTP %s without exposing provider details or falling back to app grants',
    async (status) => {
      const { client, requests } = setup({ detail: 'private provider payload' }, status)
      await expect(
        client.ssoGroupGrants.withOptions({ maxRetries: 0 }).list(),
      ).rejects.toMatchObject({ statusCode: status, message: 'Identity request failed' })
      expect(requests).toHaveLength(1)
      expect(requests[0]?.url).toBe(`${identity}/admin/workspaces/${workspace}/sso/group-grants`)
    },
  )

  it('refuses an invalid workspace before discovery transport', async () => {
    const { client, requests } = setup(groupGrants, 200, 'invalid-workspace')
    await expect(client.ssoGroupGrants.list()).rejects.toBeInstanceOf(ConfigurationError)
    expect(requests).toHaveLength(0)
  })
})

describe('mapping-bound independent access conversion', () => {
  it('reads the exact mapping/grant snapshot through the existing Identity BFF origin', async () => {
    const { client, requests } = setup()
    const result = await client.ssoGroupGrants.independent(mapping, grant)
    expect(result).toEqual(snapshot)
    expect(result.independent.updated_at).toBe(updatedAt)
    expect(requests[0]?.url).toBe(
      `${identity}/admin/workspaces/${workspace}/sso/group-mappings/${mapping}/grants/${grant}/independent`,
    )
    expect(requests[0]?.cache).toBe('no-store')
    expect(requests[0]?.redirect).toBe('error')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer independent-human-token')
  })

  it('forwards mapping revision and microsecond manual CAS verbatim without app fallback', async () => {
    const converted = {
      mapping_id: mapping,
      mapping_revision: revision,
      grant_id: grant,
      manual_grant_id: manual,
      converted: true,
    }
    const { client, requests } = setup(converted)
    const body = {
      expected_revision: revision,
      manual_grant_id: manual,
      expected_updated_at: updatedAt,
    }
    expect(
      await client
        .withOptions({ timeout: 15000 })
        .ssoGroupGrants.convertIndependent(mapping, grant, body),
    ).toEqual(converted)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe(
      `${identity}/admin/workspaces/${workspace}/sso/group-mappings/${mapping}/grants/${grant}/convert-independent`,
    )
    expect(await requests[0]?.json()).toEqual(body)
    expect(requests[0]?.cache).toBe('no-store')
  })

  it.each([409, 429, 503])('never retries a consuming conversion after HTTP %s', async (status) => {
    const { client, requests } = setup({ detail: 'private provider payload' }, status)
    await expect(
      client.ssoGroupGrants.withOptions({ maxRetries: 9 }).convertIndependent(mapping, grant, {
        expected_revision: revision,
        manual_grant_id: manual,
        expected_updated_at: updatedAt,
      }),
    ).rejects.toMatchObject({ statusCode: status, message: 'Identity request failed' })
    expect(requests).toHaveLength(1)
  })

  it('refuses an invalid workspace before transport', async () => {
    const { client, requests } = setup(snapshot, 200, 'invalid-workspace')
    await expect(client.ssoGroupGrants.independent(mapping, grant)).rejects.toBeInstanceOf(
      ConfigurationError,
    )
    expect(requests).toHaveLength(0)
  })
})
