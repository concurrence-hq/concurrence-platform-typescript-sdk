import type { components, operations, paths } from '../generated/api.js'
import type { ServiceId } from '../core/branded-types.js'
import { ConfigurationError } from '../core/errors.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams, WithResponseMetadata } from '../core/utils.js'

export interface ListServicesParams extends ListParams {
  search?: string
  type?: string
}

export type GetServiceConfigurationIdentityParams = NonNullable<
  operations['get-service-configuration-identity']['parameters']['query']
>
export type ServiceConfigurationIdentityResponse =
  components['schemas']['ServiceConfigurationIdentityResponse']
export type PromoteServiceConfigurationRequest =
  components['schemas']['PromoteServiceConfigurationRequest']
export type ServicePromotionReceipt = components['schemas']['ServicePromotionReceipt']

export type ListVoiceJudgeResultsParams = NonNullable<
  operations['list-voice-judge-recent']['parameters']['query']
>
/** One dynamic behavior pin on a version set: a library set at an exact version. */
export type DynamicBehaviorPin = components['schemas']['VersionSetBehaviorPin']
export type SetServiceSettingsRequest = components['schemas']['SetServiceSettingsRequest']
export type SetHarnessPinsRequest = components['schemas']['SetHarnessPinsRequest']
export type VoiceJudgeResult = components['schemas']['VoiceJudgeResultRow']
export type ServicePlan = components['schemas']['ServicePlanResponse']
export type VoiceJudgeResultListResponse = components['schemas']['VoiceJudgeRecentResponse']

