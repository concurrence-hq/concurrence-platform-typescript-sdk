import type { paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Billing — workspace usage and cost reporting.
 */
export class BillingResource extends WorkspaceScopedResource {
  /** Return Amigo-admin-only LLM cost for an inclusive date range from one complete published calculation. Omit `group_by` for workspace totals and service costs; use `group_by=model` to include each model's pricing status and applied rate records. The optional `service_id` filter is applied before aggregation. */
  async getCost(params: paths['/v1/{workspace_id}/cost']['get']['parameters']['query']) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/cost', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Return customer-visible LLM usage for an inclusive date range from one complete published calculation. Omit `group_by` for totals, daily usage, attribution, and service breakdowns; use `group_by=model` or `group_by=class` for those breakdowns. The optional `service_id` filter is applied before aggregation. */
  async getUsage(params: paths['/v1/{workspace_id}/usage']['get']['parameters']['query']) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/usage', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Return simulation, playground, customer-test, Amigo-internal, and unresolved usage excluded from the customer's production-classified totals. The optional `service_id` filter is applied before aggregation. */
  async getUsageCostExcluded(
    params: paths['/v1/{workspace_id}/usage-cost/excluded']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/usage-cost/excluded', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Return customer-visible production-classified LLM usage and calculated model-provider cost grouped by model. The optional `service_id` filter is applied before aggregation. Rates and money are decimal strings. */
  async getUsageCostModels(
    params: paths['/v1/{workspace_id}/usage-cost/models']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/usage-cost/models', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Return customer-visible production-classified LLM usage and calculated model-provider cost for an inclusive UTC date range. The optional `service_id` filter is applied before aggregation. Unsupported v0 provenance and attribution fields remain null and successful responses report `data_status=partial`. */
  async getUsageCostOverview(
    params: paths['/v1/{workspace_id}/usage-cost/overview']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/usage-cost/overview', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }
}
