import type { components } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Workspace tables — workspace-defined lookup tables.
 */
export class WorkspaceTablesResource extends WorkspaceScopedResource {
  /** List Workspace Tables */
  async list() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/tables', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /** Create Workspace Table */
  async create(
    body: components['schemas']['src__routes__workspace_tables__create_workspace_table__Request'],
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/tables', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Get Workspace Table */
  async get(tableId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/tables/{table_id}', {
        params: { path: { workspace_id: this.workspaceId, table_id: tableId } },
      }),
    )
  }

  /** Update Workspace Table */
  async update(
    tableId: string,
    body: components['schemas']['src__routes__workspace_tables__update_workspace_table__Request'],
  ) {
    return extractData(
      await this.client.PATCH('/v1/{workspace_id}/tables/{table_id}', {
        params: { path: { workspace_id: this.workspaceId, table_id: tableId } },
        body,
      }),
    )
  }

  /** Delete Workspace Table */
  async delete(tableId: string) {
    return extractData(
      await this.client.DELETE('/v1/{workspace_id}/tables/{table_id}', {
        params: { path: { workspace_id: this.workspaceId, table_id: tableId } },
      }),
    )
  }
}
