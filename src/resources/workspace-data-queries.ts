import type { components } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type WorkspaceDataQuery = components['schemas']['WorkspaceDataQueryItem']
export type WorkspaceDataQueryListItem =
  components['schemas']['src__routes__workspace_data_queries__list_workspace_data_queries__Response__Item']
export type WorkspaceDataQueryListResponse =
  components['schemas']['src__routes__workspace_data_queries__list_workspace_data_queries__Response']
export type CreateWorkspaceDataQueryRequest =
  components['schemas']['src__routes__workspace_data_queries__create_workspace_data_query__Request']
export type UpdateWorkspaceDataQueryRequest =
  components['schemas']['src__routes__workspace_data_queries__update_workspace_data_query__Request']
export type InvokeWorkspaceDataQueryRequest =
  components['schemas']['src__routes__workspace_data_queries__invoke_workspace_data_query__Request']
export type InvokeWorkspaceDataQueryResponse =
  components['schemas']['src__routes__workspace_data_queries__invoke_workspace_data_query__Response']

/**
 * Workspace data queries: register, list, update, and invoke workspace query
 * tools.
 */
export class WorkspaceDataQueriesResource extends WorkspaceScopedResource {
  async list(): Promise<WorkspaceDataQueryListResponse> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/data_queries', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /**
   * Register a data query. `declarations.reads` says whose patient record a
   * call returns. A query over practice data, such as FAQ articles, locations
   * or hours, declares `{ patient_in: 'none' }`, so the voice agent never
   * counts its result as a patient's record. A declaration left out is
   * undeclared, and one a data query can't make throws `ValidationError`.
   */
  async create(body: CreateWorkspaceDataQueryRequest): Promise<WorkspaceDataQuery> {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/data_queries', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  async get(queryId: string): Promise<WorkspaceDataQuery> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/data_queries/{query_id}', {
        params: { path: { workspace_id: this.workspaceId, query_id: queryId } },
      }),
    )
  }

  /**
   * Update a data query. Each declaration named in `declarations` replaces the
   * stored one (`null` undeclares it), and one left out keeps what is stored.
   */
  async update(
    queryId: string,
    body: UpdateWorkspaceDataQueryRequest,
  ): Promise<WorkspaceDataQuery> {
    return extractData(
      await this.client.PATCH('/v1/{workspace_id}/data_queries/{query_id}', {
        params: { path: { workspace_id: this.workspaceId, query_id: queryId } },
        body,
      }),
    )
  }

  async delete(queryId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/data_queries/{query_id}', {
      params: { path: { workspace_id: this.workspaceId, query_id: queryId } },
    })
  }

  async invoke(
    queryId: string,
    body: InvokeWorkspaceDataQueryRequest = {},
  ): Promise<InvokeWorkspaceDataQueryResponse> {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/data_queries/{query_id}/invoke', {
        params: { path: { workspace_id: this.workspaceId, query_id: queryId } },
        body,
      }),
    )
  }
}
