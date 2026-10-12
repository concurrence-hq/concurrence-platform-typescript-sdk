/**
 * Base class for workspace-scoped resources.
 *
 * Uses the openapi-fetch client (with auth + error + retry middleware)
 * injected from AmigoClient. Resources call typed HTTP methods that
 * flow through the middleware chain automatically.
 */

import type { Middleware } from 'openapi-fetch'
import {
  applyPlatformRequestOptions,
  getPlatformClientBaseUrl,
  type PlatformFetch,
} from '../core/openapi-client.js'
import {
  mergeRequestOptions,
  mergeScopedRequestOptions,
  type ScopedRequestOptions,
} from '../core/request-options.js'
import { extractData } from '../core/utils.js'

const scopedClientState = new WeakMap<
  PlatformFetch,
  { baseClient: PlatformFetch; options: ScopedRequestOptions }
>()

export abstract class WorkspaceScopedResource {
  constructor(
    protected readonly client: PlatformFetch,
    protected readonly workspaceId: string,
  ) {}

  protected get platformBaseUrl(): string {
    const { baseClient } = resolveScopedPlatformClient(this.client)
    return getPlatformClientBaseUrl(baseClient)
  }

  withOptions(options: ScopedRequestOptions): this {
    const ResourceCtor = this.constructor as new (
      client: PlatformFetch,
      workspaceId: string,
    ) => this
    return new ResourceCtor(scopePlatformClient(this.client, options), this.workspaceId)
  }

  protected async *iteratePaginatedList<
    TPage extends {
      items?: readonly unknown[]
      has_more?: boolean
      continuation_token?: unknown
    },
    TParams,
  >(
    fetchPage: (params: TParams) => Promise<TPage>,
    params: TParams,
  ): AsyncGenerator<TPage extends { items?: readonly (infer TItem)[] } ? TItem : never> {
    type Item = TPage extends { items?: readonly (infer TItem)[] } ? TItem : never
    let nextParams = params

    while (true) {
      const page = await fetchPage(nextParams)

      for (const item of page.items ?? []) {
        yield item as Item
      }

      if (
        !page.has_more ||
        page.continuation_token === null ||
        page.continuation_token === undefined
      ) {
        break
      }

      nextParams = {
        ...(nextParams as object | undefined),
        continuation_token: page.continuation_token,
      } as TParams
    }
  }

  protected async *iterateOffsetPaginatedList<
    TPage extends { has_more?: boolean; next_offset?: number | null },
    TItem,
    TParams,
  >(
    fetchPage: (params: TParams) => Promise<TPage>,
    selectItems: (page: TPage) => readonly TItem[],
    params: TParams,
  ): AsyncGenerator<TItem> {
    let nextParams = params

    while (true) {
      const page = await fetchPage(nextParams)

      for (const item of selectItems(page)) {
        yield item
      }

      if (!page.has_more || page.next_offset === null || page.next_offset === undefined) {
        break
      }

      nextParams = { ...(nextParams as object | undefined), offset: page.next_offset } as TParams
    }
  }
}

export function scopePlatformClient(
  client: PlatformFetch,
  options: ScopedRequestOptions,
): PlatformFetch {
  const { baseClient, options: existingOptions } = resolveScopedPlatformClient(client)
  const mergedOptions = mergeScopedRequestOptions(existingOptions, options)

  const scopedClient = {
    request: (method: string, path: string, init?: object) =>
      baseClient.request(
        method as never,
        path as never,
        applyPlatformRequestOptions(
          baseClient,
          mergeRequestOptions(mergedOptions, init as never),
        ) as never,
      ),
    GET: (path: string, init?: object) =>
      baseClient.GET(
        path as never,
        applyPlatformRequestOptions(
          baseClient,
          mergeRequestOptions(mergedOptions, init as never),
        ) as never,
      ),
    PUT: (path: string, init?: object) =>
      baseClient.PUT(
        path as never,
        applyPlatformRequestOptions(
          baseClient,
          mergeRequestOptions(mergedOptions, init as never),
        ) as never,
      ),
    POST: (path: string, init?: object) =>
      baseClient.POST(
        path as never,
        applyPlatformRequestOptions(
          baseClient,
          mergeRequestOptions(mergedOptions, init as never),
        ) as never,
      ),
    DELETE: (path: string, init?: object) =>
      baseClient.DELETE(
        path as never,
        applyPlatformRequestOptions(
          baseClient,
          mergeRequestOptions(mergedOptions, init as never),
        ) as never,
      ),
    OPTIONS: (path: string, init?: object) =>
      baseClient.OPTIONS(
        path as never,
        applyPlatformRequestOptions(
          baseClient,
          mergeRequestOptions(mergedOptions, init as never),
        ) as never,
      ),
    HEAD: (path: string, init?: object) =>
      baseClient.HEAD(
        path as never,
        applyPlatformRequestOptions(
          baseClient,
          mergeRequestOptions(mergedOptions, init as never),
        ) as never,
      ),
    PATCH: (path: string, init?: object) =>
      baseClient.PATCH(
        path as never,
        applyPlatformRequestOptions(
          baseClient,
          mergeRequestOptions(mergedOptions, init as never),
        ) as never,
      ),
    TRACE: (path: string, init?: object) =>
      baseClient.TRACE(
        path as never,
        applyPlatformRequestOptions(
          baseClient,
          mergeRequestOptions(mergedOptions, init as never),
        ) as never,
      ),
    use: (...middleware: Middleware[]) => baseClient.use(...middleware),
    eject: (...middleware: Middleware[]) => baseClient.eject(...middleware),
  } as PlatformFetch

  scopedClientState.set(scopedClient, { baseClient, options: mergedOptions })
  return scopedClient
}

export function resolveScopedPlatformClient(client: PlatformFetch): {
  baseClient: PlatformFetch
  options: ScopedRequestOptions | undefined
} {
  const existing = scopedClientState.get(client)
  return {
    baseClient: existing?.baseClient ?? client,
    options: existing?.options,
  }
}

export { extractData }
