import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Role grants — grant workspace roles; superseding a grant retains its history.
 */
export class RoleGrantsResource extends WorkspaceScopedResource {
  /** List Role Grants */
  async list(params?: paths['/v1/{workspace_id}/role-grants']['get']['parameters']['query']) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/role-grants', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: paths['/v1/{workspace_id}/role-grants']['get']['parameters']['query']) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Create Role Grant */
  async create(body: components['schemas']['src__routes__role_grants__CreateRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/role-grants', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Get Role Grant */
  async get(grantId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/role-grants/{grant_id}', {
        params: { path: { workspace_id: this.workspaceId, grant_id: grantId } },
      }),
    )
  }

  /** Supersede an active grant (immutable history) — never a physical delete. */
  async supersede(grantId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/role-grants/{grant_id}', {
      params: { path: { workspace_id: this.workspaceId, grant_id: grantId } },
    })
  }
}
