import type { components, operations } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type MetricCatalogEntry = components['schemas']['MetricCatalogEntry']
export type MetricCatalogResponse = components['schemas']['MetricCatalogResponse']
export type MetricListResponse = components['schemas']['MetricListResponse']
export type MetricValueListResponse = components['schemas']['MetricValueListResponse']
export type NumericalMetricValue = components['schemas']['NumericalMetricValueResponse']
export type CategoricalMetricValue = components['schemas']['CategoricalMetricValueResponse']
export type BooleanMetricValue = components['schemas']['BooleanMetricValueResponse']
export type MetricValue = NumericalMetricValue | CategoricalMetricValue | BooleanMetricValue
/** @deprecated Use `MetricValue` instead. */
export type MetricValueResponse = MetricValue
export type MetricListParams = NonNullable<operations['list-metrics']['parameters']['query']>
export type MetricValuesParams = NonNullable<operations['get-metric-values']['parameters']['query']>
export type MetricTrendParams = NonNullable<operations['get-metric-trend']['parameters']['query']>

/**
 * Metrics — computed metric catalog and typed metric values.
 */
export class MetricsResource extends WorkspaceScopedResource {
  /**
   * List metric values. By default each series' newest period, with a categorical or boolean
   * period folded into one row. Filter by source, scope, entity, service, run, session or date
   * range; page with `limit` and the returned `continuation_token`. Pages reach the first 10,000
   * values: a page past that throws `ValidationError` even when `has_more` was true, so narrow
   * the filters or dates to read further.
   */
  async listLatest(params?: MetricListParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/metrics', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** List available built-in and custom metric definitions */
  async getCatalog() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/metrics/catalog', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /**
   * Get stored values for one metric key, optionally bounded by time range. A key the workspace
   * doesn't define throws `NotFoundError`.
   */
  async getValues(metricKey: string, params?: MetricValuesParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/metrics/{metric_key}', {
        params: {
          path: { workspace_id: this.workspaceId, metric_key: metricKey },
          query: params,
        },
      }),
    )
  }

  /**
   * Get a recent time-series trend for one metric key. A key the workspace doesn't define throws
   * `NotFoundError`.
   */
  async getTrend(metricKey: string, params?: MetricTrendParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/metrics/{metric_key}/trend', {
        params: {
          path: { workspace_id: this.workspaceId, metric_key: metricKey },
          query: params,
        },
      }),
    )
  }
}
