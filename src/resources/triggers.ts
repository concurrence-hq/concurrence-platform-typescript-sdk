import type { components, operations } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams } from '../core/utils.js'

export type ListTriggersParams = NonNullable<operations['list-triggers']['parameters']['query']>
export type FireTriggerRequest = components['schemas']['FireTriggerRequest']

export class TriggersResource extends WorkspaceScopedResource {
  async list(params?: ListTriggersParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/triggers', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListTriggersParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  async create(body: components['schemas']['CreateTriggerRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/triggers', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  async get(triggerId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/triggers/{trigger_id}', {
        params: { path: { workspace_id: this.workspaceId, trigger_id: triggerId } },
      }),
    )
  }

  async update(triggerId: string, body: components['schemas']['UpdateTriggerRequest']) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/triggers/{trigger_id}', {
        params: { path: { workspace_id: this.workspaceId, trigger_id: triggerId } },
        body,
      }),
    )
  }

  async delete(triggerId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/triggers/{trigger_id}', {
      params: { path: { workspace_id: this.workspaceId, trigger_id: triggerId } },
    })
  }

  /**
   * Fire a trigger immediately. The optional body carries per-fire `input`
   * overrides merged into the trigger's `input_template` at fire time.
   *
   * The spec types the body as `FireTriggerRequest | null`, but the `null`
   * branch only matters when the caller wants to *explicitly* clear the
   * body. Modeling as `body?: FireTriggerRequest` keeps the SDK surface
   * consistent with the other optional-body POST wrappers.
   */
  async fire(triggerId: string, body?: FireTriggerRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/triggers/{trigger_id}/fire', {
        params: { path: { workspace_id: this.workspaceId, trigger_id: triggerId } },
        body,
      }),
    )
  }

  async pause(triggerId: string) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/triggers/{trigger_id}/pause', {
        params: { path: { workspace_id: this.workspaceId, trigger_id: triggerId } },
      }),
    )
  }

  async resume(triggerId: string) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/triggers/{trigger_id}/resume', {
        params: { path: { workspace_id: this.workspaceId, trigger_id: triggerId } },
      }),
    )
  }

  async listRuns(triggerId: string, params?: ListParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/triggers/{trigger_id}/runs', {
        params: { path: { workspace_id: this.workspaceId, trigger_id: triggerId }, query: params },
      }),
    )
  }

  listRunsAutoPaging(triggerId: string, params?: ListParams) {
    return this.iteratePaginatedList((pageParams) => this.listRuns(triggerId, pageParams), params)
  }
}
