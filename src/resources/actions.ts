import type { components, paths } from '../generated/api.js'
import type { ActionId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams } from '../core/utils.js'

type ActionsListQuery = NonNullable<
  NonNullable<paths['/v1/{workspace_id}/skills']['get']['parameters']['query']>
>

export interface ListActionsParams extends ListParams {
  search?: string
  enabled?: boolean
  sort_by?: ActionsListQuery['sort_by']
}

export type IdentityGroupLifecycleActionRequest =
  components['schemas']['IdentityGroupLifecycleActionRequest']
export type IdentityGroupLifecycleActionResponse =
  components['schemas']['IdentityGroupLifecycleActionResponse']

export type IdentityLifecycleActionRequest = components['schemas']['IdentityLifecycleActionRequest']
export type IdentityLifecycleActionResponse =
  components['schemas']['IdentityLifecycleActionResponse']

/**
 * Manage actions — reusable AI capabilities that agents can call.
 * Actions define structured input/output schemas and execution settings.
 *
 * Note: The underlying API paths use `/skills/` for backward compatibility.
 */
export class ActionsResource extends WorkspaceScopedResource {
  /** Bind one connection's saved lifecycle configuration to its reconciliation action. */
  async putIdentityLifecycle(connectionId: string, body: IdentityLifecycleActionRequest) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/skills/identity-lifecycle/{connection_id}', {
        params: { path: { workspace_id: this.workspaceId, connection_id: connectionId } },
        body,
      }),
    )
  }

  /** Read the saved action binding. This does not establish directory authority or a running schedule. */
  async getIdentityLifecycle(connectionId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/skills/identity-lifecycle/{connection_id}', {
        params: { path: { workspace_id: this.workspaceId, connection_id: connectionId } },
      }),
    )
  }

  /** Save the exact revisions for one SSO group reconciliation action. This does not enable the mapping. */
  async putIdentityGroupLifecycle(mappingId: string, body: IdentityGroupLifecycleActionRequest) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/skills/identity-lifecycle/groups/{mapping_id}', {
        params: { path: { workspace_id: this.workspaceId, mapping_id: mappingId } },
        body,
      }),
    )
  }

  /** Read one saved group action. An action binding does not establish a running schedule. */
  async getIdentityGroupLifecycle(mappingId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/skills/identity-lifecycle/groups/{mapping_id}', {
        params: { path: { workspace_id: this.workspaceId, mapping_id: mappingId } },
      }),
    )
  }

  /** Create a new action */
  async create(body: components['schemas']['CreateSkillRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/skills', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** List actions in the workspace */
  async list(params?: ListActionsParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/skills', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListActionsParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Get a single action */
  async get(actionId: ActionId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/skills/{skill_id}', {
        params: { path: { workspace_id: this.workspaceId, skill_id: actionId } },
      }),
    )
  }

  /** Update an action */
  async update(actionId: ActionId | string, body: components['schemas']['UpdateSkillRequest']) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/skills/{skill_id}', {
        params: { path: { workspace_id: this.workspaceId, skill_id: actionId } },
        body,
      }),
    )
  }

  /** Delete an action */
  async delete(actionId: ActionId | string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/skills/{skill_id}', {
      params: { path: { workspace_id: this.workspaceId, skill_id: actionId } },
    })
  }

  /** Get all context graphs and services that reference this action */
  async getReferences(actionId: ActionId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/skills/{skill_id}/references', {
        params: { path: { workspace_id: this.workspaceId, skill_id: actionId } },
      }),
    )
  }

  /**
   * Test an action with a sample input.
   * Executes the action in a sandbox and returns the result.
   */
  async test(actionId: ActionId | string, body: components['schemas']['TestSkillRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/skills/{skill_id}/test', {
        params: { path: { workspace_id: this.workspaceId, skill_id: actionId } },
        body,
      }),
    )
  }
}
