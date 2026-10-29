import { describe, expect, it } from 'vitest'
import { AmigoClient, ConfigurationError } from '../../src/index.js'

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
