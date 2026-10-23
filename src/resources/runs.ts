import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

// Filter values come from the generated spec, so they track the API's enums.
type RunsListQuery = NonNullable<paths['/v1/{workspace_id}/runs']['get']['parameters']['query']>
type RunsSummaryQuery = NonNullable<
  paths['/v1/{workspace_id}/runs/summary']['get']['parameters']['query']
>

export type Run = components['schemas']['Run']
/**
 * The configuration a run executed with: as its session started, and as it stood after any
 * change the run made mid-way. A field is null when the session had nothing to record for it.
 */
export type RunManifest = components['schemas']['RunManifest']

/**
 * Unified runs — the channel-neutral run backbone.
 *
 * Every agent trajectory is a Run: a conversation run (any channel) OR a
 * framework run (claude-agent-sdk / openai-agents), combined at read time
 * behind one `Run` contract. This resource is the SDK surface for that backbone:
 * list + summary + single-run detail + framework trajectory (reads), plus the
 * run-scoped operator verbs (guidance / takeover / authored-turn / handback /
 * switch-mode) addressed by the channel-neutral `run_id`.
 *
 * Distinct from the agent-runs CONTEXT edge (`/agent-runs/harness-context`,
 * framework-only) and the conversation surface (`/conversations`,
 * conversation-only): neither spans the other, and only this resource speaks
 * the unified `run_id`.
 */
export class RunsResource extends WorkspaceScopedResource {
  /**
   * Paginated, newest-first list of runs. `kind` / `channel` / `status` /
   * `serviceId` / `sourceConversationId` are multi-value OR-filters (repeat
   * within an axis, AND across axes); omitted or empty filters leave that axis
   * unfiltered. The API accepts up to 100 service IDs and filters conversations
   * and live voice runs before pagination. Historical framework runs have no
   * stored service attribution and are excluded when a service is selected.
   * `sourceConversationId` takes up to 100 conversation IDs, such as the one a
   * Playground session ran, and matches the conversation each run came from.
   * Runs with no source conversation (framework runs, and a live call before
   * its conversation is recorded) are excluded. `status` accepts the virtual
   * `live` (running + paused). `continuationToken` is the opaque cursor from a
   * prior page: round-trip it verbatim.
   */
  async list(params?: {
    limit?: number
    continuationToken?: unknown
    kind?: RunsListQuery['kind']
    channel?: RunsListQuery['channel']
    status?: RunsListQuery['status']
    serviceId?: string[]
    sourceConversationId?: string[]
    sortBy?: string[]
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/runs', {
        params: {
          path: { workspace_id: this.workspaceId },
          query: {
            limit: params?.limit,
            continuation_token: params?.continuationToken,
            kind: params?.kind,
            channel: params?.channel,
            status: params?.status,
            service_id: params?.serviceId,
            source_conversation_id: params?.sourceConversationId,
            sort_by: params?.sortBy,
          },
        },
      }),
    )
  }

  /** Aggregate run counts (total / live / by-status / by-kind). */
  async summary(params?: {
    kind?: RunsSummaryQuery['kind']
    channel?: RunsSummaryQuery['channel']
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/runs/summary', {
        params: {
          path: { workspace_id: this.workspaceId },
          query: { kind: params?.kind, channel: params?.channel },
        },
      }),
    )
  }

  /** Resolve one run by its channel-neutral `run_id`, at any status. */
  async get(runId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/runs/{run_id}', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
      }),
    )
  }

  /**
   * The ordered structural steps of a FRAMEWORK run's trajectory (perception /
   * decision / tool / completion). 409 for conversation runs (they have per-turn
   * detail via the conversation surface).
   */
  async trajectory(runId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/runs/{run_id}/trajectory', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
      }),
    )
  }

  /** Send operator guidance to a LIVE run (the agent folds it into its next turn). */
  async sendGuidance(runId: string, body: components['schemas']['RunGuidanceRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/runs/{run_id}/guidance', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
        body,
      }),
    )
  }

  /** Take a live run over (operator drives). Returns the audio-leg coordinates for voice. */
  async takeOver(runId: string, body: components['schemas']['RunTakeoverRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/runs/{run_id}/takeover', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
        body,
      }),
    )
  }

  /**
   * Stage the operator's reply on a taken-over text run (sms, whatsapp, email, web or imessage).
   * The reply goes out in place of the agent's next message, once, and the agent stays paused.
   * Call it again for each further reply, then `handBack`. `text` is 1 to 4,000 characters;
   * longer is a 422, never truncated. A voice run gets a 409, because the operator speaks on
   * the call. Beta: a workspace that is not enabled for operators gets a 403. The call acts as
   * the signed-in operator, so `operator_id` must be the caller's own and the client needs that
   * operator's identity token; a workspace API key gets a 403.
   */
  async authorTurn(runId: string, body: components['schemas']['RunAuthoredTurnRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/runs/{run_id}/authored-turn', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
        body,
      }),
    )
  }

  /** Hand a taken-over run back to the agent. */
  async handBack(runId: string, body: components['schemas']['RunHandbackRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/runs/{run_id}/handback', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
        body,
      }),
    )
  }

  /** Switch the operator's mode on a live run (listen ↔ takeover). */
  async switchMode(runId: string, body: components['schemas']['RunSwitchModeRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/runs/{run_id}/switch-mode', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
        body,
      }),
    )
  }
}
