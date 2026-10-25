/**
 * RFC 8628 Device Authorization Grant for desktop and CLI apps.
 *
 * Authenticates users via the identity service's device code flow:
 * the app displays a code, the user approves in their browser,
 * and the app receives a workspace-scoped JWT.
 */

import { AmigoError, AuthenticationError, NetworkError, RateLimitError } from './errors.js'
import { trimTrailingSlashes } from './url.js'

// --- Types ---

export interface DeviceCodeIssuance {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

export interface IdentityTokenResponse {
  access_token: string
  token_type: 'Bearer' | 'DPoP'
  expires_in: number
  scope: string
  session_id?: string
  refresh_token?: string
}

export interface WorkspaceChoice {
  workspace_id: string
  role?: string
  name?: string
}

export interface MultiWorkspaceResponse {
  error: 'workspace_selection_required'
  workspaces: WorkspaceChoice[]
  access_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
  refresh_token?: string
}

export type DeviceCodeStatus =
  | 'authorization_pending'
  | 'polling'
  | 'approved'
  | 'expired'
  | 'denied'
  | 'slow_down'

export interface DeviceCodeLoginOptions {
  /** Identity service base URL. Default: https://identity.api-us.concurrence.com */
  identityBaseUrl?: string
  /**
   * Workspace this device login targets. Required: the device code is pinned
   * to this workspace at issuance, the browser approver must hold a session
   * scoped to it, and the token returned to the CLI is scoped to it.
   */
  workspaceId: string
  /** Client description for audit logs */
  clientDescription?: string
  /** OAuth scope to request */
  scope?: string
  /** Called when device code is issued — display instructions to user */
  onCode: (issuance: DeviceCodeIssuance) => void | Promise<void>
  /** Called with polling status updates */
  onStatus?: (status: DeviceCodeStatus) => void
  /**
   * Fallback workspace picker for legacy / un-pinned device codes only.
   * With `workspaceId` pinned (now required), identity returns a
   * workspace-scoped token directly and this is never invoked.
   * @deprecated Pass `workspaceId`; this will be removed in a future release.
   */
  onWorkspaceRequired?: (workspaces: WorkspaceChoice[]) => Promise<string>
  /** AbortSignal to cancel the login flow */
  signal?: AbortSignal
  /** Custom fetch implementation */
  fetch?: typeof globalThis.fetch
}

export interface AuthResult {
  accessToken: string
  refreshToken: string
  workspaceId: string
  expiresAt: number
  scope?: string
}

export interface StoredCredentials {
  access_token: string
  refresh_token: string
  workspace_id: string
  expires_at: number
  scope?: string
  identity_base_url?: string
}

export interface TokenStorage {
  load(): Promise<StoredCredentials | null>
  save(credentials: StoredCredentials): Promise<void>
  clear(): Promise<void>
}

// --- Errors ---

export class DeviceCodeExpiredError extends AmigoError {
  constructor(message = 'Device code expired. Please restart the login flow.') {
    super(message, { errorCode: 'device_code_expired' })
  }
}

export class DeviceCodeDeniedError extends AmigoError {
  constructor(message = 'Authorization request was denied.') {
    super(message, { errorCode: 'device_code_denied' })
  }
}

export class RefreshTokenExpiredError extends AuthenticationError {
  constructor(message = 'Refresh token expired. Please log in again.') {
    super(message, { errorCode: 'refresh_token_expired' })
  }
}

export class LoginCancelledError extends AmigoError {
  constructor() {
    super('Login cancelled', { errorCode: 'login_cancelled' })
  }
}

// --- Identity Client ---

// Identity has its own host; platform.api-us.concurrence.com does not route /device or /token.
export const DEFAULT_IDENTITY_URL = 'https://identity.api-us.concurrence.com'

async function identityPost(
  baseUrl: string,
  path: string,
  body: URLSearchParams,
  fetchFn: typeof globalThis.fetch,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    // redirect: 'manual' is required because the identity service uses HTTP 300
    // (non-standard) for multi-workspace selection. Without it, fetch follows
    // the redirect automatically and the caller never sees the 300.
    return await fetchFn(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'manual',
      signal,
    })
  } catch (err) {
    throw new NetworkError('Network error contacting identity service', err)
  }
}

