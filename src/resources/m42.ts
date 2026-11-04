import type { paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * M42 — read-only clinical analytics: forecasts, clusters, anomalies, patient topology and notes.
 */
export class M42Resource extends WorkspaceScopedResource {
  /** Ranked anomalies for a single indicator (default ``t2d_risk``). Includes inline decomposition + district centroids for the map. Schema-probes the alerts table so it works pre- and post-multi-indicator pipeline expansion. */
  async listRankedAnomalies(
    params?: paths['/v1/{workspace_id}/m42/anomalies/ranked']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/anomalies/ranked', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Per-table layer + description + row count for the Catalog page. */
  async getCatalog() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/catalog', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /** Per-cluster forecast fan points for the Patient Profile multi-line chart. ``focus_area`` defaults to T2D for backward compat. */
  async listClusterForecast(
    params?: paths['/v1/{workspace_id}/m42/clusters/forecast']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/clusters/forecast', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Per-cluster cohort stats — size, mean age/BMI/HbA1c, prediabetes / T2D %, predicted-risk mean. Powers the Patient Profile cluster strip. */
  async listClusterSummary(
    params?: paths['/v1/{workspace_id}/m42/clusters/summary']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/clusters/summary', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Forecast fan points (t, median, lower/upper 95% CI) for a named run + scenario. Used by the Sensorium observational fan and the Sims dual-envelope overlay. */
  async listForecastFan(
    params?: paths['/v1/{workspace_id}/m42/forecast-fan']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/forecast-fan', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Sampled subset of raw Poisson bootstrap draws (faint spaghetti curves behind the forecast fan). */
  async listForecastFanDraws(
    params?: paths['/v1/{workspace_id}/m42/forecast-fan/draws']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/forecast-fan/draws', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Fitted GLM coefficients, training-set size, AUROC for each focus-area model. Inline JSON kept as strings — clients parse. */
  async listModelRegistry(
    params?: paths['/v1/{workspace_id}/m42/model-registry']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/model-registry', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Cohort-wide (or per-cluster / per-district) rollup of NLP extractions joined onto patient-topology risk. Surfaces which narrative signals correlate with higher predicted T2D risk. */
  async getNotesRollup(
    params?: paths['/v1/{workspace_id}/m42/notes/rollup']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/notes/rollup', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Patient-level UMAP coordinates + predicted risk for the Self-Image scatter. Hand-seeded demo data (no ML training). Paginated. */
  async listPatientTopology(
    params?: paths['/v1/{workspace_id}/m42/patient-topology']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/patient-topology', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Patient-level bronze lab rows ordered by observation_date. Drives the mini-trajectory charts in the Patient Profile drawer. */
  async listPatientLabs(
    patientId: string,
    params?: paths['/v1/{workspace_id}/m42/patients/{patient_id}/labs']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/patients/{patient_id}/labs', {
        params: { path: { workspace_id: this.workspaceId, patient_id: patientId }, query: params },
      }),
    )
  }

  /** Patient's synthetic clinical note + LLM-extracted structured fields. NLP sample is 500 patients — returns 404 outside that set. */
  async getPatientNote(patientId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/patients/{patient_id}/note', {
        params: { path: { workspace_id: this.workspaceId, patient_id: patientId } },
      }),
    )
  }

  /** Per-cohort x region GLM fits with pooled fallback. Drives the dashboard's outcome-by-segment comparison view. */
  async listStratifiedFits(
    params?: paths['/v1/{workspace_id}/m42/stratified-fits']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/m42/stratified-fits', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }
}
