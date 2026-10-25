import { describe, expect, it, vi } from 'vitest'
import { AmigoClient, recoverWorkspaceAuthentication } from '../../src/index.js'

const workspace = '635fd22d-35b1-4ea9-9118-8eda13b4b753'
const revision = '919a5b49-8cc2-4e8a-bd1e-cf6fb81406cd'
const binding = 'a265c823-0016-4d15-b708-27b5c28d896b'
const grant = 'd0767abc-a8cb-4d16-b173-fc6da2b48142'
const identity = 'https://identity.example'
const policy = {
  workspace_id: workspace,
  mode: 'optional',
  revision: null,
  configuration_revision: null,
  connection_id: null,
  coverage: null,
}
const config = {
  id: grant,
  workspace_id: workspace,
  connection_id: binding,
  revision,
  provider: 'okta',
  login_app_id: 'login-app',
  client_id: 'reader',
  enabled: false,
}
const sourceGrant = { id: grant, source_version: 5 }
const credentials = {
  provider: 'okta' as const,
  login_app_id: 'login-app',
  client_id: 'reader',
  private_jwk: 'private-key-input',
}

function setup(response: unknown = policy, status = 200) {
  const requests: Request[] = []
  const fetcher: typeof fetch = async (input, init) => {
    requests.push(input instanceof Request ? input : new Request(input, init))
    return status === 204 ? new Response(null, { status }) : Response.json(response, { status })
  }
  const client = new AmigoClient({
    apiKey: 'human-access-token',
    workspaceId: workspace,
    baseUrl: 'https://platform.example',
    identityBaseUrl: identity,
    fetch: fetcher,
  })
  return { client, requests, fetcher }
}