async function requestDeviceCode(
  baseUrl: string,
  params: { clientDescription?: string; scope?: string; workspaceId: string },
  fetchFn: typeof globalThis.fetch,
): Promise<DeviceCodeIssuance> {
  const body = new URLSearchParams()
  if (params.clientDescription) body.set('client_description', params.clientDescription)
  if (params.scope) body.set('scope', params.scope)
  // Pin the workspace at issuance so identity binds the code to it: the
  // approver must be scoped to this workspace and the resulting token is too.
  body.set('workspace_id', params.workspaceId)

  const res = await identityPost(baseUrl, '/device/code', body, fetchFn)

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '', 10)
    throw new RateLimitError('Rate limited', {
      retryAfter: isNaN(retryAfter) ? undefined : retryAfter,
    })
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, string>
    throw new AmigoError(err.error_description ?? `Identity error (${res.status})`, {
      statusCode: res.status,
      errorCode: err.error,
    })
  }
  return (await res.json()) as DeviceCodeIssuance
}

type PollResult =
  | { type: 'token'; data: IdentityTokenResponse }
  | { type: 'multi_workspace'; data: MultiWorkspaceResponse }
  | { type: 'pending' }
  | { type: 'slow_down' }

async function pollDeviceCode(
  baseUrl: string,
  deviceCode: string,
  scope: string | undefined,
  workspaceId: string | undefined,
  fetchFn: typeof globalThis.fetch,
): Promise<PollResult> {
  const body = new URLSearchParams({ grant_type: 'device_code', device_code: deviceCode })
  if (scope) body.set('scope', scope)
  if (workspaceId) body.set('workspace_id', workspaceId)

  const res = await identityPost(baseUrl, '/token', body, fetchFn)

  if (res.status === 300)
    return { type: 'multi_workspace', data: (await res.json()) as MultiWorkspaceResponse }
  if (res.status === 200)
    return { type: 'token', data: (await res.json()) as IdentityTokenResponse }

  if (res.status === 400) {
    const err = (await res.json().catch(() => ({ error: 'unknown' }))) as Record<string, string>
    if (err.error === 'authorization_pending') return { type: 'pending' }
    if (err.error === 'slow_down') return { type: 'slow_down' }
    throw new AmigoError(err.error_description ?? err.error ?? `Identity error (400)`, {
      statusCode: 400,
      errorCode: err.error,
    })
  }

  throw new AmigoError(`Identity error (${res.status})`, { statusCode: res.status })
}

async function doRefreshToken(
  baseUrl: string,
  params: { refreshToken: string; workspaceId?: string; scope?: string },
  fetchFn: typeof globalThis.fetch,
  signal?: AbortSignal,
): Promise<IdentityTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
  })
  if (params.workspaceId) body.set('workspace_id', params.workspaceId)
  if (params.scope) body.set('scope', params.scope)

  const res = await identityPost(baseUrl, '/token', body, fetchFn, signal)

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, string>
    throw new AmigoError(err.error_description ?? `Identity error (${res.status})`, {
      statusCode: res.status,
      errorCode: err.error,
    })
  }
  return (await res.json()) as IdentityTokenResponse
}

const REVOKE_TIMEOUT_MS = 5_000

// RFC 7009: identity answers 200 for any token it is given, so a non-2xx means the
// revoke did not happen. A 5xx (identity's session store being down) is tried once more.
async function revokeToken(
  baseUrl: string,
  params: { token: string; tokenTypeHint: 'access_token' | 'refresh_token' },
  fetchFn: typeof globalThis.fetch,
): Promise<void> {
  const body = new URLSearchParams({ token: params.token, token_type_hint: params.tokenTypeHint })
  const post = () =>
    identityPost(baseUrl, '/revoke', body, fetchFn, AbortSignal.timeout(REVOKE_TIMEOUT_MS))
  let res = await post()
  if (res.status >= 500) res = await post()
  if (!res.ok) {
    throw new AmigoError(`Identity could not revoke the ${params.tokenTypeHint} (${res.status})`, {
      statusCode: res.status,
    })
  }
}

// --- JWT decode (no verification — server validates) ---

export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3 || !parts[1]) return null
    const payload = Buffer.from(parts[1], 'base64url').toString()
    return JSON.parse(payload) as Record<string, unknown>
  } catch {
    return null
  }
}

// --- Device Code Login ---

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new LoginCancelledError())
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new LoginCancelledError())
      },
      { once: true },
    )
  })
}

