import type { components } from '../generated/api.js'
import type { DataSourceId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams } from '../core/utils.js'

export interface ListDataSourcesParams extends ListParams {
  type?: string
  status?: string
}

/**
 * Manage data sources — connections to external databases, warehouses,
 * or data feeds that the platform can query and sync from.
 */
export class DataSourcesResource extends WorkspaceScopedResource {
  async create(body: components['schemas']['CreateDataSourceRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/data-sources', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  async list(params?: ListDataSourcesParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/data-sources', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListDataSourcesParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  async get(dataSourceId: DataSourceId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/data-sources/{data_source_id}', {
        params: { path: { workspace_id: this.workspaceId, data_source_id: dataSourceId } },
      }),
    )
  }

  async update(
    dataSourceId: DataSourceId | string,
    body: components['schemas']['UpdateDataSourceRequest'],
  ) {
    return extractData(
      await this.client.PATCH('/v1/{workspace_id}/data-sources/{data_source_id}', {
        params: { path: { workspace_id: this.workspaceId, data_source_id: dataSourceId } },
        body,
      }),
    )
  }

  async delete(dataSourceId: DataSourceId | string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/data-sources/{data_source_id}', {
      params: { path: { workspace_id: this.workspaceId, data_source_id: dataSourceId } },
    })
  }

  /** Get event counts, sync status, and health for a data source */
  async getStatus(dataSourceId: DataSourceId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/data-sources/{data_source_id}/status', {
        params: { path: { workspace_id: this.workspaceId, data_source_id: dataSourceId } },
      }),
    )
  }

  /** Get daily event timeline + recent sync failures for a data source */
  async getSyncHistory(dataSourceId: DataSourceId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/data-sources/{data_source_id}/sync-history', {
        params: { path: { workspace_id: this.workspaceId, data_source_id: dataSourceId } },
      }),
    )
  }
}
