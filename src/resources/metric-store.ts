import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Metric Store — environment-level setup and refresh runs. These routes are not scoped to a
 * workspace, so the client's workspace id plays no part in them.
 */
export class MetricStoreResource extends WorkspaceScopedResource {
  /** Trigger the fixed Metric Store setup job through the platform control plane */
  async setup() {
    return extractData(await this.client.POST('/v1/metric-store/setup'))
  }

  /** Trigger an on-demand canonical Metric Store refresh */
  async refresh() {
    return extractData(await this.client.POST('/v1/metric-store/refresh'))
  }

  /** Read the status of a Metric Store setup or refresh run */
  async getRun(runId: number) {
    return extractData(
      await this.client.GET('/v1/metric-store/runs/{run_id}', {
        params: { path: { run_id: runId } },
      }),
    )
  }
}