function toAuthResult(token: IdentityTokenResponse, workspaceIdOverride?: string): AuthResult {
  const claims = decodeJwtPayload(token.access_token)
  const workspaceId = workspaceIdOverride ?? (claims?.workspace_id as string) ?? ''
  if (!workspaceId) {
    throw new AmigoError('Token does not contain a workspace_id claim', {
      errorCode: 'missing_workspace',
    })
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? '',
    workspaceId,
    expiresAt:
      (claims?.exp as number) ??
      (token.expires_in
        ? Math.floor(Date.now() / 1000) + token.expires_in
        : Math.floor(Date.now() / 1000) + 900),
    scope: token.scope,
  }
}

async function fetchWorkspaces(
  baseUrl: string,
  accessToken: string,
  fetchFn: typeof globalThis.fetch,
): Promise<WorkspaceChoice[]> {
  // Try /self/profile first (identity service direct route)
  for (const path of ['/self/profile', '/self']) {
    const res = await fetchFn(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) {
      const data = (await res.json()) as {
        workspaces?: Array<{ workspace_id: string; role?: string; name?: string }>
      }
      return (data.workspaces ?? []).map((ws) => ({
        workspace_id: ws.workspace_id,
        role: ws.role,
        name: ws.name,
      }))
    }
    if (res.status !== 404) {
      throw new AmigoError(`Failed to fetch workspaces (${res.status})`, { statusCode: res.status })
    }
  }
  return []
}

async function pickWorkspace(
  options: DeviceCodeLoginOptions,
  workspaces: WorkspaceChoice[],
): Promise<string> {
  // Reached only for legacy / un-pinned device codes that resolve to more
  // than one workspace. With `workspaceId` pinned (now required) identity
  // returns a scoped token directly and this is never hit.
  if (!options.onWorkspaceRequired) {
    throw new AmigoError(
      `Identity returned multiple workspaces despite workspaceId being set. Supply 'onWorkspaceRequired' as a legacy fallback, or report a server-side issue.`,
      { errorCode: 'workspace_selection_required' },
    )
  }
  return options.onWorkspaceRequired(workspaces)
}

async function resolveWorkspaceFromBootstrap(
  baseUrl: string,
  token: IdentityTokenResponse,
  options: DeviceCodeLoginOptions,
  fetchFn: typeof globalThis.fetch,
): Promise<AuthResult> {
  if (!token.refresh_token) {
    throw new AmigoError('Bootstrap token missing refresh_token', { errorCode: 'server_error' })
  }

  const workspaces = await fetchWorkspaces(baseUrl, token.access_token, fetchFn)

  if (workspaces.length === 0) {
    throw new AmigoError(
      'No workspace memberships found. Create a workspace or request an invitation.',
      { errorCode: 'no_workspaces' },
    )
  }

  if (workspaces.length === 1 && workspaces[0]) {
    const scoped = await doRefreshToken(
      baseUrl,
      {
        refreshToken: token.refresh_token,
        workspaceId: workspaces[0].workspace_id,
        scope: options.scope,
      },
      fetchFn,
    )
    return toAuthResult(scoped, workspaces[0].workspace_id)
  }

  const workspaceId = await pickWorkspace(options, workspaces)
  const scoped = await doRefreshToken(
    baseUrl,
    { refreshToken: token.refresh_token, workspaceId, scope: options.scope },
    fetchFn,
  )
  return toAuthResult(scoped, workspaceId)
}

async function resolveWorkspaceFromMulti(
  baseUrl: string,
  multi: MultiWorkspaceResponse,
  options: DeviceCodeLoginOptions,
  fetchFn: typeof globalThis.fetch,
): Promise<AuthResult> {
  if (!multi.refresh_token) {
    throw new AmigoError('Multi-workspace response missing refresh_token', {
      errorCode: 'server_error',
    })
  }

  const workspaceId = await pickWorkspace(options, multi.workspaces)
  const scoped = await doRefreshToken(
    baseUrl,
    { refreshToken: multi.refresh_token, workspaceId, scope: options.scope },
    fetchFn,
  )
  return toAuthResult(scoped, workspaceId)
}

