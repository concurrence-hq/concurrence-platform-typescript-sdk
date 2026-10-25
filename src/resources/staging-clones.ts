import type { components } from '../generated/api.js'
import type { ServiceId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type StagingClonePreviewRequest = components['schemas']['StagingClonePreviewRequest']
export type StagingClonePreviewResponse = components['schemas']['StagingClonePreviewResponse']
export type StagingClonePullRequest = components['schemas']['StagingClonePullRequest']
export type StagingCloneApplyRequest = components['schemas']['StagingCloneApplyRequest']
export type StagingCloneReceipt = components['schemas']['StagingCloneReceipt']
export type StagingPairing = components['schemas']['StagingPairing']

/** Configuration-only service copies between production and a paired staging workspace. */
export class StagingClonesResource extends WorkspaceScopedResource {
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
