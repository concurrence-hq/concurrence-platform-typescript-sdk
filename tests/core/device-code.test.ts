import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loginWithDeviceCode,
  TokenManager,
  MemoryTokenStorage,
  FileTokenStorage,
  AmigoError,
  DeviceCodeExpiredError,
  DeviceCodeDeniedError,
  RefreshTokenExpiredError,
  LoginCancelledError,
  NetworkError,
  RateLimitError,
  formatDeviceCodeInstructions,
  formatDeviceCodeLink,
  formatWorkspaceList,
  openBrowser,
  type AuthResult,
} from '../../src/index.js'
import { decodeJwtPayload } from '../../src/core/device-code.js'

function makeJwt(claims: Record<string, unknown>): string {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${h}.${p}.sig`
}

function mockFetch(status: number, body: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
  })
}

function createFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  let i = 0
  return vi.fn().mockImplementation(() => {
    const r = responses[i++] ?? responses[responses.length - 1]!
    return Promise.resolve({
      status: r!.status,
      ok: r!.status >= 200 && r!.status < 300,
      headers: new Headers(),
      json: () => Promise.resolve(r!.body),
    })
  })
}

const ISSUANCE = {
  device_code: 'dc_test',
  user_code: 'ABCD-EFGH',
  verification_uri: 'https://console.amigo.ai/device',
  verification_uri_complete: 'https://console.amigo.ai/device?user_code=ABCD-EFGH',
  expires_in: 900,
  interval: 0.01,
}

const TOKEN = {
  access_token: makeJwt({ sub: 'e1', workspace_id: 'ws1', exp: 9999999999 }),
  token_type: 'Bearer',
  expires_in: 900,
  scope: 'ws:read',
  refresh_token: 'rt_abc',
}

// --- decodeJwtPayload ---

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const jwt = makeJwt({ sub: 'e1', workspace_id: 'ws1', exp: 1700000000 })
    expect(decodeJwtPayload(jwt)).toEqual({ sub: 'e1', workspace_id: 'ws1', exp: 1700000000 })
  })

  it('returns null for wrong segment count', () => {
    expect(decodeJwtPayload('one')).toBeNull()
    expect(decodeJwtPayload('two.parts')).toBeNull()
  })

  it('returns null for malformed base64', () => {
    expect(decodeJwtPayload('h.!!!.s')).toBeNull()
  })
})

// --- loginWithDeviceCode ---

describe('loginWithDeviceCode', () => {
  it('completes full login flow', async () => {
    const onCode = vi.fn()
    const result = await loginWithDeviceCode({
      onCode,
      workspaceId: 'ws1',
      onWorkspaceRequired: vi.fn(),
      fetch: createFetchSequence([
        { status: 200, body: ISSUANCE },
        { status: 400, body: { error: 'authorization_pending' } },
        { status: 200, body: TOKEN },
      ]),
      identityBaseUrl: 'https://id.test',
    })

    expect(onCode).toHaveBeenCalledWith(ISSUANCE)
    expect(result.workspaceId).toBe('ws1')
    expect(result.refreshToken).toBe('rt_abc')
  })

  it('pins workspace_id on the /device/code request (no onWorkspaceRequired needed)', async () => {
    const fetch = createFetchSequence([
      { status: 200, body: ISSUANCE },
      { status: 200, body: TOKEN },
    ])
    const result = await loginWithDeviceCode({
      onCode: vi.fn(),
      workspaceId: 'ws1',
      fetch,
      identityBaseUrl: 'https://id.test',
    })
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(url).toBe('https://id.test/device/code')
    // Parse the body as form params so the assertion exercises the real wire
    // format (a stringified URLSearchParams or a substring match could pass
    // vacuously).
    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('workspace_id')).toBe('ws1')
    expect(result.workspaceId).toBe('ws1')
  })

  it('defaults to the identity host', async () => {
    const fetch = createFetchSequence([
      { status: 200, body: ISSUANCE },
      { status: 200, body: TOKEN },
    ])
    await loginWithDeviceCode({ onCode: vi.fn(), workspaceId: 'ws1', fetch })

    const urls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => url)
    expect(urls).toEqual([
      'https://identity.api-us.concurrence.com/device/code',
      'https://identity.api-us.concurrence.com/token',
    ])
  })

  it('handles multi-workspace', async () => {
    const multi = {
      error: 'workspace_selection_required',
      workspaces: [{ workspace_id: 'ws-a' }, { workspace_id: 'ws-b' }],
      refresh_token: 'rt_boot',
    }
    const scopedToken = {
      access_token: makeJwt({ sub: 'e1', workspace_id: 'ws-b', exp: 9999999999 }),
      token_type: 'Bearer',
      expires_in: 900,
      scope: 'ws:read',
      refresh_token: 'rt_scoped',
    }

    const onWs = vi.fn().mockResolvedValue('ws-b')
    const result = await loginWithDeviceCode({
      onCode: vi.fn(),
      workspaceId: 'ws-init',
      onWorkspaceRequired: onWs,
      fetch: createFetchSequence([
        { status: 200, body: ISSUANCE },
        { status: 300, body: multi },
        { status: 200, body: scopedToken },
      ]),
      identityBaseUrl: 'https://id.test',
    })

    expect(onWs).toHaveBeenCalledWith(multi.workspaces)
    expect(result.workspaceId).toBe('ws-b')
  })

  it('throws on expired code', async () => {
    await expect(
      loginWithDeviceCode({
        onCode: vi.fn(),
        workspaceId: 'ws1',
        onWorkspaceRequired: vi.fn(),
        fetch: createFetchSequence([
          { status: 200, body: ISSUANCE },
          { status: 400, body: { error: 'expired_token' } },
        ]),
        identityBaseUrl: 'https://id.test',
      }),
    ).rejects.toThrow(DeviceCodeExpiredError)
  })

  it('throws on denied', async () => {
    await expect(
      loginWithDeviceCode({
        onCode: vi.fn(),
        workspaceId: 'ws1',
        onWorkspaceRequired: vi.fn(),
        fetch: createFetchSequence([
          { status: 200, body: ISSUANCE },
          { status: 400, body: { error: 'access_denied' } },
        ]),
        identityBaseUrl: 'https://id.test',
      }),
    ).rejects.toThrow(DeviceCodeDeniedError)
  })

  it('handles slow_down by reporting status', async () => {
    vi.useFakeTimers()
    const onStatus = vi.fn()

    const loginPromise = loginWithDeviceCode({
      onCode: vi.fn(),
      workspaceId: 'ws1',
      onWorkspaceRequired: vi.fn(),
      onStatus,
      fetch: createFetchSequence([
        { status: 200, body: ISSUANCE },
        { status: 400, body: { error: 'slow_down' } },
        { status: 200, body: TOKEN },
      ]),
      identityBaseUrl: 'https://id.test',
    })

    // Advance past the initial poll interval + the slow_down-increased interval
    await vi.advanceTimersByTimeAsync(10_000)

    const result = await loginPromise
    expect(onStatus).toHaveBeenCalledWith('slow_down')
    expect(result.workspaceId).toBe('ws1')

    vi.useRealTimers()
  })

  it('cancels via AbortSignal', async () => {
    const controller = new AbortController()
    await expect(
      loginWithDeviceCode({
        onCode: () => controller.abort(),
        workspaceId: 'ws1',
        onWorkspaceRequired: vi.fn(),
        signal: controller.signal,
        fetch: createFetchSequence([{ status: 200, body: ISSUANCE }]),
        identityBaseUrl: 'https://id.test',
      }),
    ).rejects.toThrow(LoginCancelledError)
  })
})

// --- TokenManager ---

describe('TokenManager', () => {
  let storage: MemoryTokenStorage
  const validResult: AuthResult = {
    accessToken: makeJwt({
      sub: 'e1',
      workspace_id: 'ws1',
      exp: Math.floor(Date.now() / 1000) + 600,
    }),
    refreshToken: 'rt_abc',
    workspaceId: 'ws1',
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  }

  beforeEach(() => {
    storage = new MemoryTokenStorage()
  })

  it('stores and retrieves token', async () => {
    const mgr = new TokenManager({ storage })
    await mgr.store(validResult)
    const auth = await mgr.getAccessToken()
    expect(auth?.token).toBe(validResult.accessToken)
    expect(auth?.workspaceId).toBe('ws1')
  })

  it('returns null when empty', async () => {
    expect(await new TokenManager({ storage }).getAccessToken()).toBeNull()
  })

  it('auto-refreshes expiring tokens', async () => {
    const newToken = makeJwt({
      sub: 'e1',
      workspace_id: 'ws1',
      exp: Math.floor(Date.now() / 1000) + 900,
    })
    const mgr = new TokenManager({
      storage,
      identityBaseUrl: 'https://id.test',
      fetch: mockFetch(200, {
        access_token: newToken,
        token_type: 'Bearer',
        expires_in: 900,
        scope: 'ws:read',
        refresh_token: 'rt_new',
      }),
    })
    await mgr.store({ ...validResult, expiresAt: Math.floor(Date.now() / 1000) + 30 })
    const auth = await mgr.getAccessToken()
    expect(auth?.token).toBe(newToken)
  })

  it('refreshes against the identity host by default', async () => {
    const fetch = mockFetch(200, TOKEN)
    const mgr = new TokenManager({ storage, fetch })
    await mgr.store({ ...validResult, expiresAt: Math.floor(Date.now() / 1000) + 30 })
    await mgr.getAccessToken()

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(url).toBe('https://identity.api-us.concurrence.com/token')
  })

  it('throws RefreshTokenExpiredError on 401', async () => {
    const mgr = new TokenManager({
      storage,
      identityBaseUrl: 'https://id.test',
      fetch: mockFetch(401, { error: 'invalid_grant' }),
    })
    await mgr.store({ ...validResult, expiresAt: Math.floor(Date.now() / 1000) + 10 })
    await expect(mgr.getAccessToken()).rejects.toThrow(RefreshTokenExpiredError)
    expect(await mgr.hasCredentials()).toBe(false)
  })

  it('clears credentials', async () => {
    const mgr = new TokenManager({ storage })
    await mgr.store(validResult)
    await mgr.clear()
    expect(await mgr.hasCredentials()).toBe(false)
  })

  describe('signOut', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void
      const promise = new Promise<T>((done) => {
        resolve = done
      })
      return { promise, resolve }
    }

    function revokeCalls(fetch: typeof globalThis.fetch) {
      return (fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url, init]) => {
        const body = new URLSearchParams((init as RequestInit).body as string)
        return [url, body.get('token_type_hint'), body.get('token')]
      })
    }

    it('revokes the refresh token and then the access token at identity, and clears', async () => {
      const fetch = mockFetch(200, {})
      const mgr = new TokenManager({ storage, identityBaseUrl: 'https://id.test', fetch })
      await mgr.store(validResult)

      await mgr.signOut()

      expect(revokeCalls(fetch)).toEqual([
        ['https://id.test/revoke', 'refresh_token', 'rt_abc'],
        ['https://id.test/revoke', 'access_token', validResult.accessToken],
      ])
      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal)
      expect(await mgr.hasCredentials()).toBe(false)
    })

    it('skips a refresh token that identity never issued', async () => {
      const fetch = mockFetch(200, {})
      const mgr = new TokenManager({ storage, identityBaseUrl: 'https://id.test', fetch })
      await mgr.store({ ...validResult, refreshToken: '' })

      await mgr.signOut()

      expect(revokeCalls(fetch)).toEqual([
        ['https://id.test/revoke', 'access_token', validResult.accessToken],
      ])
    })

    it('posts nothing when no credentials are stored', async () => {
      const fetch = mockFetch(200, {})
      await new TokenManager({ storage, fetch }).signOut()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('waits for an in-flight refresh and revokes the rotated credentials without returning them', async () => {
      const started = deferred<void>()
      const response = deferred<Response>()
      const rotatedToken = makeJwt({
        sub: 'e1',
        workspace_id: 'ws1',
        exp: Math.floor(Date.now() / 1000) + 900,
      })
      const revoked: string[] = []
      const fetch: typeof globalThis.fetch = vi.fn(async (url, init) => {
        if (String(url).endsWith('/token')) {
          started.resolve()
          return response.promise
        }
        revoked.push(new URLSearchParams(String(init?.body)).get('token') ?? '')
        return new Response('{}', { status: 200 })
      })
      const mgr = new TokenManager({ storage, identityBaseUrl: 'https://id.test', fetch })
      await mgr.store({ ...validResult, expiresAt: Math.floor(Date.now() / 1000) + 10 })
      const pendingAuth = mgr.getAccessToken()
      await started.promise
      const signingOut = mgr.signOut()
      response.resolve(
        new Response(
          JSON.stringify({
            access_token: rotatedToken,
            refresh_token: 'rt_rotated',
            token_type: 'Bearer',
            expires_in: 900,
          }),
        ),
      )
      await signingOut

      expect(await pendingAuth).toBeNull()
      expect(revoked).toContain('rt_rotated')
      expect(revoked).toContain(rotatedToken)
      expect(revoked).toContain(validResult.accessToken)
      expect(await storage.load()).toBeNull()
      expect(await mgr.hasCredentials()).toBe(false)
    })

    it('does not clear storage before a refresh save finishes', async () => {
      const saveStarted = deferred<void>()
      const saveAllowed = deferred<void>()
      const underlyingSave = storage.save.bind(storage)
      vi.spyOn(storage, 'save').mockImplementation(async (credentials) => {
        if (credentials.refresh_token === 'rt_rotated') {
          saveStarted.resolve()
          await saveAllowed.promise
        }
        await underlyingSave(credentials)
      })
      const fetch: typeof globalThis.fetch = vi.fn(
        async (url) =>
          new Response(
            JSON.stringify(
              String(url).endsWith('/token')
                ? {
                    access_token: validResult.accessToken,
                    refresh_token: 'rt_rotated',
                    token_type: 'Bearer',
                    expires_in: 900,
                  }
                : {},
            ),
          ),
      )
      const mgr = new TokenManager({ storage, identityBaseUrl: 'https://id.test', fetch })
      await mgr.store({ ...validResult, expiresAt: Math.floor(Date.now() / 1000) + 10 })
      const pendingAuth = mgr.getAccessToken()
      await saveStarted.promise
      const signingOut = mgr.signOut()
      expect(await mgr.getAccessToken()).toBeNull()
      saveAllowed.resolve()
      await signingOut

      expect(await pendingAuth).toBeNull()
      expect(await storage.load()).toBeNull()
      expect(await mgr.hasCredentials()).toBe(false)
    })

    it('waits for an explicit store already writing before clearing sign-out credentials', async () => {
      const saveStarted = deferred<void>()
      const saveAllowed = deferred<void>()
      const underlyingSave = storage.save.bind(storage)
      vi.spyOn(storage, 'save').mockImplementation(async (credentials) => {
        saveStarted.resolve()
        await saveAllowed.promise
        await underlyingSave(credentials)
      })
      const mgr = new TokenManager({ storage, fetch: mockFetch(200, {}) })
      const storing = mgr.store(validResult)
      await saveStarted.promise
      const signingOut = mgr.signOut()
      // Let immediate revocations and clear settle while the older save is held.
      await new Promise<void>((resolve) => setImmediate(resolve))
      saveAllowed.resolve()
      await Promise.all([storing, signingOut])

      expect(await storage.load()).toBeNull()
      expect(await mgr.hasCredentials()).toBe(false)
    })

    it('finishes sign-out when an in-flight refresh reaches its network deadline', async () => {
      const started = deferred<void>()
      const response = deferred<Response>()
      const deadline = new AbortController()
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal)
      const fetch: typeof globalThis.fetch = vi.fn(async (url, init) => {
        if (!String(url).endsWith('/token')) return new Response('{}')
        started.resolve()
        return new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new TypeError('refresh timed out')),
            { once: true },
          )
          void response.promise.then(resolve)
        })
      })
      const mgr = new TokenManager({ storage, fetch })
      await mgr.store({ ...validResult, expiresAt: Math.floor(Date.now() / 1000) + 10 })
      const pendingAuth = mgr.getAccessToken().catch(() => null)
      await started.promise
      let completed = false
      const signingOut = mgr.signOut().then(() => {
        completed = true
      })
      try {
        deadline.abort()
        await new Promise<void>((resolve) => setImmediate(resolve))
        expect(completed).toBe(true)
        expect(await storage.load()).toBeNull()
      } finally {
        response.resolve(new Response(JSON.stringify(TOKEN)))
        await Promise.allSettled([pendingAuth, signingOut])
        timeout.mockRestore()
      }
    })

    it('stores a newer explicit sign-in after sign-out settles with a revocation failure', async () => {
      const started = deferred<void>()
      const response = deferred<Response>()
      const fetch: typeof globalThis.fetch = vi.fn(async () => {
        started.resolve()
        return response.promise
      })
      const mgr = new TokenManager({ storage, fetch })
      await mgr.store(validResult)
      const signingOut = mgr.signOut().catch((error: unknown) => error)
      await started.promise
      const next = {
        ...validResult,
        accessToken: 'next-access',
        refreshToken: 'next-refresh',
        workspaceId: 'ws2',
      }
      const stored = mgr.store(next).then(
        () => true,
        () => false,
      )
      response.resolve(new Response('{}', { status: 500 }))

      expect(await signingOut).toBeInstanceOf(AmigoError)
      expect(await stored).toBe(true)
      expect(await mgr.getAccessToken()).toEqual({ token: next.accessToken, workspaceId: 'ws2' })
      expect((await storage.load())?.refresh_token).toBe(next.refreshToken)
    })

    it('revokes a cold-cache stored session even when local clear starts concurrently', async () => {
      await storage.save({
        access_token: validResult.accessToken,
        refresh_token: validResult.refreshToken,
        workspace_id: validResult.workspaceId,
        expires_at: validResult.expiresAt,
      })
      const fetch = mockFetch(200, {})
      const mgr = new TokenManager({ storage, identityBaseUrl: 'https://id.test', fetch })
      const signingOut = mgr.signOut()
      const clearing = mgr.clear()
      await Promise.all([signingOut, clearing])

      expect(revokeCalls(fetch)).toEqual([
        ['https://id.test/revoke', 'refresh_token', validResult.refreshToken],
        ['https://id.test/revoke', 'access_token', validResult.accessToken],
      ])
      expect(await storage.load()).toBeNull()
    })

    it('does not let a stale refresh failure clear a newer explicit sign-in', async () => {
      const started = deferred<void>()
      const response = deferred<Response>()
      const fetch: typeof globalThis.fetch = vi.fn(async () => {
        started.resolve()
        return response.promise
      })
      const mgr = new TokenManager({ storage, fetch })
      await mgr.store({ ...validResult, expiresAt: Math.floor(Date.now() / 1000) + 10 })
      const previousAuth = mgr.getAccessToken().catch(() => null)
      await started.promise
      const next = {
        ...validResult,
        accessToken: 'new-explicit-access',
        refreshToken: 'new-explicit-refresh',
        workspaceId: 'ws2',
      }
      await mgr.store(next)
      response.resolve(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 401 }))
      await previousAuth

      expect(await mgr.getAccessToken()).toEqual({ token: next.accessToken, workspaceId: 'ws2' })
      expect((await storage.load())?.refresh_token).toBe(next.refreshToken)
    })

    it('starts a new refresh after clear and store without sharing the old workspace refresh', async () => {
      const started = deferred<void>()
      const previousResponse = deferred<Response>()
      const refreshedTokens: string[] = []
      const nextAccess = makeJwt({
        sub: 'e2',
        workspace_id: 'ws2',
        exp: Math.floor(Date.now() / 1000) + 900,
      })
      const fetch: typeof globalThis.fetch = vi.fn(async (_url, init) => {
        const refresh = new URLSearchParams(String(init?.body)).get('refresh_token') ?? ''
        refreshedTokens.push(refresh)
        if (refresh === validResult.refreshToken) {
          started.resolve()
          return previousResponse.promise
        }
        return new Response(
          JSON.stringify({
            access_token: nextAccess,
            refresh_token: 'rt_ws2_rotated',
            token_type: 'Bearer',
            expires_in: 900,
          }),
        )
      })
      const mgr = new TokenManager({ storage, fetch })
      await mgr.store({ ...validResult, expiresAt: Math.floor(Date.now() / 1000) + 10 })
      const previousAuth = mgr.getAccessToken()
      await started.promise
      await mgr.clear()
      await mgr.store({
        ...validResult,
        refreshToken: 'rt_ws2',
        workspaceId: 'ws2',
        expiresAt: Math.floor(Date.now() / 1000) + 10,
      })
      const nextAuth = mgr.getAccessToken()
      await new Promise<void>((resolve) => setImmediate(resolve))
      previousResponse.resolve(
        new Response(
          JSON.stringify({
            access_token: validResult.accessToken,
            refresh_token: 'rt_ws1_rotated',
            token_type: 'Bearer',
            expires_in: 900,
          }),
        ),
      )

      expect(await previousAuth).toBeNull()
      expect(await nextAuth).toEqual({ token: nextAccess, workspaceId: 'ws2' })
      expect(refreshedTokens).toEqual([validResult.refreshToken, 'rt_ws2'])
      expect((await storage.load())?.refresh_token).toBe('rt_ws2_rotated')
    })

    it('tries a 5xx once more', async () => {
      const fetch = createFetchSequence([
        { status: 500, body: {} },
        { status: 200, body: {} },
      ])
      const mgr = new TokenManager({ storage, identityBaseUrl: 'https://id.test', fetch })
      await mgr.store(validResult)

      await mgr.signOut()

      expect(fetch).toHaveBeenCalledTimes(3)
      expect(await mgr.hasCredentials()).toBe(false)
    })

    it('clears the credentials and rejects when identity keeps failing', async () => {
      const fetch = mockFetch(500, {})
      const mgr = new TokenManager({ storage, identityBaseUrl: 'https://id.test', fetch })
      await mgr.store(validResult)

      await expect(mgr.signOut()).rejects.toThrow(AmigoError)

      expect(fetch).toHaveBeenCalledTimes(4)
      expect(await mgr.hasCredentials()).toBe(false)
    })

    it('clears the credentials and rejects when identity cannot be reached', async () => {
      const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
      const mgr = new TokenManager({ storage, identityBaseUrl: 'https://id.test', fetch })
      await mgr.store(validResult)

      await expect(mgr.signOut()).rejects.toThrow(NetworkError)

      expect(await mgr.hasCredentials()).toBe(false)
    })
  })
})

// --- FileTokenStorage ---

describe('FileTokenStorage', () => {
  it('returns null for missing file', async () => {
    const s = new FileTokenStorage('/tmp/nonexistent-amigo-test-' + Date.now() + '/creds.json')
    expect(await s.load()).toBeNull()
  })

  it('round-trips via temp file', async () => {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const path = await import('node:path')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sdk-test-'))
    const filePath = path.join(dir, 'creds.json')
    try {
      const s = new FileTokenStorage(filePath)
      const creds = {
        access_token: 'at',
        refresh_token: 'rt',
        workspace_id: 'ws',
        expires_at: 1700000000,
      }
      await s.save(creds)
      expect(await s.load()).toEqual(creds)
      await s.clear()
      expect(await s.load()).toBeNull()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

// --- MemoryTokenStorage ---

describe('MemoryTokenStorage', () => {
  it('round-trips', async () => {
    const s = new MemoryTokenStorage()
    expect(await s.load()).toBeNull()
    const creds = {
      access_token: 'at',
      refresh_token: 'rt',
      workspace_id: 'ws',
      expires_at: 1700000000,
    }
    await s.save(creds)
    expect(await s.load()).toEqual(creds)
    await s.clear()
    expect(await s.load()).toBeNull()
  })
})

// --- CLI helpers ---

describe('formatDeviceCodeInstructions', () => {
  it('includes verification URI and user code', () => {
    const text = formatDeviceCodeInstructions(ISSUANCE)
    expect(text).toContain(ISSUANCE.verification_uri)
    expect(text).toContain(ISSUANCE.user_code)
    expect(text).toContain('15 minutes')
  })
})

describe('formatWorkspaceList', () => {
  it('formats numbered list with names and roles', () => {
    const text = formatWorkspaceList([
      { workspace_id: 'ws-1', name: 'Org One', role: 'admin' },
      { workspace_id: 'ws-2', name: 'Org Two' },
    ])
    expect(text).toContain('1. Org One (admin)')
    expect(text).toContain('2. Org Two')
    expect(text).toContain('ws-1')
  })

  it('falls back to workspace_id when name is absent', () => {
    const text = formatWorkspaceList([{ workspace_id: 'ws-no-name' }])
    expect(text).toContain('1. ws-no-name')
  })
})

// --- formatDeviceCodeLink ---

describe('formatDeviceCodeLink', () => {
  it('returns OSC 8 hyperlink', () => {
    const link = formatDeviceCodeLink(ISSUANCE)
    expect(link).toContain(ISSUANCE.verification_uri_complete)
    expect(link).toContain('\x1b]8;;')
  })
})

// --- openBrowser ---

describe('openBrowser', () => {
  it('returns false on unsupported platform', async () => {
    const desc = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true })
    try {
      expect(await openBrowser('https://example.com')).toBe(false)
    } finally {
      Object.defineProperty(process, 'platform', desc)
    }
  })

  it('returns boolean on current platform', async () => {
    const result = await openBrowser('https://example.com')
    expect(typeof result).toBe('boolean')
  })
})

// --- redirect: manual ---

describe('identity requests use redirect: manual', () => {
  it('fetch is called with redirect manual to observe HTTP 300', async () => {
    const fetch = createFetchSequence([
      { status: 200, body: ISSUANCE },
      { status: 200, body: TOKEN },
    ])

    await loginWithDeviceCode({
      onCode: vi.fn(),
      workspaceId: 'ws1',
      onWorkspaceRequired: vi.fn(),
      fetch,
      identityBaseUrl: 'https://id.test',
    })

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
    for (const call of calls) {
      expect(call[1]!.redirect).toBe('manual')
    }
  })
})

// --- Network errors ---

describe('network errors', () => {
  it('loginWithDeviceCode throws NetworkError on fetch failure', async () => {
    await expect(
      loginWithDeviceCode({
        onCode: vi.fn(),
        workspaceId: 'ws1',
        onWorkspaceRequired: vi.fn(),
        fetch: vi.fn().mockRejectedValue(new TypeError('fetch failed')),
        identityBaseUrl: 'https://id.test',
      }),
    ).rejects.toThrow(NetworkError)
  })
})

// --- Rate limiting ---

describe('rate limiting', () => {
  it('loginWithDeviceCode throws RateLimitError on 429', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
      headers: new Headers({ 'Retry-After': '30' }),
      json: vi.fn().mockResolvedValue({ error: 'slow_down' }),
    })
    await expect(
      loginWithDeviceCode({
        onCode: vi.fn(),
        workspaceId: 'ws1',
        onWorkspaceRequired: vi.fn(),
        fetch,
        identityBaseUrl: 'https://id.test',
      }),
    ).rejects.toThrow(RateLimitError)
  })
})

// --- Token missing workspace_id ---

describe('toAuthResult edge cases', () => {
  it('resolves to the pinned workspace even when the polled token is a bootstrap token', async () => {
    // With workspaceId pinned, a bootstrap token (no workspace claim) is
    // exchanged for a token scoped to the pinned workspace — the flow never
    // dead-ends on a missing workspace_id anymore.
    const bootstrap = {
      access_token: makeJwt({ sub: 'e1', workspace_bootstrap: true, exp: 9999999999 }),
      token_type: 'Bearer',
      expires_in: 900,
      scope: 'ws:read',
      refresh_token: 'rt_boot',
    }
    const scoped = {
      access_token: makeJwt({ sub: 'e1', workspace_id: 'ws1', exp: 9999999999 }),
      token_type: 'Bearer',
      expires_in: 900,
      scope: 'ws:read',
      refresh_token: 'rt_scoped',
    }
    const result = await loginWithDeviceCode({
      onCode: vi.fn(),
      workspaceId: 'ws1',
      fetch: createFetchSequence([
        { status: 200, body: ISSUANCE },
        { status: 200, body: bootstrap },
        { status: 200, body: scoped },
      ]),
      identityBaseUrl: 'https://id.test',
    })
    expect(result.workspaceId).toBe('ws1')
  })

  it('throws when a multi-workspace response has no workspace picker', async () => {
    // workspaceId is pinned, so identity won't 300 in practice; but if a
    // legacy/un-pinned 300 slips through without onWorkspaceRequired, fail loud.
    await expect(
      loginWithDeviceCode({
        onCode: vi.fn(),
        workspaceId: 'ws1',
        fetch: createFetchSequence([
          { status: 200, body: ISSUANCE },
          {
            status: 300,
            body: {
              error: 'workspace_selection_required',
              workspaces: [{ workspace_id: 'ws-a' }, { workspace_id: 'ws-b' }],
              refresh_token: 'rt_boot',
            },
          },
        ]),
        identityBaseUrl: 'https://id.test',
      }),
      // Assert the specific failure, not just "some AmigoError", so a
      // regression to a different throw (e.g. TypeError) is caught.
    ).rejects.toThrow(/multiple workspaces/i)
  })
})

// --- TokenManager: no refresh token ---

describe('TokenManager edge cases', () => {
  it('throws RefreshTokenExpiredError when no refresh token', async () => {
    const storage = new MemoryTokenStorage()
    const mgr = new TokenManager({ storage })
    await mgr.store({
      accessToken: makeJwt({
        sub: 'e1',
        workspace_id: 'ws1',
        exp: Math.floor(Date.now() / 1000) + 10,
      }),
      refreshToken: '',
      workspaceId: 'ws1',
      expiresAt: Math.floor(Date.now() / 1000) + 10,
    })
    await expect(mgr.getAccessToken()).rejects.toThrow(RefreshTokenExpiredError)
  })
})

// --- FileTokenStorage: clear nonexistent is idempotent ---

describe('FileTokenStorage edge cases', () => {
  it('clear on nonexistent file does not throw', async () => {
    const s = new FileTokenStorage('/tmp/nonexistent-amigo-test-' + Date.now() + '/creds.json')
    await s.clear()
  })

  it('load returns null for valid JSON missing required fields', async () => {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const path = await import('node:path')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sdk-test-'))
    const filePath = path.join(dir, 'creds.json')
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, JSON.stringify({ access_token: 'only' }))
      const s = new FileTokenStorage(filePath)
      expect(await s.load()).toBeNull()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
