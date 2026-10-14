/**
 * Creates a configured openapi-fetch client with auth, error handling,
 * and retry middleware.
 *
 * Supports custom `fetch` for BFF proxy patterns (e.g., developer-console
 * routing through Next.js API routes).
 */

import createClientImport, { type HeadersOptions, type Middleware } from 'openapi-fetch'
import type { paths } from '../generated/api.js'
import { createAuthMiddleware } from './auth.js'
import { createApiError, ConfigurationError, NetworkError, RequestTimeoutError } from './errors.js'
import { parseRateLimitHeaders } from './rate-limit.js'
import {
  stripRequestControls,
  type AmigoRequestOptions,
  type RequestControlOptions,
} from './request-options.js'
import { shouldRetry, computeDelay, resolveRetryOptions, type RetryOptions } from './retry.js'
import { extractRequestId } from './utils.js'

// Handle ESM/CJS interop for openapi-fetch (esbuild __toESM wrapper)
const createClient: typeof createClientImport =
  typeof createClientImport === 'function'
    ? createClientImport
    : (createClientImport as unknown as { default: typeof createClientImport }).default

export type PlatformFetch = ReturnType<typeof createClient<paths>>

export interface RequestHookContext {
  id: string
  request: Request
  schemaPath: string
}

export interface ResponseHookContext extends RequestHookContext {
  response: Response
  requestId: string | null
  rateLimit: ReturnType<typeof parseRateLimitHeaders>
}

export interface ErrorHookContext extends RequestHookContext {
  error: unknown
}

export interface ClientHooks {
  onRequest?: (context: RequestHookContext) => void | Promise<void>
  onResponse?: (context: ResponseHookContext) => void | Promise<void>
  onError?: (context: ErrorHookContext) => void | Promise<void>
}

export interface ClientConfig {
  apiKey: string
  baseUrl: string
  /** Identity service base URL. `client.tokens` sends `POST /token` here. */
  identityBaseUrl: string
  retry?: RetryOptions
  maxRetries?: number
  timeout?: number
  headers?: HeadersOptions
  hooks?: ClientHooks
  /** Custom fetch implementation — use for BFF proxy routing or test mocking. */
  fetch?: typeof globalThis.fetch
}

type RequestTransport = (input: Request) => Promise<Response>

interface PlatformClientContext {
  transport: RequestTransport
  defaults: RequestControlOptions
  baseUrl: string
  identityBaseUrl: string
}

const platformClientContext = new WeakMap<PlatformFetch, PlatformClientContext>()

export function createPlatformClient(config: ClientConfig): PlatformFetch {
  const transport = toRequestTransport(config.fetch ?? globalThis.fetch)
  const defaults = {
    retry: config.retry,
    maxRetries: config.maxRetries,
    timeout: config.timeout,
  } satisfies RequestControlOptions

  const client = createClient<paths>({
    baseUrl: config.baseUrl,
    fetch: createRetryingFetch(transport, defaults),
    headers: config.headers,
  })

  platformClientContext.set(client, {
    transport,
    defaults,
    baseUrl: config.baseUrl,
    identityBaseUrl: config.identityBaseUrl,
  })

  // Error middleware — convert HTTP errors to typed AmigoError subclasses
  const errorMiddleware: Middleware = {
    async onResponse({ response }) {
      if (!response.ok) {
        throw await createApiError(response)
      }
      return response
    },
  }

  // Auth middleware — attach Bearer token
  const authMiddleware = createAuthMiddleware({ apiKey: config.apiKey })
  const hookMiddleware: Middleware | undefined = config.hooks
    ? {
        async onRequest({ request, schemaPath, id }) {
          await config.hooks?.onRequest?.({ request, schemaPath, id })
          return request
        },
        async onResponse({ request, response, schemaPath, id }) {
          await config.hooks?.onResponse?.({
            id,
            request,
            response,
            schemaPath,
            requestId: extractRequestId(response),
            rateLimit: parseRateLimitHeaders(response.headers),
          })
          return response
        },
        async onError({ request, error, schemaPath, id }) {
          await config.hooks?.onError?.({ id, request, error, schemaPath })
        },
      }
    : undefined

  // Order: auth first (adds header), then error (converts failures)
  client.use(authMiddleware)
  client.use(errorMiddleware)
  if (hookMiddleware) {
    client.use(hookMiddleware)
  }

  return client
}

