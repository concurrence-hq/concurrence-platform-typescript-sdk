import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Review queue — external write proposals awaiting an operator decision.
 */
export class ReviewQueueResource extends WorkspaceScopedResource {
  /** List External Write Proposals */
  async list(
    params?: paths['/v1/{workspace_id}/external-write-proposals']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-write-proposals', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(
    params?: paths['/v1/{workspace_id}/external-write-proposals']['get']['parameters']['query'],
  ) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Approve External Write Proposal */
  async approve(proposalId: string) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/external-write-proposals/{proposal_id}/approve', {
        params: { path: { workspace_id: this.workspaceId, proposal_id: proposalId } },
      }),
    )
  }

  /** Reject External Write Proposal */
  async reject(proposalId: string, body: components['schemas']['RejectProposalRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/external-write-proposals/{proposal_id}/reject', {
        params: { path: { workspace_id: this.workspaceId, proposal_id: proposalId } },
        body,
      }),
    )
  }
}