export async function loginWithDeviceCode(options: DeviceCodeLoginOptions): Promise<AuthResult> {
  const baseUrl = trimTrailingSlashes(options.identityBaseUrl ?? DEFAULT_IDENTITY_URL)
  const fetchFn = options.fetch ?? globalThis.fetch

  const issuance = await requestDeviceCode(
    baseUrl,
    {
      clientDescription: options.clientDescription,
      scope: options.scope,
      workspaceId: options.workspaceId,
    },
    fetchFn,
  )

  await options.onCode(issuance)

  // Poll loop
  let interval = issuance.interval * 1000
  const deadline = Date.now() + issuance.expires_in * 1000

  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new LoginCancelledError()

    await sleep(interval, options.signal)

    if (options.signal?.aborted) throw new LoginCancelledError()

    options.onStatus?.('polling')

    try {
      const result = await pollDeviceCode(
        baseUrl,
        issuance.device_code,
        options.scope,
        options.workspaceId,
        fetchFn,
      )

      if (result.type === 'pending') {
        options.onStatus?.('authorization_pending')
        continue
      }

      // RFC 8628 §3.5: increase interval by 5 seconds on slow_down
      if (result.type === 'slow_down') {
        interval += 5000
        options.onStatus?.('slow_down')
        continue
      }

      options.onStatus?.('approved')

      if (result.type === 'token') {
        const claims = decodeJwtPayload(result.data.access_token)
        const isBootstrap = claims?.workspace_bootstrap || !claims?.workspace_id
        if (isBootstrap && result.data.refresh_token) {
          // Bootstrap token — need workspace selection via refresh_token exchange
          if (options.workspaceId) {
            const scoped = await doRefreshToken(
              baseUrl,
              {
                refreshToken: result.data.refresh_token,
                workspaceId: options.workspaceId,
                scope: options.scope,
              },
              fetchFn,
            )
            return toAuthResult(scoped, options.workspaceId)
          }
          return await resolveWorkspaceFromBootstrap(baseUrl, result.data, options, fetchFn)
        }
        return toAuthResult(result.data)
      }

      // multi_workspace (HTTP 300) — workspace list included in response
      return await resolveWorkspaceFromMulti(baseUrl, result.data, options, fetchFn)
    } catch (err) {
      if (err instanceof AmigoError && err.errorCode === 'expired_token') {
        options.onStatus?.('expired')
        throw new DeviceCodeExpiredError()
      }
      if (err instanceof AmigoError && err.errorCode === 'access_denied') {
        options.onStatus?.('denied')
        throw new DeviceCodeDeniedError()
      }
      throw err
    }
  }

  options.onStatus?.('expired')
  throw new DeviceCodeExpiredError()
}

// --- Token Manager ---

const REFRESH_BUFFER_SECONDS = 60
const REFRESH_TIMEOUT_MS = 30_000

export interface TokenManagerConfig {
  storage?: TokenStorage
  identityBaseUrl?: string
  fetch?: typeof globalThis.fetch
}

export class TokenManager {
  private readonly _storage: TokenStorage
  private readonly _baseUrl: string
  private readonly _fetch: typeof globalThis.fetch
  private _cached: StoredCredentials | null = null
  private _refreshPromise: Promise<StoredCredentials> | null = null
  private _refreshGeneration = -1
  private _signOutPromise: Promise<void> | null = null
  private _generation = 0
  private _storageQueue: Promise<void> = Promise.resolve()

  constructor(config: TokenManagerConfig = {}) {
    this._storage = config.storage ?? new FileTokenStorage()
    this._baseUrl = trimTrailingSlashes(config.identityBaseUrl ?? DEFAULT_IDENTITY_URL)
    this._fetch = config.fetch ?? globalThis.fetch
  }

  async store(result: AuthResult): Promise<void> {
    // An explicit new sign-in starts after any previous sign-out has settled.
    if (this._signOutPromise) await this._signOutPromise.catch(() => undefined)
    this._generation += 1
    const creds: StoredCredentials = {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      workspace_id: result.workspaceId,
      expires_at: result.expiresAt,
      scope: result.scope,
    }
    this._cached = creds
    await this._useStorage(() => this._storage.save(creds))
  }

  async getAccessToken(): Promise<{ token: string; workspaceId: string } | null> {
    if (this._signOutPromise) return null
    const generation = this._generation
    const creds = await this._loadCached()
    if (!creds || this._signOutPromise || generation !== this._generation) return null
    if (creds.expires_at - Math.floor(Date.now() / 1000) >= REFRESH_BUFFER_SECONDS) {
      return { token: creds.access_token, workspaceId: creds.workspace_id }
    }
    const refreshed = await this._refresh(creds)
    if (this._signOutPromise || generation !== this._generation) return null
    return { token: refreshed.access_token, workspaceId: refreshed.workspace_id }
  }

