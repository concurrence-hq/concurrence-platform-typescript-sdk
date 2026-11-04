import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * External identity bindings — link external-system identities to workspace identities.
 */
export class ExternalIdentityBindingsResource extends WorkspaceScopedResource {
  /** List External Identity Bindings */
  async list(
    params?: paths['/v1/{workspace_id}/external-identity-bindings']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-identity-bindings', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(
    params?: paths['/v1/{workspace_id}/external-identity-bindings']['get']['parameters']['query'],
  ) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Upsert External Identity Binding */
  async upsert(body: components['schemas']['BindingUpsertRequest']) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/external-identity-bindings', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Get External Identity Binding */
  async get(bindingId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-identity-bindings/{binding_id}', {
        params: { path: { workspace_id: this.workspaceId, binding_id: bindingId } },
      }),
    )
  }

  /** Delete External Identity Binding */
  async delete(bindingId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/external-identity-bindings/{binding_id}', {
      params: { path: { workspace_id: this.workspaceId, binding_id: bindingId } },
    })
  }
}
