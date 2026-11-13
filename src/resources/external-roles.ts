import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * External roles — roles defined for external-system identities.
 */
export class ExternalRolesResource extends WorkspaceScopedResource {
  /** List External Roles */
  async list(params?: paths['/v1/{workspace_id}/external-roles']['get']['parameters']['query']) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-roles', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(
    params?: paths['/v1/{workspace_id}/external-roles']['get']['parameters']['query'],
  ) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Create External Role */
  async create(body: components['schemas']['src__routes__external_roles__CreateRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/external-roles', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Get External Role */
  async get(roleId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-roles/{role_id}', {
        params: { path: { workspace_id: this.workspaceId, role_id: roleId } },
      }),
    )
  }

  /** Delete External Role */
  async delete(roleId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/external-roles/{role_id}', {
      params: { path: { workspace_id: this.workspaceId, role_id: roleId } },
    })
  }
}
