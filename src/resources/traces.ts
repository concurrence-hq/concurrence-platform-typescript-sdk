import type { components } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Traces — export workspace traces.
 */
export class TracesResource extends WorkspaceScopedResource {
  /** Export the workspace's durable trace spans over a time window as OpenTelemetry Protocol (OTLP/HTTP JSON) spans: ``gen_ai.*`` tool-call spans and the per-call voice-isolation ``voice.*`` infra spans (allocate / media-attach / reap). Read-only; `Audit:View` permission required. Paginated PULL API — extract ``.resourceSpans`` before forwarding to an OTLP collector. Attributes are an allowlist of tool-call + infra metadata; the raw tool-result ``error`` text is NOT exported (PHI-safe by construction). */
  async export(body: components['schemas']['TracesExportRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/traces:export', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }
}
