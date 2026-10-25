import type { components, operations } from '../generated/api.js'
import type { ServiceId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams } from '../core/utils.js'

export interface ListServicesParams extends ListParams {
  search?: string
  type?: string
  /**
   * Only services whose `allow_unverified_integration_results` bypass is on (`true`) or off
   * (`false`). A service that never set it reads off.
   */
  allow_unverified_integration_results?: boolean
}

export type ListVoiceJudgeResultsParams = NonNullable<
  operations['list-voice-judge-recent']['parameters']['query']
>
export type VoiceJudgeResult = components['schemas']['VoiceJudgeResultRow']
export type VoiceJudgeResultListResponse = components['schemas']['VoiceJudgeRecentResponse']

/**
 * Manage services — external service configurations that agents can call.
 * Services represent integrations like scheduling systems, EHRs, or CRMs
 * that skills can interact with via their tool definitions.
 */
export class ServicesResource extends WorkspaceScopedResource {
  async create(body: components['schemas']['CreateServiceRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/services', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  async list(params?: ListServicesParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/services', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListServicesParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  async get(serviceId: ServiceId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/services/{service_id}', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
      }),
    )
  }

  async update(serviceId: ServiceId | string, body: components['schemas']['UpdateServiceRequest']) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/services/{service_id}', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
        body,
      }),
    )
  }

  /**
   * Create or replace one named version set, such as `release`, leaving the others as they
   * are. A name outside `^[A-Za-z0-9_-]+$` (max 40) or a model the gateway doesn't serve
   * throws `ValidationError`. A pinned agent or context graph version that doesn't exist
   * throws `NotFoundError`.
   */
  async upsertVersionSet(
    serviceId: ServiceId | string,
    name: string,
    body: components['schemas']['UpsertVersionSetRequest'],
  ): Promise<void> {
    await this.client.PUT('/v1/{workspace_id}/services/{service_id}/version-sets/{name}', {
      params: { path: { workspace_id: this.workspaceId, service_id: serviceId, name } },
      body,
    })
  }

  async delete(serviceId: ServiceId | string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/services/{service_id}', {
      params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
    })
  }

  /**
   * Recent voice-judge scores for a service's calls, newest first. Page with `limit`
   * (default 20, max 100) and `offset`. Throws `ServiceUnavailableError` when the analytics
   * warehouse is unavailable.
   */
  async listVoiceJudgeResults(serviceId: ServiceId | string, params?: ListVoiceJudgeResultsParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/services/{service_id}/voice-judge/recent', {
        params: {
          path: { workspace_id: this.workspaceId, service_id: serviceId },
          query: params,
        },
      }),
    )
  }
}
