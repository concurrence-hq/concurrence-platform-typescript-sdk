import type { Middleware } from 'openapi-fetch'
import {
  AmigoError,
  ConfigurationError,
  NetworkError,
  ParseError,
  RequestTimeoutError,
} from '../../core/errors.js'
import { scopePlatformClient, WorkspaceScopedResource, extractData } from '../base.js'

const POLICY_ERRORS = new Set([
  'policy_changed',
  'disable_required_policy_first',
  'policy_configuration_required',
  'credential_inventory_changed',
  'credential_inventory_incomplete',
  'policy_not_ready',
  'readiness_expired',
])

async function knownPolicyError(response: Response): Promise<string | undefined> {
  const reader = response.body?.getReader()
  if (!reader) return undefined
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  const deadline = setTimeout(() => {
    void reader.cancel().catch(() => undefined)
  }, 1000)
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 4096) {
        void reader.cancel().catch(() => undefined)
        return undefined
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    const body: unknown = JSON.parse(text + decoder.decode())
    if (
      body &&
      typeof body === 'object' &&
      'detail' in body &&
      typeof body.detail === 'string' &&
      POLICY_ERRORS.has(body.detail)
    ) {
      return body.detail
    }
  } catch {
    // Provider payloads and malformed responses are never diagnostic error data.
  } finally {
    clearTimeout(deadline)
    reader.releaseLock()
  }
  return undefined
}

const secretSafeErrors: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return response
    const detail = (await knownPolicyError(response)) ?? 'Identity request failed'
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    for (const name of ['retry-after', 'x-request-id']) {
      const value = response.headers.get(name)
      if (value) headers.set(name, value)
    }
    return new Response(response.status === 304 ? null : JSON.stringify({ detail }), {
      status: response.status,
      headers,
    })
  },
  onError({ error }) {
    return error instanceof RequestTimeoutError
      ? new RequestTimeoutError('Identity request timed out', error.timeoutMs)
      : new NetworkError('Identity request could not be confirmed')
  },
}

const omitCredentials: Middleware = {
  onRequest({ request }) {
    request.headers.delete('authorization')
    request.headers.delete('cookie')
    request.headers.delete('proxy-authorization')
    return request
  },
}

type IdentityMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type IdentityRequestOptions = { anonymous?: boolean; query?: Record<string, unknown> }

/** Common Identity transport: separate origin, secret-safe failures and no write retries. */
abstract class IdentityTransport extends WorkspaceScopedResource {
  protected async identityRequest<T>(
    method: IdentityMethod,
    path: string,
    body?: unknown,
    options: IdentityRequestOptions = {},
  ): Promise<T> {
    // Fixed method safety wins over client defaults and scoped retry options.
    // Consuming writes cannot be repeated after a timeout or Retry-After response.
    const client =
      method === 'GET' ? this.client : scopePlatformClient(this.client, { maxRetries: 0 })
    try {
      return extractData(
        await client.request(
          method as never,
          path as never,
          {
            baseUrl: this.identityBaseUrl,
            body,
            params: { query: options.query },
            cache: 'no-store',
            redirect: 'error',
            credentials: options.anonymous ? 'omit' : 'same-origin',
            middleware: [secretSafeErrors, ...(options.anonymous ? [omitCredentials] : [])],
          } as never,
        ),
      ) as T
    } catch (error) {
      if (error instanceof AmigoError) throw error
      throw new ParseError('Identity response could not be read')
    }
  }
}

/** Shared workspace-scoped Identity administration transport. */
export abstract class IdentityResource extends IdentityTransport {
  protected request<T>(
    method: IdentityMethod,
    suffix: string,
    body?: unknown,
    options: IdentityRequestOptions = {},
  ): Promise<T> {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(this.workspaceId)) {
      return Promise.reject(
        new ConfigurationError('Identity administration requires a valid workspace UUID'),
      )
    }
    return this.identityRequest(
      method,
      `/${options.anonymous ? 'auth' : 'admin'}/workspaces/${this.workspaceId}/${suffix}`,
      body,
      options,
    )
  }
}

/** Generic administration endpoints carry workspace authority in their request or resource. */
export abstract class IdentityAdminResource extends IdentityTransport {
  protected request<T>(
    method: IdentityMethod,
    suffix: string,
    body?: unknown,
    options: { query?: Record<string, unknown> } = {},
  ): Promise<T> {
    return this.identityRequest(method, `/admin/${suffix}`, body, options)
  }
}
