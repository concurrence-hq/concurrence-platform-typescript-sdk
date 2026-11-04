import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Scheduling rule sets — rules that constrain how agents schedule appointments.
 */
export class SchedulingRuleSetsResource extends WorkspaceScopedResource {
  /** List all scheduling rule sets for the workspace. Optional filters: `agent_kind` (tms / ketamine / general), `is_active`. Used by the agent's scheduling rules engine and by operators inspecting config. */
  async list(
    params?: paths['/v1/{workspace_id}/scheduling-rule-sets']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/scheduling-rule-sets', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(
    params?: paths['/v1/{workspace_id}/scheduling-rule-sets']['get']['parameters']['query'],
  ) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Create one rule set for `(agent_kind, rule_kind)`. Returns 409 if a row already exists for that key — use PATCH on the existing row or DELETE first. */
  async create(body: components['schemas']['CreateSchedulingRuleSetRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/scheduling-rule-sets', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Fetch one rule set by id. Returns 404 when the row doesn't exist in this workspace (the RLS policy means cross-workspace lookups surface as 404, never as a row from the wrong workspace). */
  async get(ruleSetId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/scheduling-rule-sets/{rule_set_id}', {
        params: { path: { workspace_id: this.workspaceId, rule_set_id: ruleSetId } },
      }),
    )
  }

  /** Update `params` and/or `is_active` on an existing rule set. `agent_kind` and `rule_kind` are immutable — to change either, create a new rule set and delete the old one. */
  async update(ruleSetId: string, body: components['schemas']['UpdateSchedulingRuleSetRequest']) {
    return extractData(
      await this.client.PATCH('/v1/{workspace_id}/scheduling-rule-sets/{rule_set_id}', {
        params: { path: { workspace_id: this.workspaceId, rule_set_id: ruleSetId } },
        body,
      }),
    )
  }

  /** Hard-delete. The audit log retains the deletion record. */
  async delete(ruleSetId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/scheduling-rule-sets/{rule_set_id}', {
      params: { path: { workspace_id: this.workspaceId, rule_set_id: ruleSetId } },
    })
  }
}
