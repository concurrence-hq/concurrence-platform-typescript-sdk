import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * External role assignments — assign external roles to external identities.
 */
export class ExternalRoleAssignmentsResource extends WorkspaceScopedResource {
  /** List External Role Assignments */
  async list(
    params?: paths['/v1/{workspace_id}/external-role-assignments']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-role-assignments', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(
    params?: paths['/v1/{workspace_id}/external-role-assignments']['get']['parameters']['query'],
  ) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Upsert External Role Assignment */
  async upsert(body: components['schemas']['UpsertRequest']) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/external-role-assignments', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Get External Role Assignment */
  async get(assignmentId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-role-assignments/{assignment_id}', {
        params: { path: { workspace_id: this.workspaceId, assignment_id: assignmentId } },
      }),
    )
  }

  /** Delete External Role Assignment */
  async delete(assignmentId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/external-role-assignments/{assignment_id}', {
      params: { path: { workspace_id: this.workspaceId, assignment_id: assignmentId } },
    })
  }
}
