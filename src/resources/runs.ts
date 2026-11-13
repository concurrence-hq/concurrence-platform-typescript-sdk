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
 * run-scoped operator verbs (guidance / takeover / renew / authored-turn /
 * handback / switch-mode) addressed by the channel-neutral `run_id`.
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

  /**
   * Take a live run over (operator drives). A voice run returns the audio-leg coordinates. A text
   * run (sms, whatsapp, email, web or imessage) returns a hold instead: `held_by` says who holds
   * the run and until when, `lease_seconds` is how long a hold lasts after it is taken or renewed,
   * and `hold_token` is the opaque token that fences a renewal. The hold ends by itself unless
   * `renewTakeover` extends it, and taking over again as the holder keeps the hold and moves its
   * end. Another operator's live hold is a 409 with `detail.code` `run_held`; `detail.held_by` and
   * `detail.operator_name` say who. A 503 means the run is busy: try again.
   */
  async takeOver(runId: string, body: components['schemas']['RunTakeoverRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/runs/{run_id}/takeover', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
        body,
      }),
    )
  }

  /**
   * Renew the hold `takeOver` gave the operator on a text run (sms, whatsapp, email, web or
   * imessage) before it ends. A voice run has no hold. The hold lasts `lease_seconds` and ends by
   * itself unless it is renewed: this moves its end to `lease_seconds` from now, and the response
   * is the same hold (`held_by`, whose `since` stays) with its new `expires_at`. `hold_token` is
   * what fences the renewal: send the one `takeOver` returned, exactly as received. It is opaque
   * and the match is exact, so a token that was parsed into a date and written back with less
   * precision names no hold. A renewal only extends the hold it names and never takes a run.
   * After a hand back, after the hold ended, or after another operator took the run, the answer is
   * a 409 (`ConflictError`) with `detail.code` `hold_lost`, readable on `errorBody.detail`, and the
   * run stays as it is: only `takeOver` holds it again. A 503 means the run is busy: try again.
   * Beta: a workspace that is not enabled for operators gets a 403. The call acts as the signed-in
   * operator, so `operator_id` must be the caller's own and the client needs that operator's
   * identity token; a workspace API key gets a 403.
   */
  async renewTakeover(runId: string, body: components['schemas']['RunRenewRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/runs/{run_id}/takeover/renew', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
        body,
      }),
    )
  }

  /**
   * Stage the operator's reply on a text run (sms, whatsapp, email, web or imessage) the caller
   * holds. The caller needs a live hold from `takeOver`, or the answer is a 409 with `detail.code`
   * `no_hold`. The reply waits up to 2 minutes to be sent, and a hand back discards it. A run has
   * one reply waiting at a time: staging another while one waits is a 409 with `detail.code`
   * `reply_pending` and the waiting `reply_id`. The reply is handed to the agent before this
   * answers, and the agent sends it as its own message. A 200 means it was handed over, not that
   * it was sent: read what became of it with `getAuthoredTurn`. On a web conversation an external
   * user owns, no agent is started for them: `waits_for_person` is true, and the reply goes out
   * only when the person next sends a message or polls, before `expires_at`. A reply that cannot
   * be handed over is discarded, so `getAuthoredTurn` then says `expired`, and `detail.code` says
   * why: 409 `conversation_not_active`, `reply_expired`, `channel_routing_unavailable` or
   * `reply_not_deliverable`; 502 or 503 `agent_unreachable` (not sent, sending again is safe); 502
   * `agent_rejected_request` (not sent, sending again will not help); 502 `delivery_unconfirmed`
   * (it may have been sent, so check the conversation before sending again); 502
   * `conversation_read_failed` (nothing was staged or sent, sending again is safe). `text` is 1 to
   * 4,000 characters; longer is a 422, never truncated. A voice run gets a 409, because the
   * operator speaks on the call. Beta: a workspace that is not enabled for operators gets a 403.
   * The call acts as the signed-in operator, so `operator_id` must be the caller's own and the
   * client needs that operator's identity token; a workspace API key gets a 403.
   */
  async authorTurn(runId: string, body: components['schemas']['RunAuthoredTurnRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/runs/{run_id}/authored-turn', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
        body,
      }),
    )
  }

  /**
   * Read what became of the reply last staged on a text run with `authorTurn`. `state` is `none`
   * (nothing was staged), `pending` (it waits to be sent), `consumed` (it was taken to be sent) or
   * `expired` (it ran out of time, or a hand back discarded it). A reply waits up to 2 minutes.
   * `reply_id`, `operator_id`, `staged_at` and `expires_at` describe the reply and are null when
   * nothing is known about one. It needs `Operator:View`, held by the viewer, operator, member,
   * admin and owner roles, and takes no `operator_id`. Beta: a workspace that is not enabled for
   * operators gets a 403.
   */
  async getAuthoredTurn(runId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/runs/{run_id}/authored-turn', {
        params: { path: { workspace_id: this.workspaceId, run_id: runId } },
      }),
    )
  }

  /**
   * Hand a taken-over run back to the agent, and discard a reply still waiting to be sent. On a
   * text run only the operator who holds it, or a caller with `Operator:Delete` (the admin and
   * owner roles), can hand it back; anyone else gets a 403 and the hold stays. Anyone can hand
   * back a hold that has ended, and a hand back on a run nobody holds succeeds and changes
   * nothing. A 503 means the run is busy: try again.
   */
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