export function applyPlatformRequestOptions<Operation>(
  client: PlatformFetch,
  init: AmigoRequestOptions<Operation> | undefined,
): AmigoRequestOptions<Operation> | undefined {
  if (!init) {
    return undefined
  }

  const context = platformClientContext.get(client)
  const stripped = stripRequestControls(init)

  if (!context) {
    return stripped as AmigoRequestOptions<Operation> | undefined
  }

  const overrideFetch = stripped?.fetch
  const hasControlOverride =
    overrideFetch !== undefined ||
    init.timeout !== undefined ||
    init.maxRetries !== undefined ||
    init.retry !== undefined

  if (!hasControlOverride) {
    return stripped as AmigoRequestOptions<Operation> | undefined
  }

  const transport = toRequestTransport(
    (overrideFetch ?? context.transport) as typeof globalThis.fetch,
  )
  const fetch = createRetryingFetch(transport, {
    timeout: init.timeout ?? context.defaults.timeout,
    maxRetries: init.maxRetries ?? context.defaults.maxRetries,
    retry: init.retry ?? context.defaults.retry,
  })

  return {
    ...stripped,
    fetch,
  } as AmigoRequestOptions<Operation>
}

/** @internal */
export function getPlatformClientBaseUrl(client: PlatformFetch): string {
  const context = platformClientContext.get(client)
  if (!context) {
    throw new ConfigurationError('Platform client baseUrl is unavailable')
  }
  return context.baseUrl
}

/** @internal */
export function getPlatformClientIdentityBaseUrl(client: PlatformFetch): string {
  const context = platformClientContext.get(client)
  if (!context) {
    throw new ConfigurationError('Platform client identityBaseUrl is unavailable')
  }
  return context.identityBaseUrl
}

function createRetryingFetch(
  transport: RequestTransport,
  defaults: RequestControlOptions,
): typeof globalThis.fetch {
  return async (input, init) => {
    const baseRequest = input instanceof Request ? input : new Request(input, init)
    const method = baseRequest.method.toUpperCase()
    const retryOpts = resolveRetryOptions(defaults.retry, defaults.maxRetries)
    const timeoutMs = defaults.timeout
    const isIdempotent = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'

    for (let attempt = 0; attempt < retryOpts.maxAttempts; attempt++) {
      let response: Response | undefined
      let error: unknown
      let timedOut = false

      try {
        const prepared = prepareRequestForAttempt(baseRequest, timeoutMs)

        try {
          response = await transport(prepared.request)
        } finally {
          timedOut = prepared.timedOut
          prepared.cleanup()
        }
      } catch (err) {
        error = err
      }

      if (!error && response && response.ok) return response

      const ctx = { method, attempt, response: response!, options: retryOpts }
      const attemptsRemain = attempt + 1 < retryOpts.maxAttempts

      if (error) {
        if (timedOut) {
          throw new RequestTimeoutError(`Request timed out after ${timeoutMs}ms`, timeoutMs, error)
        }
        if (isIdempotent && attemptsRemain) {
          await sleep(computeDelay(attempt, new Response(), retryOpts))
          continue
        }
        throw new NetworkError(
          `Network error: ${error instanceof Error ? error.message : String(error)}`,
          error,
        )
      }

      if (response && attemptsRemain && shouldRetry(ctx)) {
        const delay = computeDelay(attempt, response, retryOpts)
        if (baseRequest.signal.aborted) return response
        await sleep(delay)
        continue
      }

      return response!
    }

    throw new NetworkError('Retry loop exhausted')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toRequestTransport(fetcher: typeof globalThis.fetch | RequestTransport): RequestTransport {
  return async (input) => fetcher(input)
}

function prepareRequestForAttempt(
  request: Request,
  timeoutMs?: number,
): {
  request: Request
  readonly timedOut: boolean
  cleanup: () => void
} {
  const attemptRequest = request.clone()
  const timeout = createTimeoutSignal(attemptRequest.signal, timeoutMs)

  if (!timeout.signal) {
    return {
      request: attemptRequest,
      timedOut: false,
      cleanup: timeout.cleanup,
    }
  }

  return {
    request: new Request(attemptRequest, { signal: timeout.signal }),
    get timedOut() {
      return timeout.didTimeout
    },
    cleanup: timeout.cleanup,
  }
}

function createTimeoutSignal(
  upstream: AbortSignal | null,
  timeoutMs?: number,
): {
  signal?: AbortSignal
  didTimeout: boolean
  cleanup: () => void
} {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      signal: upstream ?? undefined,
      didTimeout: false,
      cleanup: () => {},
    }
  }

  const controller = new AbortController()
  let didTimeout = false
  const cleanups: Array<() => void> = []

  const onAbort = () => controller.abort(upstream?.reason)
  if (upstream) {
    if (upstream.aborted) {
      controller.abort(upstream.reason)
    } else {
      upstream.addEventListener('abort', onAbort, { once: true })
      cleanups.push(() => upstream.removeEventListener('abort', onAbort))
    }
  }

  const timer = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)
  cleanups.push(() => clearTimeout(timer))

  return {
    signal: controller.signal,
    get didTimeout() {
      return didTimeout
    },
    cleanup: () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    },
  }
}