/** Set ids are UUIDs: the API returns them in lower case, and a caller may pass any case. */
function sameSetId(stored: string, given: string) {
  return stored.toLowerCase() === given.toLowerCase()
}

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

  /**
   * Read the configuration digest for an explicitly selected version set, without returning
   * the configuration. Pass the returned `updated_at` unchanged as `expected_updated_at`
   * on a conditional settings, harness pins or version set write. Keep it as a string:
   * converting through `Date` loses sub-millisecond precision.
   *
   * The timestamp guards only the service row. Referenced configurations and defaults can
   * change the digest without changing that timestamp; it does not lock the whole config.
   */
  async getConfigurationIdentity(
    serviceId: ServiceId | string,
    params: GetServiceConfigurationIdentityParams,
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/services/{service_id}/configuration-identity', {
        params: {
          path: { workspace_id: this.workspaceId, service_id: serviceId },
          query: params,
        },
      }),
    )
  }

  /**
   * Promote a reviewed configuration: store `version_set` as `target_version_set`, with the
   * service's harness pins and settings when the request names them, in one write. The write
   * lands only while the service is at `expected_updated_at` and every `reviewed_base` entry
   * still has the digest `getConfigurationIdentity` returned at review. Keep `updated_at` as
   * the string the API returned.
   *
   * Resolves to the receipt for both a first promotion (201) and a repeat of a promotion that
   * already landed (200, nothing written); `lastResponse.statusCode` on the result tells them
   * apart. The receipt is historical configuration evidence: its `service_config_digest` is
   * the digest of the target configuration that promotion committed. It
   * is not proof of what the service stores now, nor of what any session loaded or ran.
   *
   * `request_id` is the caller's: generate one UUID per promotion and keep it with the request.
   * The SDK never generates or changes it. The normal POST retry policy still applies to
   * 429 with `Retry-After`; 409, 422 and 503 are not retried automatically.
   * To retry an unknown outcome, send the same request unchanged with the same `request_id` from the same
   * credential. The same id with a different request throws `ConflictError`
   * (`promotion_request_mismatch`).
   *
   * Refusals keep the API's body on `errorBody.detail`:
   * - `ConflictError` (409): `promotion_base_changed` with `changed`, or
   *   `promotion_request_mismatch`, or an archived dynamic behavior pin. Nothing was stored.
   * - `ValidationError` (422): `promotion_versions_not_explicit`, `promotion_base_incomplete`
   *   with `version_sets`, or a version set, pin or setting a service write refuses.
   * - `ServiceUnavailableError` (503): `promotion_lock_timeout` and `harness_bake_unconfirmed`
   *   stored nothing. `promotion_transaction_timeout` carries `outcome`: `not_stored`, or
   *   `unknown` when the deadline passed while the commit was being acknowledged, so the
   *   promotion may have been stored.
   *
   * After an `unknown` outcome, a timeout or a lost response, the identical retry is how to
   * learn the result: it resolves to the stored receipt, or runs as a new attempt. Needs the
   * `Service.update` permission, on every call including a retry.
   */
  async promoteConfiguration(
    serviceId: ServiceId | string,
    body: PromoteServiceConfigurationRequest,
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/services/{service_id}/promotions', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
        body,
      }),
    )
  }

  /** The reply checks a service runs, each with its effective mode and the layer it comes from. */
  async getSafety(serviceId: ServiceId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/services/{service_id}/safety', {
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
   * Plan `create` with the body it takes. Writes nothing: `problems` lists each refusal the
   * save would answer with, `changes` the field diff, `families` each version set's voice
   * family and `readiness` the readback of what the save would store.
   */
  async planCreate(body: components['schemas']['CreateServiceRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/services/plan', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Plan `update` with the body it takes. Writes nothing; see `planCreate`. */
  async planUpdate(
    serviceId: ServiceId | string,
    body: components['schemas']['UpdateServiceRequest'],
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/services/{service_id}/plan', {
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
   * entry back, with the other pins unchanged and in their stored order. A pin for
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
   * version set runs and is listed once, and there are at most 254 pins, one per set and no two
   * sets with the same name ignoring case, whose enabled conditions and examples fit 160,000
   * characters together; on a `gpt_realtime` service an enabled pin is refused (`ValidationError`). The write needs the
   * `Service.update` permission, for a pin on an `add`- or `replace`-mode version alike.
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
    const at = pins.findIndex(({ set_id }) => sameSetId(set_id, pin.set_id))
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
   * writes an empty list. The other pins keep their stored order and go back unchanged.
   *
   * If the version set doesn't pin that set, nothing is written and the call returns. A
   * disabled pin counts as pinned, so it is cleared too.
   *
   * Concurrency, the `ConfigurationError` for a missing version set, and the permissions are the
   * same as `setDynamicBehaviorPin`: the write carries the `updated_at` of the read as
   * `expected_updated_at`, so a change to the service in between throws `ConflictError` (409)
   * and stores nothing.
   * To disable a pin instead of removing it, call `setDynamicBehaviorPin` with `enabled: false`.
   */
  async clearDynamicBehaviorPin(
    serviceId: ServiceId | string,
    versionSetName: string,
    setId: string,
  ): Promise<void> {
    const service = await this.get(serviceId)
    const { entry, pins } = storedPins(service, versionSetName)
    if (!pins.some(({ set_id }) => sameSetId(set_id, setId))) return
    await this.upsertVersionSet(serviceId, versionSetName, {
      version_set: {
        ...entry,
        dynamic_behavior_sets: pins.filter(({ set_id }) => !sameSetId(set_id, setId)),
      },
      expected_updated_at: service.updated_at,
    })
  }

  /**
   * The service's own setting values, and each setting the API lists for the harnesses it
   * runs, with the value it runs on and where that value comes from: `service`, else
   * `harness_default`. That covers the settings a harness release declares and the
   * platform's Core-owned settings, which stay available on a pin to an external release.
   */
  async getSettings(serviceId: ServiceId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/services/{service_id}/settings', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
      }),
    )
  }

  /**
   * Replace the service's setting values. A key applies to every harness of the service whose
   * schema lists it, Core-owned settings included, and its value has to satisfy each listing
   * spec's type, bounds and choices (`ValidationError` otherwise). A key left out runs the
   * harness default, and a PUT of the values the service already stores writes nothing. Every
   * change is audited. Needs the `Service.update` permission.
   *
   * Pass the service's `updated_at` string unchanged as `expected_updated_at` to refuse
   * a stale write with `ConflictError` (409), including a no-op. The SDK does not retry it.
   * This checks the service row only; see `getConfigurationIdentity` for its limits.
   */
  async setSettings(serviceId: ServiceId | string, body: SetServiceSettingsRequest) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/services/{service_id}/settings', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
        body,
      }),
    )
  }

  /**
   * Every setting available for each voice and text harness the service runs: its type,
   * bounds, choices, default and description, with the harness, the release it runs and the
   * schema's version. The list holds the settings the harness release declares and the
   * platform's Core-owned settings, which stay available when the service pins an external
   * release. The response does not say which of the two a setting is, so treat this schema,
   * not a release's own declaration, as the list of settings a service can store.
   */
  async getSettingsSchema(serviceId: ServiceId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/services/{service_id}/settings/schema', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
      }),
    )
  }

  /**
   * The service's harness pins, and the release each voice and text harness runs on its calls:
   * the service's pin, else the harness default.
   */
  async getHarnesses(serviceId: ServiceId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/services/{service_id}/harnesses', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
      }),
    )
  }

  /**
   * Replace the service's harness pins. A pin names a registered release exactly, or is
   * `{ kind, harness, tag: 'in-tree' }`. A harness left out follows its default, so setting a
   * pin back is the rollback, and `pins: []` clears every pin. A release the running
   * agent-engine image does not carry yet is refused. A change that would leave stored settings
   * no harness declares is refused with `ValidationError` listing them, unless `drop_orphaned`
   * is `true`, which deletes them. Every change is audited. Needs the `Service.update`
   * permission.
   *
   * Pass the service's `updated_at` string unchanged as `expected_updated_at` to refuse
   * a stale write with `ConflictError` (409), including a no-op, without storing or dropping
   * anything. The SDK does not retry it. This checks the service row only; see
   * `getConfigurationIdentity` for its limits.
   */
  async setHarnessPins(serviceId: ServiceId | string, body: SetHarnessPinsRequest) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/services/{service_id}/harness-pins', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
        body,
      }),
    )
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

  /** Return configuration-only instructions for explicit call context. */
  async previewPrompt(
    serviceId: string,
    body: components['schemas']['PromptPreviewContext-Input'],
    params: paths['/v1/{workspace_id}/services/{service_id}/prompt-preview']['post']['parameters']['query'],
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/services/{service_id}/prompt-preview', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId }, query: params },
        body,
      }),
    )
  }

  /** Read current configuration and uncached dial eligibility using service read permission. */
  async getReadiness(serviceId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/services/{service_id}/readiness', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
      }),
    )
  }

  /**
   * Run one voice-note turn against the service's agent. `audio` is the caller's recording and
   * `phoneNumber` is E.164. Resolves to the agent's spoken reply as audio, or `undefined` when
   * the service has no reply to send. Pass `accept: 'audio/wav'` for PCM16 WAV instead of OGG Opus.
   */
  async sendVoiceTurn(
    serviceId: ServiceId | string,
    params: { audio: Blob; phoneNumber: string; accept?: string },
  ): Promise<WithResponseMetadata<Blob>> {
    const form = new FormData()
    form.append('audio', params.audio)
    form.append('phone_number', params.phoneNumber)
    return extractData(
      await this.client.POST('/v1/{workspace_id}/services/{service_id}/voice-turn', {
        params: {
          path: { workspace_id: this.workspaceId, service_id: serviceId },
          header: { accept: params.accept },
        },
        // The generated multipart body types `audio` as a string; the form carries the bytes.
        body: form as unknown as components['schemas']['Body_voice-turn'],
        parseAs: 'blob',
      }),
    )
  }
}
