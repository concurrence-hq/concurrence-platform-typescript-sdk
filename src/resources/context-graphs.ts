import type { components } from '../generated/api.js'
import type { ContextGraphId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams } from '../core/utils.js'

export interface ListContextGraphsParams extends ListParams {
  search?: string
}

/**
 * Manage context graphs — structured conversation flow definitions (HSM).
 * Context graphs define the states, transitions, and conditions that
 * govern how an agent moves through a conversation.
 */
export class ContextGraphsResource extends WorkspaceScopedResource {
  async create(body: components['schemas']['CreateContextGraphRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/context-graphs', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  async list(params?: ListContextGraphsParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/context-graphs', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListContextGraphsParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  async get(contextGraphId: ContextGraphId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/context-graphs/{context_graph_id}', {
        params: {
          path: { workspace_id: this.workspaceId, context_graph_id: contextGraphId },
        },
      }),
    )
  }

  async update(
    contextGraphId: ContextGraphId | string,
    body: components['schemas']['UpdateContextGraphRequest'],
  ) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/context-graphs/{context_graph_id}', {
        params: {
          path: { workspace_id: this.workspaceId, context_graph_id: contextGraphId },
        },
        body,
      }),
    )
  }

  async delete(contextGraphId: ContextGraphId | string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/context-graphs/{context_graph_id}', {
      params: {
        path: { workspace_id: this.workspaceId, context_graph_id: contextGraphId },
      },
    })
  }

  /**
   * Create the context graph's next version.
   *
   * Omitting `dynamic_behaviors` keeps the latest version's, and an empty list
   * removes them all. Pass `options.expectedLatestVersion`, the latest version
   * this write was made from (0 for a graph with none), to have the write throw
   * `ConflictError` (409) when the graph has moved on since. Adding or changing
   * a replace-mode dynamic behavior without `platform:admin` throws
   * `PermissionError` (403).
   */
  async createVersion(
    contextGraphId: ContextGraphId | string,
    body: components['schemas']['CreateContextGraphVersionRequest'],
    options?: { expectedLatestVersion?: number },
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/context-graphs/{context_graph_id}/versions', {
        params: {
          path: { workspace_id: this.workspaceId, context_graph_id: contextGraphId },
          query: { expected_latest_version: options?.expectedLatestVersion },
        },
        body,
      }),
    )
  }

  /** List all versions of a context graph */
  async listVersions(contextGraphId: ContextGraphId | string, params?: ListParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/context-graphs/{context_graph_id}/versions', {
        params: {
          path: { workspace_id: this.workspaceId, context_graph_id: contextGraphId },
          query: params,
        },
      }),
    )
  }

  listVersionsAutoPaging(contextGraphId: ContextGraphId | string, params?: ListParams) {
    return this.iteratePaginatedList(
      (pageParams) => this.listVersions(contextGraphId, pageParams),
      params,
    )
  }

  /** Get a specific version by number, or pass "latest" for the most recent */
  async getVersion(contextGraphId: ContextGraphId | string, version: number | 'latest') {
    return extractData(
      await this.client.GET(
        '/v1/{workspace_id}/context-graphs/{context_graph_id}/versions/{version}',
        {
          params: {
            path: {
              workspace_id: this.workspaceId,
              context_graph_id: contextGraphId,
              version,
            },
          },
        },
      ),
    )
  }
}
