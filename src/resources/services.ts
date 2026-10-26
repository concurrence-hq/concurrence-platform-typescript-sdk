import type { components, operations } from '../generated/api.js'
import type { ServiceId } from '../core/branded-types.js'
import { ConfigurationError } from '../core/errors.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams } from '../core/utils.js'

export interface ListServicesParams extends ListParams {
  search?: string
  type?: string
}

export type ListVoiceJudgeResultsParams = NonNullable<
  operations['list-voice-judge-recent']['parameters']['query']
>
/** One dynamic behavior pin on a version set: a library set at an exact version. */
export type DynamicBehaviorPin = components['schemas']['VersionSetBehaviorPin']
export type VoiceJudgeResult = components['schemas']['VoiceJudgeResultRow']
export type VoiceJudgeResultListResponse = components['schemas']['VoiceJudgeRecentResponse']

function storedPins(service: components['schemas']['ServiceResponse'], versionSetName: string) {
  const entry = service.version_sets[versionSetName]
  if (!entry) {
    throw new ConfigurationError(
      `Service ${service.id} has no version set named '${versionSetName}'`,
    )
  }
  return { entry, pins: entry.dynamic_behavior_sets ?? [] }
}

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

  /**
   * Set one dynamic behavior pin on a service's named version set, such as `release`, and
   * leave every other pin and every other field of that version set as it is.
   *
   * The version set endpoint replaces the whole entry it is given, so this reads the service,
   * takes the stored entry, changes the one pin whose `set_id` matches and writes the whole
   * entry back, with the other pins in their stored order and byte for byte as read. A pin for
   * a set the version set doesn't pin yet goes on the end. A pin is replaced whole, not merged:
   * `enabled` left out is `true` and `states` left out is empty, which applies in every state,
   * whatever the stored pin had. A version set pins a set once. Pins keep the order they are
   * stored in, which breaks ties between behaviors that fit equally well.
   *
   * Concurrency: the write carries the `updated_at` the read returned as `expected_updated_at`.
   * If anything on the service changed in between, including an edit that has nothing to do
   * with pins, the API stores nothing and this throws `ConflictError` (409) with the API's body.
   * The helper does not retry; call it again and it reads the service again. The check holds
   * for the whole service row, so it is a compare and swap and two callers cannot overwrite each
   * other's pins. The endpoint returns no `updated_at`, so read the service again before relying
   * on one.
   *
   * Throws `ConfigurationError`, before any write, when the service has no version set called
   * `versionSetName`; this helper does not create one. The API checks the pin: the set and
   * version have to exist (`NotFoundError`), the set can't be archived (`ConflictError`), every
   * `states` entry has to be an action or data collection state of the graph version the
   * version set runs, and there are at most 254 pins, one per set, whose enabled conditions and
   * examples fit 160,000 characters together (`ValidationError`). Pinning a replace-mode
   * version, or changing the pin of one, needs the `platform:admin` scope, which no workspace
   * API key carries (`PermissionError`). The write also needs the `Service.update` permission.
   *
   * A pin takes effect for calls and conversations that load the service's configuration after
   * the write; a call already in progress can keep the one it loaded.
   */
  async setDynamicBehaviorPin(
    serviceId: ServiceId | string,
    versionSetName: string,
    pin: DynamicBehaviorPin,
  ): Promise<void> {
    const service = await this.get(serviceId)
    const { entry, pins } = storedPins(service, versionSetName)
    const at = pins.findIndex(({ set_id }) => set_id === pin.set_id)
    const next =
      at === -1 ? [...pins, pin] : pins.map((stored, index) => (index === at ? pin : stored))
    await this.upsertVersionSet(serviceId, versionSetName, {
      version_set: { ...entry, dynamic_behavior_sets: next },
      expected_updated_at: service.updated_at,
    })
  }

  /**
   * Clear one dynamic behavior pin, by set id, from a service's named version set, and leave
   * every other pin and every other field of that version set as it is. Clearing the last pin
   * writes an empty list. The other pins keep their stored order and go back byte for byte as
   * read.
   *
   * If the version set doesn't pin that set, nothing is written and the call returns. A
   * disabled pin counts as pinned, so it is cleared too.
   *
   * Concurrency, the `ConfigurationError` for a missing version set, and the permissions are the
   * same as `setDynamicBehaviorPin`: the write carries the `updated_at` of the read as
   * `expected_updated_at`, so a change to the service in between throws `ConflictError` (409)
   * and stores nothing. Removing a replace-mode pin does not need the `platform:admin` scope.
   * To disable a pin instead of removing it, call `setDynamicBehaviorPin` with `enabled: false`.
   */
  async clearDynamicBehaviorPin(
    serviceId: ServiceId | string,
    versionSetName: string,
    setId: string,
  ): Promise<void> {
    const service = await this.get(serviceId)
    const { entry, pins } = storedPins(service, versionSetName)
    if (!pins.some(({ set_id }) => set_id === setId)) return
    await this.upsertVersionSet(serviceId, versionSetName, {
      version_set: {
        ...entry,
        dynamic_behavior_sets: pins.filter(({ set_id }) => set_id !== setId),
      },
      expected_updated_at: service.updated_at,
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
