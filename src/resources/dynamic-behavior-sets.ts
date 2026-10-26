import type { components, operations } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type DynamicBehaviorSet = components['schemas']['DynamicBehaviorSetResponse']
export type DynamicBehaviorSetListResponse = components['schemas']['DynamicBehaviorSetListResponse']
export type CreateDynamicBehaviorSetRequest =
  components['schemas']['CreateDynamicBehaviorSetRequest']
export type UpdateDynamicBehaviorSetRequest =
  components['schemas']['UpdateDynamicBehaviorSetRequest']
export type DynamicBehaviorSetVersion = components['schemas']['DynamicBehaviorSetVersionResponse']
export type DynamicBehaviorSetVersionListResponse =
  components['schemas']['DynamicBehaviorSetVersionListResponse']
export type CreateDynamicBehaviorSetVersionRequest =
  components['schemas']['CreateDynamicBehaviorSetVersionRequest']
export type DynamicBehaviorSetUsageResponse =
  components['schemas']['DynamicBehaviorSetUsageResponse']
export type DynamicBehaviorSetPinningService = components['schemas']['PinningService']
export type ListDynamicBehaviorSetsParams = NonNullable<
  operations['list-dynamic-behavior-sets']['parameters']['query']
>
export type ListDynamicBehaviorSetVersionsParams = NonNullable<
  operations['list-dynamic-behavior-set-versions']['parameters']['query']
>
export type DynamicBehaviorSetUsageParams = NonNullable<
  operations['get-dynamic-behavior-set-usage']['parameters']['query']
>

/**
 * The dynamic behaviors library: sets, and the numbered versions of each set.
 *
 * A set is one behavior, with a name and tags. A version holds the condition, examples,
 * instruction, mode, sticky turns and note, is written once and never changes, and is
 * numbered from 1. Nothing here changes what a call does: a service runs a version only when
 * its version set pins it, which `client.services.setDynamicBehaviorPin` does.
 *
 * Reads need the `DynamicBehaviorSet.view` permission, which every role holds. Writes need an
 * `admin` or `owner` key. Writes and reads are rate limited per credential and route, and a
 * request over the limit throws `RateLimitError` (429).
 */
