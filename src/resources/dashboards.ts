import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type Dashboard = components['schemas']['DashboardDefinitionResponse']
export type DashboardListResponse = components['schemas']['DashboardListResponse']
export type ListDashboardsParams = NonNullable<
  paths['/v1/{workspace_id}/dashboards']['get']['parameters']['query']
>
export type CreateDashboardRequest = components['schemas']['CreateDashboardRequest']
export type UpdateDashboardRequest = components['schemas']['UpdateDashboardRequest']
export type ExecuteDashboardRequest = components['schemas']['ExecutePanelRequest']
export type DashboardExecuteResponse = components['schemas']['DashboardExecuteResponse']
export type DashboardPanelResult = components['schemas']['PanelResultResponse']

/**
 * Dashboards: Plotly dashboard definitions (SQL panels plus figure specs) that the developer
 * console renders, and the execute call that runs their panel queries.
 */
export class DashboardsResource extends WorkspaceScopedResource {
  /** List dashboards, newest first. Pass `page_context` for the dashboards one console page shows. */
  async list(params?: ListDashboardsParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/dashboards', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListDashboardsParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /**
   * Create a dashboard. Every panel query must reference the `:ws_id` parameter, which binds it
   * to this workspace; a panel without it throws `ValidationError`.
   */
  async create(body: CreateDashboardRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/dashboards', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  async get(dashboardId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/dashboards/{dashboard_id}', {
        params: { path: { workspace_id: this.workspaceId, dashboard_id: dashboardId } },
      }),
    )
  }

  /** Get a dashboard by its slug, the key the console's dashboard pages use */
  async getBySlug(slug: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/dashboards/by-slug/{slug}', {
        params: { path: { workspace_id: this.workspaceId, slug } },
      }),
    )
  }

  /** Update a dashboard. Fields left out keep their value; panels follow the `create` rule. */
  async update(dashboardId: string, body: UpdateDashboardRequest) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/dashboards/{dashboard_id}', {
        params: { path: { workspace_id: this.workspaceId, dashboard_id: dashboardId } },
        body,
      }),
    )
  }

  async delete(dashboardId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/dashboards/{dashboard_id}', {
      params: { path: { workspace_id: this.workspaceId, dashboard_id: dashboardId } },
    })
  }

  /**
   * Run every panel query and return one result per panel. `filter_values` fills the
   * dashboard's declared filters, and a filter left out uses its default; other keys are
   * ignored. A panel whose query fails comes back with `error` set and no rows, and the other
   * panels still return.
   */
  async execute(dashboardId: string, body?: ExecuteDashboardRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/dashboards/{dashboard_id}/execute', {
        params: { path: { workspace_id: this.workspaceId, dashboard_id: dashboardId } },
        body,
      }),
    )
  }
}
