import type { components, operations } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type SurfaceCompletionRatesParams = NonNullable<
  operations['get-surface-completion-rates']['parameters']['query']
>
export type SurfaceChannelEffectivenessParams = NonNullable<
  operations['get-surface-channel-effectiveness']['parameters']['query']
>
export type SurfaceFieldAbandonmentParams = NonNullable<
  operations['get-surface-field-abandonment']['parameters']['query']
>
export type EntitySurfaceHistoryParams = NonNullable<
  operations['get-entity-surface-history']['parameters']['query']
>
export type EvalQualityParams = NonNullable<
  operations['get-eval-quality-analytics']['parameters']['query']
>
export type EvalQualityResponse = components['schemas']['EvalQualityResponse']

/**
 * Analytics — aggregate metrics about calls, agents, quality, and usage.
 */
export class AnalyticsResource extends WorkspaceScopedResource {
  /** High-level dashboard summary — pass `days` (default: 7) for the lookback window */
  async getDashboard(params?: { days?: number }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/dashboard', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Call volume and duration metrics */
  async getCalls(params?: {
    days?: number
    date_from?: string | null
    date_to?: string | null
    interval?: '1h' | '1d' | '1w'
    service_id?: string | null
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/calls', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Per-agent performance breakdown */
  async getAgents(params?: { period?: string }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/agents', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Call quality — sentiment, transcription confidence, flagged calls */
  async getCallQuality(params?: {
    days?: number
    date_from?: string | null
    date_to?: string | null
    interval?: '1h' | '1d' | '1w'
    service_id?: string | null
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/call-quality', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Emotion trend data over time */
  async getEmotionTrends(params?: {
    days?: number
    date_from?: string | null
    date_to?: string | null
    interval?: '1h' | '1d' | '1w'
    service_id?: string | null
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/emotion-trends', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Voice pipeline latency metrics (TTFB, response time) */
  async getLatency(params?: {
    days?: number
    date_from?: string | null
    date_to?: string | null
    interval?: '1h' | '1d' | '1w'
    service_id?: string | null
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/latency', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Tool call performance — success rates and latency per tool */
  async getToolPerformance(params?: { days?: number }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/tool-performance', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Data quality metrics for the workspace world model */
  async getDataQuality(params?: { days?: number }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/data-quality', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Usage summary — API requests, call minutes, storage */
  async getUsage(params?: {
    days?: number
    date_from?: string | null
    date_to?: string | null
    interval?: '1h' | '1d' | '1w'
    service_id?: string | null
    direction?: string | null
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/usage', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Event type breakdown — counts and trends per event type */
  async getEventBreakdown(params?: { days?: number }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/events', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Operator escalation performance and quality comparison */
  async getOperatorPerformance(params?: {
    days?: number
    date_from?: string | null
    date_to?: string | null
    interval?: '1h' | '1d' | '1w'
    service_id?: string | null
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/operator-performance', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Advanced call statistics (abandonment, transfers, silence, hour-of-day) */
  async getAdvancedCallStats(params?: {
    days?: number
    date_from?: string | null
    date_to?: string | null
    interval?: '1h' | '1d' | '1w'
    service_id?: string | null
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/calls/advanced', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /**
   * Production-eval pass rate and score: the workspace summary, one row per eval key, and a
   * trend. Built from stored call verdicts, so every channel counts.
   */
  async getEvalQuality(params?: EvalQualityParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/eval-quality', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /** Compare two time periods side by side */
  async compareCallPeriods(params: {
    current_from: string
    current_to: string
    previous_from: string
    previous_to: string
    service_id?: string
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/analytics/calls/comparison', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  /**
   * Surfaces analytics — completion rates, channel effectiveness, field
   * abandonment, and per-entity breakdowns. Used by the developer console's
   * surfaces analytics tab.
   */
  readonly surfaces = {
    getCompletionRates: async (params?: SurfaceCompletionRatesParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/analytics/surfaces/completion-rates', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    getChannelEffectiveness: async (params?: SurfaceChannelEffectivenessParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/analytics/surfaces/channel-effectiveness', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    getFieldAbandonment: async (params?: SurfaceFieldAbandonmentParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/analytics/surfaces/field-abandonment', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    /** Per-entity surfaces analytics (which surfaces a specific entity has seen) */
    getForEntity: async (entityId: string, params?: EntitySurfaceHistoryParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/analytics/surfaces/entity/{entity_id}', {
          params: { path: { workspace_id: this.workspaceId, entity_id: entityId }, query: params },
        }),
      ),
  }
}