  async hasCredentials(): Promise<boolean> {
    if (this._signOutPromise) return false
    return (await this._loadCached()) !== null
  }

  /** Forgets the credentials on this machine only. The tokens stay valid at identity until they expire; use `signOut()` to end the session. */
  async clear(): Promise<void> {
    this._generation += 1
    this._cached = null
    await this._useStorage(() => this._storage.clear())
  }

  /**
   * Requests revocation of the refresh token and access token at Identity, then
   * forgets them locally. The credentials are cleared even when a request fails, and the
   * call then rejects, so the caller knows the tokens may still be live.
   * A successful response confirms request acceptance, not immediate inactivity at
   * every token consumer.
   * Services that validate JWTs locally can keep accepting previously issued access
   * tokens until expiry; sign-out does not guarantee immediate revocation everywhere.
   */
  signOut(): Promise<void> {
    if (this._signOutPromise) return this._signOutPromise
    const refreshing = this._refreshGeneration === this._generation ? this._refreshPromise : null
    this._generation += 1
    this._signOutPromise = this._doSignOut(refreshing).finally(() => {
      this._signOutPromise = null
    })
    return this._signOutPromise
  }

  private async _doSignOut(refreshing: Promise<StoredCredentials> | null): Promise<void> {
    // Capture before awaiting storage: an existing refresh can finish during a
    // load. Joining includes its storage save, so it cannot restore credentials
    // after the final clear. New refreshes are refused by getAccessToken().
    try {
      // Reserve a cold-cache snapshot before any concurrently requested clear.
      // The snapshot authorizes revocation only; it never repopulates the cache.
      const current = this._cached ?? (await this._useStorage(() => this._storage.load()))
      const refreshed = refreshing ? await refreshing.catch(() => null) : null
      const revocations = new Map<string, 'refresh_token' | 'access_token'>()
      for (const creds of [current, refreshed]) {
        if (creds?.refresh_token) revocations.set(creds.refresh_token, 'refresh_token')
        if (creds?.access_token) revocations.set(creds.access_token, 'access_token')
      }
      const results = await Promise.allSettled(
        [...revocations].map(([token, tokenTypeHint]) =>
          revokeToken(this._baseUrl, { token, tokenTypeHint }, this._fetch),
        ),
      )
      const failed = results.find((result) => result.status === 'rejected')
      if (failed) throw failed.reason
    } finally {
      await this.clear()
    }
  }

  private async _loadCached(): Promise<StoredCredentials | null> {
    if (this._cached) return this._cached
    const generation = this._generation
    await this._storageQueue
    if (generation !== this._generation) return null
    const loaded = await this._storage.load()
    if (generation !== this._generation) return null
    if (loaded) this._cached = loaded
    return loaded
  }

  private async _refresh(current: StoredCredentials): Promise<StoredCredentials> {
    if (this._refreshPromise && this._refreshGeneration === this._generation) {
      return this._refreshPromise
    }
    this._refreshGeneration = this._generation
    const refreshing = this._doRefresh(current).finally(() => {
      if (this._refreshPromise === refreshing) this._refreshPromise = null
    })
    this._refreshPromise = refreshing
    return refreshing
  }

  private _useStorage<T>(operation: () => Promise<T>): Promise<T> {
    // Clear must follow every save already in progress, including an explicit
    // store(). Keep the queue usable after an error while returning that error
    // to the initiating operation.
    const pending = this._storageQueue.then(operation)
    this._storageQueue = pending.then(
      () => undefined,
      () => undefined,
    )
    return pending
  }

