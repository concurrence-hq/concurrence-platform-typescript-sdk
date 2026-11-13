import type { components } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Sessions — operator visibility into **live agent calls**. List the
 * currently active sessions across the workspace, and inject a one-shot
 * directive (text or audio) into a specific call's session mid-flight.
 *
 * Distinct from `client.simulations.sessions` (Playground / batch testing)
 * and `client.simulations.runs.createSession` (sub-session of a multi-run
 * batch). Those are read-write fixtures; this resource controls real,
 * in-progress operator-attended calls.
 *
 * @beta New in this release; surface may evolve.
 */
export class SessionsResource extends WorkspaceScopedResource {
  /** List currently active sessions across the workspace */
  async listActive() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/sessions/active', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /**
   * Live voice fleet capacity and headroom. Operator-only.
   * The current endpoint has no fleet selector and cannot report a separate
   * tool-runner fleet. Older calls supplying options fail before transport
   * instead of returning voice capacity under the wrong interpretation.
   */
  async getFleetStatus() {
    if (arguments.length > 0) {
      throw new TypeError(
        'getFleetStatus() reports voice capacity and does not accept fleet options',
      )
    }
    return extractData(
      await this.client.GET('/v1/{workspace_id}/sessions/fleet-status', {
        params: {
          path: { workspace_id: this.workspaceId },
        },
      }),
    )
  }

  /** Inject a one-shot directive (text/audio) into a live call session */
  async inject(callSid: string, body: components['schemas']['InjectRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/sessions/{call_sid}/inject', {
        params: { path: { workspace_id: this.workspaceId, call_sid: callSid } },
        body,
      }),
    )
  }

  /** Start a web text session with a world model entity. Materializes the conversation and returns conversation_id for subsequent turns via POST /v1/{ws}/conversations/{id}/turns. */
  async start(body: components['schemas']['StartSessionRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/sessions/start', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }
}
