import type { components, operations } from '../generated/api.js'
import type { ServiceId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type StagingClonePreviewRequest = components['schemas']['StagingClonePreviewRequest']
export type StagingClonePreviewResponse = components['schemas']['StagingClonePreviewResponse']
export type StagingClonePullRequest = components['schemas']['StagingClonePullRequest']
export type StagingCloneApplyRequest = components['schemas']['StagingCloneApplyRequest']
export type StagingCloneReceipt = components['schemas']['StagingCloneReceipt']
export type StagingPairing = components['schemas']['StagingPairing']
export type StagingSourceServices = components['schemas']['StagingSourceServices']
export type StagingCloneImports = components['schemas']['StagingCloneImports']
export type StagingSourceServicesParams =
  operations['list-staging-clone-source-services']['parameters']['query']
export type StagingCloneImportsParams =
  operations['list-staging-clone-imports']['parameters']['query']

/** Configuration-only service copies between production and a paired staging workspace. */
export class StagingClonesResource extends WorkspaceScopedResource {
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
