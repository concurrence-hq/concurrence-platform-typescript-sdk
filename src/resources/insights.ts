import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type ListInsightPinsParams = NonNullable<
  paths['/v1/{workspace_id}/insights/pins']['get']['parameters']['query']
>
export type DeleteInsightPinParams =
  paths['/v1/{workspace_id}/insights/pins/{pin_id}']['delete']['parameters']['query']

/**
 * Insights — natural-language analytics on workspace data.
 *
 * Surfaces the schema browser, suggestion catalog, ad-hoc SQL execution,
 * chat sessions that reason over call/world data, the retained query results
 * behind an answer, and the workspace's shared pins. Used by the developer
 * console's Insights tab.
 *
 * Cancel any call with `client.insights.withOptions({ signal })`.
 *
 * @beta New in this release; surface may evolve.
 */
export class InsightsResource extends WorkspaceScopedResource {
  /** Get the periodic insights digest for the workspace */
  async getDigest() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/insights/digest', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /**
   * Read the fixed Home facts (agents, conversations, judged checks) of the workspace's
   * published synthetic dataset. Rejects with `ServiceUnavailableError` (503) when no
   * consistent publication is available.
   */
  async getDemoHome() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/insights/demo-home', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /** Fetch the queryable schema (tables, columns, joins) the assistant uses */
  async getSchema() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/insights/schema', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /** Get curated query suggestions for the workspace */
  async getSuggestions() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/insights/suggestions', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /** Run an ad-hoc SQL query against the insights warehouse */
  async runSql(body: components['schemas']['SqlQueryRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/insights/sql', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  readonly sessions = {
    /** Start a new insights chat session */
    create: async () =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/insights/sessions', {
          params: { path: { workspace_id: this.workspaceId } },
        }),
      ),

    /** Get a session and its full history */
    get: async (sessionId: string) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/insights/sessions/{session_id}', {
          params: { path: { workspace_id: this.workspaceId, session_id: sessionId } },
        }),
      ),

    /** Send a chat message and get the assistant's response (with any generated SQL/results) */
    chat: async (sessionId: string, body: components['schemas']['ChatRequest']) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/insights/sessions/{session_id}/chat', {
          params: { path: { workspace_id: this.workspaceId, session_id: sessionId } },
          body,
        }),
      ),

    /**
     * Read one retained query result of a session: executed SQL, typed columns and the
     * original cells as strings. Only the session's own caller can read it, and only
     * while the session retains it.
     */
    getResult: async (sessionId: string, resultId: string) =>
      extractData(
        await this.client.GET(
          '/v1/{workspace_id}/insights/sessions/{session_id}/results/{result_id}',
          {
            params: {
              path: { workspace_id: this.workspaceId, session_id: sessionId, result_id: resultId },
            },
          },
        ),
      ),
  }

  /**
   * Shared pins: one saved metric or chart per pin, visible to the whole workspace.
   *
   * Every change after creation carries the `revision` the caller last read. A stale
   * revision, or an Undo after its window, fails with a 409 `ConflictError`.
   */
  readonly pins = {
    /** List one page of active pins, oldest first */
    list: async (params?: ListInsightPinsParams) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/insights/pins', {
          params: { path: { workspace_id: this.workspaceId }, query: params },
        }),
      ),

    /** Iterate every active pin, following `continuation_token` */
    listAutoPaging: (params?: ListInsightPinsParams) =>
      this.iteratePaginatedList((pageParams) => this.pins.list(pageParams), params),

    /** Get one active pin with its captured evidence */
    get: async (pinId: string) =>
      extractData(
        await this.client.GET('/v1/{workspace_id}/insights/pins/{pin_id}', {
          params: { path: { workspace_id: this.workspaceId, pin_id: pinId } },
        }),
      ),

    /** Pin a presentation from one of the caller's own sessions */
    create: async (body: components['schemas']['CreatePinRequest']) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/insights/pins', {
          params: { path: { workspace_id: this.workspaceId } },
          body,
        }),
      ),

    /**
     * Re-run the pin's saved query. A failed refresh still resolves: the pin keeps its
     * last successful result and reports the failure in `refresh_error`.
     */
    refresh: async (pinId: string, body: components['schemas']['PinRevisionRequest']) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/insights/pins/{pin_id}/refresh', {
          params: { path: { workspace_id: this.workspaceId, pin_id: pinId } },
          body,
        }),
      ),

    /** Unpin for the whole workspace. The returned pin carries `undo_until`. */
    delete: async (pinId: string, params: DeleteInsightPinParams) =>
      extractData(
        await this.client.DELETE('/v1/{workspace_id}/insights/pins/{pin_id}', {
          params: { path: { workspace_id: this.workspaceId, pin_id: pinId }, query: params },
        }),
      ),

    /** Restore an unpinned pin within its Undo window */
    undo: async (pinId: string, body: components['schemas']['PinRevisionRequest']) =>
      extractData(
        await this.client.POST('/v1/{workspace_id}/insights/pins/{pin_id}/undo', {
          params: { path: { workspace_id: this.workspaceId, pin_id: pinId } },
          body,
        }),
      ),
  }
}
