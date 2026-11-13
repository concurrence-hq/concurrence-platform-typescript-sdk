import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData, scopePlatformClient } from './base.js'

export type OperationGrant = components['schemas']['OperationGrantResponse']
export type CreateOperationGrantRequest = components['schemas']['CreateOperationGrantRequest']
export type OperationGrantListResponse = components['schemas']['OperationGrantListResponse']
export type ListOperationGrantsParams =
  paths['/v1/{workspace_id}/operation_grants']['get']['parameters']['query']
export type InvokeOperationGrantRequest = components['schemas']['InvokeOperationGrantRequest']
export type InvokeOperationGrantResponse = components['schemas']['InvokeOperationGrantResponse']

/** Finite machine access to an approved, definition-pinned SQL operation. */
export class OperationGrantsResource extends WorkspaceScopedResource {
  /** Requires independent Admin/Owner authority; the machine cannot approve itself. */
  async create(body: CreateOperationGrantRequest): Promise<OperationGrant> {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/operation_grants', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Includes retained revoked approvals; continuation tokens are opaque. */
  async list(params?: ListOperationGrantsParams): Promise<OperationGrantListResponse> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operation_grants', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListOperationGrantsParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Revokes future authorization while retaining approval history. */
  async revoke(grantId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/operation_grants/{grant_id}', {
      params: { path: { workspace_id: this.workspaceId, grant_id: grantId } },
    })
  }

  /**
   * Execute with the grant's dedicated machine token. Never automatically retries;
   * a failed response can follow a committed write. Reconcile before retrying.
   */
  async invoke(
    grantId: string,
    body: InvokeOperationGrantRequest = {},
  ): Promise<InvokeOperationGrantResponse> {
    return extractData(
      await scopePlatformClient(this.client, { maxRetries: 0 }).POST(
        '/v1/{workspace_id}/operation_grants/{grant_id}/invoke',
        {
          params: { path: { workspace_id: this.workspaceId, grant_id: grantId } },
          body,
        },
      ),
    )
  }
}