describe('Identity administration contracts', () => {
  it('uses the separate identity origin and preserves nullable unconfigured policy fields', async () => {
    const { client, requests } = setup()
    expect(await client.workspaceAuthentication.get()).toEqual(policy)
    expect(requests[0]?.url).toBe(`${identity}/admin/workspaces/${workspace}/authentication-policy`)
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer human-access-token')
    expect(requests[0]?.redirect).toBe('error')
    expect(requests[0]?.cache).toBe('no-store')
  })

  it('preserves the BFF identity base path through client and resource request scoping', async () => {
    const requests: Request[] = []
    const client = new AmigoClient({
      apiKey: 'bff-placeholder',
      workspaceId: workspace,
      baseUrl: 'https://console.example/api/platform',
      identityBaseUrl: 'https://console.example/api/identity',
      fetch: async (input, init) => {
        requests.push(input instanceof Request ? input : new Request(input, init))
        return Response.json(policy)
      },
    })
    await client
      .withOptions({ headers: { 'x-trace-id': 'first' } })
      .workspaceAuthentication.withOptions({ headers: { 'x-review-id': 'second' } })
      .get()
    expect(requests[0]?.url).toBe(
      `https://console.example/api/identity/admin/workspaces/${workspace}/authentication-policy`,
    )
    expect(requests[0]?.headers.get('x-trace-id')).toBe('first')
    expect(requests[0]?.headers.get('x-review-id')).toBe('second')
  })

  it.each([
    [
      'configure',
      'PUT',
      '',
      { expected_revision: null, connection_id: binding, coverage: 'managed_members' },
    ],
    ['confirmOwner', 'POST', '/owner-confirmation', { expected_revision: revision }],
    [
      'reviewCredentials',
      'POST',
      '/credential-review',
      { expected_revision: revision, inventory_fingerprint: 'a'.repeat(64) },
    ],
    [
      'configureRecovery',
      'POST',
      '/recovery',
      { policy_revision: revision, membership_id: binding },
    ],
    [
      'testRecovery',
      'POST',
      '/recovery/test',
      { recovery_revision: revision, code: 'x'.repeat(43) },
    ],
    ['readiness', 'POST', '/readiness', { expected_revision: revision }],
    ['activate', 'POST', '/activate', { expected_revision: revision }],
    ['disable', 'POST', '/disable', { expected_revision: revision }],
  ] as const)(
    'routes %s with the exact policy request body',
    async (name, method, suffix, body) => {
      const { client, requests } = setup()
      switch (name) {
        case 'configure':
          await client.workspaceAuthentication.configure(body)
          break
        case 'confirmOwner':
          await client.workspaceAuthentication.confirmOwner(body)
          break
        case 'reviewCredentials':
          await client.workspaceAuthentication.reviewCredentials(body)
          break
        case 'configureRecovery':
          await client.workspaceAuthentication.configureRecovery(body)
          break
        case 'testRecovery':
          await client.workspaceAuthentication.testRecovery(body)
          break
        case 'readiness':
          await client.workspaceAuthentication.readiness(body)
          break
        case 'activate':
          await client.workspaceAuthentication.activate(body)
          break
        case 'disable':
          await client.workspaceAuthentication.disable(body)
          break
      }
      expect(requests[0]?.url).toBe(
        `${identity}/admin/workspaces/${workspace}/authentication-policy${suffix}`,
      )
      expect(requests[0]?.method).toBe(method)
      expect(await requests[0]?.json()).toEqual(body)
    },
  )

  it('reads inventory on the Identity authority and retains the server fingerprint', async () => {
    const inventory = { fingerprint: 'b'.repeat(64), complete: true, total_credentials: 2 }
    const { client, requests } = setup(inventory)
    expect(await client.workspaceAuthentication.credentialInventory()).toEqual(inventory)
    expect(requests[0]?.url).toBe(
      `${identity}/admin/workspaces/${workspace}/authentication-policy/credential-inventory`,
    )
  })

  it.each(['configure', 'verify', 'snapshot', 'enable', 'disable', 'getConfiguration'] as const)(
    'routes lifecycle %s without exposing internal reconcile',
    async (name) => {
      const { client, requests } = setup(config)
      let expected: unknown
      switch (name) {
        case 'configure':
          expected = credentials
          await client.ssoLifecycle.configure(credentials)
          break
        case 'verify':
          expected = { ...credentials, binding_id: binding }
          await client.ssoLifecycle.verify({ ...credentials, binding_id: binding })
          break
        case 'snapshot':
          expected = { ...credentials, binding_id: binding }
          await client.ssoLifecycle.snapshot({ ...credentials, binding_id: binding })
          break
        case 'enable':
          expected = {
            configuration_id: grant,
            configuration_revision: revision,
            binding_id: binding,
          }
          await client.ssoLifecycle.enable({
            configuration_id: grant,
            configuration_revision: revision,
            binding_id: binding,
          })
          break
        case 'disable':
          expected = { configuration_id: grant, configuration_revision: revision }
          await client.ssoLifecycle.disable({
            configuration_id: grant,
            configuration_revision: revision,
          })
          break
        case 'getConfiguration':
          await client.ssoLifecycle.getConfiguration()
          break
      }
      const suffix = name === 'configure' || name === 'getConfiguration' ? 'configuration' : name
      expect(requests[0]?.url).toBe(
        `${identity}/admin/workspaces/${workspace}/sso/lifecycle/${suffix}`,
      )
      expect(requests[0]?.method).toBe(
        name === 'getConfiguration' ? 'GET' : name === 'configure' ? 'PUT' : 'POST',
      )
      if (expected) expect(await requests[0]?.json()).toEqual(expected)
      expect('reconcile' in client.ssoLifecycle).toBe(false)
    },
  )

  it('keeps opaque grant pagination and the original microsecond conversion timestamp', async () => {
    const { client, requests } = setup({
      items: [sourceGrant],
      has_more: true,
      continuation_token: '40',
    })
    expect(
      await client.ssoGrants.list({
        limit: 20,
        continuation_token: '20',
        sort_by: ['+created_at'],
      }),
    ).toMatchObject({ continuation_token: '40' })
    const url = new URL(requests[0]!.url)
    expect(url.searchParams.get('continuation_token')).toBe('20')
    expect(url.searchParams.getAll('sort_by')).toEqual(['+created_at'])
    const timestamp = '2026-10-25T16:10:11.123456+00:00'
    const snapshot = setup({
      id: binding,
      role: 'member',
      scopes: [],
      is_active: true,
      updated_at: timestamp,
    })
    const independent = await snapshot.client.ssoGrants.independent(grant)
    const conversion = setup(sourceGrant)
    await conversion.client.ssoGrants.convertIndependent(grant, {
      manual_grant_id: independent.id,
      expected_updated_at: independent.updated_at,
    })
    expect(await conversion.requests[0]?.json()).toEqual({
      manual_grant_id: binding,
      expected_updated_at: timestamp,
    })
  })

  it('sends caller-owned approval identity unchanged and retains revoke tombstone semantics', async () => {
    const { client, requests } = setup(sourceGrant)
    const approval = { id: grant, binding_id: binding, role: 'member' as const }
    await client.ssoGrants.approve(approval)
    expect(await requests[0]?.json()).toEqual(approval)
    const revoked = setup(undefined, 204)
    expect(await revoked.client.ssoGrants.revoke(grant)).toBeUndefined()
    expect(revoked.requests[0]?.method).toBe('DELETE')
    expect(revoked.requests[0]?.url).toBe(
      `${identity}/admin/workspaces/${workspace}/sso/grants/${grant}`,
    )
  })

  it('refuses grant revisions that JavaScript cannot represent exactly', async () => {
    const { client } = setup({
      items: [{ ...sourceGrant, source_version: 9007199254740992 }],
      has_more: false,
      continuation_token: null,
    })
    await expect(client.ssoGrants.list()).rejects.toThrow('cannot be represented safely')
  })

  it('uses recovery without authentication and returns policy state without creating a session', async () => {
    const response = { mode: 'optional', policy_revision: revision }
    const { requests, fetcher } = setup(response)
    expect(
      await recoverWorkspaceAuthentication({
        workspaceId: workspace,
        identityBaseUrl: identity,
        recovery_revision: revision,
        code: 'r'.repeat(43),
        fetch: fetcher,
      }),
    ).toEqual(response)
    expect(requests[0]?.url).toBe(
      `${identity}/auth/workspaces/${workspace}/authentication-recovery`,
    )
    expect(requests[0]?.headers.has('authorization')).toBe(false)
    expect(requests[0]?.credentials).toBe('omit')
    expect(requests[0]?.url).not.toContain('r'.repeat(43))
    const authenticated = setup(response)
    await authenticated.client.workspaceAuthentication
      .withOptions({ headers: { Cookie: 'private-cookie' } })
      .recover({ recovery_revision: revision, code: 'r'.repeat(43) })
    expect(authenticated.requests[0]?.headers.has('authorization')).toBe(false)
    expect(authenticated.requests[0]?.headers.has('cookie')).toBe(false)
  })

  it('honors a scoped timeout on provider snapshots without exposing the underlying failure', async () => {
    let transportSignal: AbortSignal | undefined
    const fetcher: typeof fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      transportSignal = request.signal
      return new Promise((_, reject) =>
        transportSignal?.addEventListener(
          'abort',
          () => reject(new Error('private-provider-details')),
          { once: true },
        ),
      )
    }
    const client = new AmigoClient({
      apiKey: 'token',
      workspaceId: workspace,
      identityBaseUrl: identity,
      fetch: fetcher,
    })
    await expect(
      client.ssoLifecycle
        .withOptions({ timeout: 10 })
        .snapshot({ ...credentials, binding_id: binding }),
    ).rejects.toMatchObject({ message: 'Identity request timed out', timeoutMs: 10 })
    expect(transportSignal?.aborted).toBe(true)
  })

  it('does not repeat consuming or activation writes even with Retry-After', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ detail: 'limited' }, { status: 429, headers: { 'Retry-After': '0' } }),
    )
    const client = new AmigoClient({
      apiKey: 'token',
      workspaceId: workspace,
      identityBaseUrl: identity,
      fetch: fetcher,
      maxRetries: 4,
    })
    await expect(
      client.workspaceAuthentication
        .withOptions({ maxRetries: 3 })
        .testRecovery({ recovery_revision: revision, code: 'c'.repeat(43) }),
    ).rejects.toMatchObject({ statusCode: 429 })
    expect(fetcher).toHaveBeenCalledOnce()
    await expect(
      client.workspaceAuthentication.activate({ expected_revision: revision }),
    ).rejects.toMatchObject({ statusCode: 429 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([403, 409, 422, 503])(
    'does not expose secret-bearing server errors (%s)',
    async (status) => {
      const secret = 'provider-private-secret-do-not-log'
      const { client } = setup(
        { detail: [{ input: { private_jwk: secret, code: secret }, msg: secret }] },
        status,
      )
      try {
        await client.ssoLifecycle.configure({ ...credentials, private_jwk: secret })
        expect.fail('Expected rejection')
      } catch (error) {
        expect(error).toMatchObject({ statusCode: status })
        expect(String(error)).not.toContain(secret)
        expect(JSON.stringify(error)).not.toContain(secret)
      }
    },
  )

  it('retains known conflict codes without returning arbitrary provider messages', async () => {
    const { client } = setup({ detail: 'policy_changed' }, 409)
    await expect(
      client.workspaceAuthentication.activate({ expected_revision: revision }),
    ).rejects.toMatchObject({ statusCode: 409, message: 'policy_changed' })
  })

  it('refuses a malformed workspace before sending any credential', async () => {
    const fetcher = vi.fn()
    const client = new AmigoClient({
      apiKey: 'token',
      workspaceId: '../other',
      identityBaseUrl: identity,
      fetch: fetcher,
    })
    await expect(client.workspaceAuthentication.get()).rejects.toThrow('valid workspace UUID')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('forwards caller cancellation without retrying the operation', async () => {
    const controller = new AbortController()
    let started = false
    // A real transport retains its signal until completion. Keep the mock's
    // listener alive as well, and verify cancellation reaches that signal.
    let observedSignal: AbortSignal | undefined
    const fetcher: typeof fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      observedSignal = request.signal
      started = true
      return new Promise((_, reject) =>
        request.signal.addEventListener(
          'abort',
          () => reject(new Error('private upstream failure')),
          { once: true },
        ),
      )
    }
    const client = new AmigoClient({
      apiKey: 'token',
      workspaceId: workspace,
      identityBaseUrl: identity,
      fetch: fetcher,
    })
    const pending = client.workspaceAuthentication
      .withOptions({ signal: controller.signal })
      .activate({ expected_revision: revision })
    void pending.catch(() => undefined)
    await vi.waitFor(() => expect(started).toBe(true))
    controller.abort()
    expect(observedSignal?.aborted).toBe(true)
    await expect(pending).rejects.toThrow('Identity request could not be confirmed')
  })
})
