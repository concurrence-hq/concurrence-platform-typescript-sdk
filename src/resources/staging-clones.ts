import type { components, operations } from '../generated/api.js'
import type { ServiceId } from '../core/branded-types.js'
import {
  AuthenticationError,
  ConfigurationError,
  ConflictError,
  NotFoundError,
  PermissionError,
  ValidationError,
} from '../core/errors.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type StagingClonePreviewRequest = components['schemas']['StagingClonePreviewRequest']
export type StagingClonePreviewResponse = components['schemas']['StagingClonePreviewResponse']
export type StagingClonePullRequest = components['schemas']['StagingClonePullRequest']
export type StagingCloneApplyRequest = components['schemas']['StagingCloneApplyRequest']
export type StagingCloneReceipt = components['schemas']['StagingCloneReceipt']
export type StagingPairing = components['schemas']['StagingPairing']
export type StagingSourceServices = components['schemas']['StagingSourceServices']
export type StagingCloneImports = components['schemas']['StagingCloneImports']
export type StagingMirrorProposal = components['schemas']['StagingMirrorProposal']
export type StagingMirrorApplyRequest = components['schemas']['StagingMirrorApplyRequest']
export type StagingMirrorReceipt = components['schemas']['StagingMirrorReceipt']
export type StagingSourceServicesParams =
  operations['list-staging-clone-source-services']['parameters']['query']
export type StagingCloneImportsParams =
  operations['list-staging-clone-imports']['parameters']['query']

export type StagingCloneBatchRequest = Omit<
  StagingClonePullRequest,
  'source_service_id' | 'destination_workspace_id'
>
export type StagingCloneBatchResult = {
  source_service: StagingSourceServices['items'][number]
} & (
  | { status: 'imported'; receipt: StagingCloneReceipt }
  | { status: 'needs_tools'; unresolved_tools: string[] }
  | { status: 'failed'; reason: 'conflict' | 'validation' | 'not_found' | 'unavailable' }
)

/** Configuration-only service copies between production and a paired staging workspace. */
export class StagingClonesResource extends WorkspaceScopedResource {
  /**
   * Import enumerated production services into this paired staging workspace,
   * yielding one result at a time. Requires separate source and destination
   * clients and current authority in both environments. No credentials are stored.
   *
   * Each service is previewed and imported through the normal revision checks.
   * Tool mappings apply to the whole run; `needs_tools` identifies services to
   * retry after supplying staging replacements. A service failure leaves earlier
   * imports intact. Authorization failures stop the run. Breaking iteration or
   * aborting prevents subsequent work; an already committed import is retained.
   *
   * Discovery is paginated, not a workspace-wide snapshot. Retrying reauthorizes
   * each enumerated service and preserves original receipts and staging edits.
   */
  async *importAll(
    source: StagingClonesResource,
    body: StagingCloneBatchRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StagingCloneBatchResult> {
    signal?.throwIfAborted()
    const destination = signal ? this.withOptions({ signal }) : this
    const production = signal ? source.withOptions({ signal }) : source
    const pairing = await destination.getPairing()
    if (
      pairing.workspace_id !== this.workspaceId ||
      pairing.id !== body.pairing_id ||
      pairing.source_workspace_id !== body.source_workspace_id ||
      pairing.source_region !== body.source_region
    ) {
      throw new ConfigurationError('The staging pairing does not match the requested source')
    }
    let continuation_token: unknown
    do {
      signal?.throwIfAborted()
      const page = await production.listSourceServices({ limit: 200, continuation_token })
      if (
        page.source_workspace_id !== body.source_workspace_id ||
        page.source_region !== body.source_region
      ) {
        throw new ConfigurationError('The production client does not match the requested source')
      }
      for (const service of page.items) {
        signal?.throwIfAborted()
        const result = await destination.importBatchService(service, body, signal)
        yield result
      }
      continuation_token = page.has_more ? page.continuation_token : undefined
    } while (continuation_token !== undefined && continuation_token !== null)
  }

  private async importBatchService(
    service: StagingSourceServices['items'][number],
    body: StagingCloneBatchRequest,
    signal?: AbortSignal,
  ): Promise<StagingCloneBatchResult> {
    const request = {
      ...body,
      source_service_id: service.id,
      destination_workspace_id: this.workspaceId,
    }
    try {
      const preview = await this.previewImport(request)
      if (preview.plan.unresolved_tools.length) {
        return {
          source_service: service,
          status: 'needs_tools',
          unresolved_tools: preview.plan.unresolved_tools,
        }
      }
      signal?.throwIfAborted()
      const receipt = await this.importService({
        ...request,
        expected_source_digest: preview.plan.source_digest,
      })
      return { source_service: service, status: 'imported', receipt }
    } catch (error) {
      signal?.throwIfAborted()
      if (error instanceof AuthenticationError || error instanceof PermissionError) throw error
      const reason =
        error instanceof ConflictError
          ? 'conflict'
          : error instanceof ValidationError
            ? 'validation'
            : error instanceof NotFoundError
              ? 'not_found'
              : 'unavailable'
      return { source_service: service, status: 'failed', reason }
    }
  }

  /** List source service names and IDs on a production client with current administrator authority. */
  async listSourceServices(params?: StagingSourceServicesParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/staging-clones/source-services', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listSourceServicesAutoPaging(params?: StagingSourceServicesParams) {
    return this.iteratePaginatedList((pageParams) => this.listSourceServices(pageParams), params)
  }

  /** Read original local import receipts; this does not reauthorize production or assert current copy state. */
  async listImports(params?: StagingCloneImportsParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/staging-clones/imports', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listImportsAutoPaging(params?: StagingCloneImportsParams) {
    return this.iteratePaginatedList((pageParams) => this.listImports(pageParams), params)
  }

  /** Read local staging pairing metadata without contacting or authorizing the production source. */
  async getPairing() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/staging-clones/pairing', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /** Preview on the production client, using its source workspace and authority. */
  async previewSource(serviceId: ServiceId | string, body: StagingClonePreviewRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/services/{service_id}/staging-clone-preview', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
        body,
      }),
    )
  }

  /** Preview on the staging client. Supply fresh production authority in `source_token`. */
  async previewImport(body: StagingClonePullRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/staging-clones/preview', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Review incoming production changes against a staging copy without writing; conflicts retain staging values. */
  async previewMirror(body: StagingClonePullRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/staging-clones/mirror-preview', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /**
   * Apply both reviewed fingerprints and an explicit choice for every conflict.
   * Reuse the operation ID and request after an ambiguous response; the latest
   * identical operation returns its original receipt without resetting staging edits.
   */
  async applyMirror(body: StagingMirrorApplyRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/staging-clones/mirror', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Pair an existing staging workspace; identical retries preserve the original attribution. */
  async pairWorkspace(body: StagingClonePullRequest) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/staging-clones/pairing', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /**
   * Import the reviewed source digest as an inactive sandbox service. An identical
   * retry preserves the original receipt and staging edits. A changed source or
   * conflicting destination returns `ConflictError`; preview again before retrying.
   */
  async importService(body: StagingCloneApplyRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/staging-clones/import', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }
}