  private async _doRefresh(current: StoredCredentials): Promise<StoredCredentials> {
    if (!current.refresh_token) throw new RefreshTokenExpiredError('No refresh token available')
    const generation = this._generation

    try {
      const response = await doRefreshToken(
        this._baseUrl,
        {
          refreshToken: current.refresh_token,
          workspaceId: current.workspace_id,
          scope: current.scope,
        },
        this._fetch,
        AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      )
      const claims = decodeJwtPayload(response.access_token)
      const refreshed: StoredCredentials = {
        access_token: response.access_token,
        refresh_token: response.refresh_token ?? current.refresh_token,
        workspace_id: current.workspace_id,
        expires_at: (claims?.exp as number) ?? Math.floor(Date.now() / 1000) + response.expires_in,
        scope: response.scope ?? current.scope,
      }
      if (generation === this._generation) {
        this._cached = refreshed
        await this._useStorage(() => this._storage.save(refreshed))
      }
      return refreshed
    } catch (err) {
      if (
        err instanceof AmigoError &&
        (err.statusCode === 401 || err.errorCode === 'invalid_grant')
      ) {
        if (generation === this._generation) await this.clear()
        throw new RefreshTokenExpiredError()
      }
      throw err
    }
  }
}

// --- Token Storage ---

export class FileTokenStorage implements TokenStorage {
  private readonly _explicitPath: string | undefined
  private _resolvedPath: string | undefined

  constructor(filePath?: string) {
    this._explicitPath = filePath
  }

  private async _filePath(): Promise<string> {
    if (this._explicitPath) return this._explicitPath
    if (this._resolvedPath) return this._resolvedPath
    const os = await import('node:os')
    const path = await import('node:path')
    this._resolvedPath = path.join(os.homedir(), '.amigo', 'credentials.json')
    return this._resolvedPath
  }

  async load(): Promise<StoredCredentials | null> {
    const fs = await import('node:fs/promises')
    const filePath = await this._filePath()
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const data = JSON.parse(raw)
      if (
        typeof data.access_token === 'string' &&
        typeof data.refresh_token === 'string' &&
        typeof data.workspace_id === 'string' &&
        typeof data.expires_at === 'number'
      ) {
        return data as StoredCredentials
      }
      return null
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return null
      throw err
    }
  }

  async save(credentials: StoredCredentials): Promise<void> {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const filePath = await this._filePath()
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    await fs.writeFile(filePath, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 })
    await fs.chmod(filePath, 0o600)
  }

  async clear(): Promise<void> {
    const fs = await import('node:fs/promises')
    const filePath = await this._filePath()
    try {
      await fs.unlink(filePath)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return
      throw err
    }
  }
}

export class MemoryTokenStorage implements TokenStorage {
  private _credentials: StoredCredentials | null = null
  async load(): Promise<StoredCredentials | null> {
    return this._credentials
  }
  async save(credentials: StoredCredentials): Promise<void> {
    this._credentials = { ...credentials }
  }
  async clear(): Promise<void> {
    this._credentials = null
  }
}

// --- CLI Helpers ---

export function formatDeviceCodeInstructions(issuance: DeviceCodeIssuance): string {
  return [
    '',
    '  To sign in, open your browser and visit:',
    '',
    `    ${issuance.verification_uri}`,
    '',
    '  Then enter this code:',
    '',
    `    ${issuance.user_code}`,
    '',
    `  This code expires in ${Math.floor(issuance.expires_in / 60)} minutes.`,
    '',
  ].join('\n')
}

export function formatDeviceCodeLink(issuance: DeviceCodeIssuance): string {
  return `\x1b]8;;${issuance.verification_uri_complete}\x07Open browser to approve\x1b]8;;\x07`
}

export async function openBrowser(url: string): Promise<boolean> {
  const { spawn } = await import('node:child_process')

  const openers: Record<string, { cmd: string; args: string[] }> = {
    darwin: { cmd: 'open', args: [url] },
    win32: { cmd: 'cmd', args: ['/c', 'start', '', url] },
    linux: { cmd: 'xdg-open', args: [url] },
  }

  const opener = openers[process.platform]
  if (!opener) return false

  return new Promise((resolve) => {
    // shell: false prevents command injection from malformed URLs
    const child = spawn(opener.cmd, opener.args, { stdio: 'ignore', shell: false, detached: true })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
    child.unref()
  })
}

export function formatWorkspaceList(workspaces: WorkspaceChoice[]): string {
  const lines = ['', '  Available workspaces:', '']
  workspaces.forEach((ws, i) => {
    const name = ws.name ?? ws.workspace_id
    const role = ws.role ? ` (${ws.role})` : ''
    lines.push(`    ${i + 1}. ${name}${role}`)
    if (ws.name) lines.push(`       ${ws.workspace_id}`)
  })
  lines.push('')
  return lines.join('\n')
}
