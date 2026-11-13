import { describe, expect, it, vi } from 'vitest'
import {
  AmigoClient,
  type CreateOperationGrantRequest,
  type OperationGrant,
} from '../../src/index.js'

const WORKSPACE = '00000000-0000-0000-0000-000000000001'
const GRANT_ID = '00000000-0000-0000-0000-000000000002'
const BASE = `/v1/${WORKSPACE}/operation_grants`
const grant = {
  id: GRANT_ID,
  workspace_id: WORKSPACE,
  credential_id: '00000000-0000-0000-0000-000000000003',
  entity_id: '00000000-0000-0000-0000-000000000004',
  operation_id: '00000000-0000-0000-0000-000000000005',
  operation_kind: 'data_query',
  action: 'write',
  definition_sha256: 'a'.repeat(64),
  expires_at: '2026-12-01T00:00:00Z',
  revoked_at: null,
} satisfies OperationGrant

function recordingClient(respond: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = []
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    requests.push(request.clone())
    return respond(request)
  })
  return {
    requests,
    fetch,
    client: new AmigoClient({ apiKey: 'machine-access-token', workspaceId: WORKSPACE, fetch }),
  }
}

describe('operation grants', () => {
  it('creates an approval with its exact operation, action and expiration', async () => {
    const { client, requests } = recordingClient(() => Response.json(grant, { status: 201 }))
    const body = {
      credential_id: grant.credential_id,
      operation_kind: 'data_query',
      operation_id: grant.operation_id,
      action: 'write',
      expires_at: grant.expires_at,
    } satisfies CreateOperationGrantRequest

    expect(await client.operationGrants.create(body)).toEqual(grant)
    expect(requests[0]?.method).toBe('POST')
    expect(new URL(requests[0]!.url).pathname).toBe(BASE)
    expect(await requests[0]!.json()).toEqual(body)
  })

  it('preserves opaque pagination tokens and includes revoked approvals', async () => {
    const revoked = { ...grant, revoked_at: '2026-11-02T00:00:00Z' }
    const { client, requests } = recordingClient((request) => {
      const next = new URL(request.url).searchParams.get('continuation_token')
      return Response.json({
        items: [next === null ? grant : revoked],
        has_more: next === null,
        continuation_token: next === null ? 'opaque+/=' : null,
      })
    })
    const items = []
    for await (const item of client.operationGrants.listAutoPaging({
      limit: 1,
      sort_by: ['-expires_at'],
    }))
      items.push(item)
    expect(items).toEqual([grant, revoked])
    expect(requests).toHaveLength(2)
    expect(new URL(requests[1]!.url).searchParams.get('continuation_token')).toBe('opaque+/=')
    expect(new URL(requests[1]!.url).searchParams.get('limit')).toBe('1')
    for (const request of requests) {
      expect(new URL(request.url).searchParams.getAll('sort_by')).toEqual(['-expires_at'])
    }
  })

  it('invokes through the scoped token and options without changing the input', async () => {
    const response = { result: [{ saved: true }], row_count: 1, duration_ms: 1 }
    const { client, requests } = recordingClient(() => Response.json(response))
    const input = { value: "quote'; SELECT ' and Unicode λ", revision: 3 }
    const scoped = client.withOptions({ headers: { 'x-trace': 'grant-call' } })
    expect(await scoped.operationGrants.invoke(GRANT_ID, { input })).toEqual(response)
    expect(new URL(requests[0]!.url).pathname).toBe(`${BASE}/${GRANT_ID}/invoke`)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer machine-access-token')
    expect(requests[0]?.headers.get('x-trace')).toBe('grant-call')
    expect(await requests[0]!.json()).toEqual({ input })
    await client.operationGrants.invoke(GRANT_ID)
    expect(await requests[1]!.json()).toEqual({})
    expect(requests[1]?.headers.has('x-trace')).toBe(false)
  })

  it.each([401, 403, 429, 503])('does not replay an invocation after HTTP %s', async (status) => {
    const { client, fetch } = recordingClient(() =>
      Response.json({ detail: 'refused' }, { status, headers: { 'Retry-After': '0' } }),
    )
    const scoped = client.operationGrants.withOptions({ maxRetries: 5 })
    await expect(scoped.invoke(GRANT_ID, { input: { revision: 3 } })).rejects.toMatchObject({
      statusCode: status,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not replay a write when the response is lost', async () => {
    const { client, fetch } = recordingClient(() => {
      throw new TypeError('connection lost after commit')
    })
    await expect(client.operationGrants.invoke(GRANT_ID)).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('revokes the exact grant and propagates a rejected revocation', async () => {
    const { client, requests } = recordingClient(() => new Response(null, { status: 204 }))
    await expect(client.operationGrants.revoke(GRANT_ID)).resolves.toBeUndefined()
    expect(requests[0]?.method).toBe('DELETE')
    expect(new URL(requests[0]!.url).pathname).toBe(`${BASE}/${GRANT_ID}`)
    const denied = recordingClient(() => Response.json({ detail: 'refused' }, { status: 403 }))
    await expect(denied.client.operationGrants.revoke(GRANT_ID)).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})