export class DynamicBehaviorSetsResource extends WorkspaceScopedResource {
  /**
   * List the workspace's sets, without their versions. Newest update first unless `sort_by`
   * says otherwise, and only sets that aren't archived unless `archived` is `true`, which
   * lists only the archived ones.
   *
   * Filters: `q` is text the name contains, whatever the case; `tag` is an exact tag;
   * `service_id` is a service, and lists the sets any of its version sets pins, enabled or
   * not. `sort_by` takes `+name`, `-name`, `+updated_at` and `-updated_at`, once each field,
   * and anything else throws `ValidationError`. `limit` defaults to 50 and is at most 200.
   * When `has_more` is `true`, pass the returned `continuation_token` back unchanged, or use
   * `listAutoPaging`.
   */
  async list(params?: ListDynamicBehaviorSetsParams): Promise<DynamicBehaviorSetListResponse> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/dynamic-behavior-sets', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Iterate every set that `list` would return for the same params, page by page. */
  listAutoPaging(params?: ListDynamicBehaviorSetsParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /**
   * Create a set together with its version 1. The name is trimmed and has to be unique among
   * the workspace's sets that aren't archived, whatever the case; a taken name throws
   * `ConflictError` (409).
   *
   * Two things need the `platform:admin` scope, which no workspace API key carries: setting
   * the set's own `id`, and a `first_version` in `replace` mode. A request that does either
   * without the scope is refused by the API with `PermissionError` (403). Leave `id` out so the
   * platform generates it, and leave `mode` out (it defaults to `add`).
   */
  async create(body: CreateDynamicBehaviorSetRequest): Promise<DynamicBehaviorSet> {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/dynamic-behavior-sets', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /**
   * Get a set, without its versions, with the number of its latest version. An archived set
   * is returned too. A set of another workspace or an id the workspace doesn't have throws
   * `NotFoundError`.
   */
  async get(setId: string): Promise<DynamicBehaviorSet> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/dynamic-behavior-sets/{set_id}', {
        params: { path: { workspace_id: this.workspaceId, set_id: setId } },
      }),
    )
  }

  /**
   * Rename a set, change its tags, or archive or restore it, without writing a version. A field
   * left out stays as it is, and a set is never deleted.
   *
   * `archived: true` takes the set out of the default list and gives its name back. It needs
   * the `DynamicBehaviorSet.delete` permission as well, and throws `ConflictError` (409) while
   * any version set pins the set, enabled or not; clear those pins first, and see `usage` for
   * which services hold them. `archived: false` restores the set, and throws `ConflictError`
   * when another set that isn't archived has taken the name. A rename takes effect for every
   * service that pins the set.
   */
  async update(setId: string, body: UpdateDynamicBehaviorSetRequest): Promise<DynamicBehaviorSet> {
    return extractData(
      await this.client.PATCH('/v1/{workspace_id}/dynamic-behavior-sets/{set_id}', {
        params: { path: { workspace_id: this.workspaceId, set_id: setId } },
        body,
      }),
    )
  }

  /**
   * Write the set's next version. A version is written in full: a field left out takes its
   * default (`add` mode, `sticky_turns` of 1, no examples, no instruction) and nothing carries
   * over from the previous version. No service runs the version until a version set pins it.
   *
   * `expectedLatestVersion` is required: the latest version number the caller read. When the
   * set has a different latest version, or another write took the next number first, nothing is
   * stored and the call throws `ConflictError` (409) with the API's body, which names both
   * version numbers. The SDK does not retry it: read the set, apply the change to its latest
   * version and call again. A set that is archived also throws `ConflictError`; restore it with
   * `update` first.
   *
   * A version in `replace` mode needs the `platform:admin` scope, which no workspace API key
   * carries; the API refuses it with `PermissionError` (403). Write `add` mode versions with a
   * workspace key.
   */
  async createVersion(
    setId: string,
    body: CreateDynamicBehaviorSetVersionRequest,
    options: { expectedLatestVersion: number },
  ): Promise<DynamicBehaviorSetVersion> {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/dynamic-behavior-sets/{set_id}/versions', {
        params: {
          path: { workspace_id: this.workspaceId, set_id: setId },
          query: { expected_latest_version: options.expectedLatestVersion },
        },
        body,
      }),
    )
  }

  /**
   * List a set's versions, newest first. `limit` defaults to 20 and is at most 100. When
   * `has_more` is `true`, pass the returned `continuation_token` back unchanged, or use
   * `listVersionsAutoPaging`.
   */
  async listVersions(
    setId: string,
    params?: ListDynamicBehaviorSetVersionsParams,
  ): Promise<DynamicBehaviorSetVersionListResponse> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/dynamic-behavior-sets/{set_id}/versions', {
        params: {
          path: { workspace_id: this.workspaceId, set_id: setId },
          query: params,
        },
      }),
    )
  }

  /** Iterate every version that `listVersions` would return for the same params, newest first. */
  listVersionsAutoPaging(setId: string, params?: ListDynamicBehaviorSetVersionsParams) {
    return this.iteratePaginatedList((pageParams) => this.listVersions(setId, pageParams), params)
  }

  /**
   * Get one version of a set, as it was written. A version the set doesn't have throws
   * `NotFoundError`.
   */
  async getVersion(setId: string, version: number): Promise<DynamicBehaviorSetVersion> {
    return extractData(
      await this.client.GET(
        '/v1/{workspace_id}/dynamic-behavior-sets/{set_id}/versions/{version}',
        {
          params: {
            path: { workspace_id: this.workspaceId, set_id: setId, version },
          },
        },
      ),
    )
  }

  /**
   * List the services whose version sets pin the set, in service-name order. Each item is a
   * service with the version sets that pin the set, and each of those carries the pinned
   * `version`, `enabled` and `states`. Disabled pins are listed. A set nothing pins returns an
   * empty list. `limit` defaults to 50 and is at most 200. When `has_more` is `true`, pass the
   * returned `continuation_token` back unchanged, or use `usageAutoPaging`.
   */
  async usage(
    setId: string,
    params?: DynamicBehaviorSetUsageParams,
  ): Promise<DynamicBehaviorSetUsageResponse> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/dynamic-behavior-sets/{set_id}/usage', {
        params: {
          path: { workspace_id: this.workspaceId, set_id: setId },
          query: params,
        },
      }),
    )
  }

  /** Iterate every service that `usage` would return for the same params. */
  usageAutoPaging(setId: string, params?: DynamicBehaviorSetUsageParams) {
    return this.iteratePaginatedList((pageParams) => this.usage(setId, pageParams), params)
  }
}
