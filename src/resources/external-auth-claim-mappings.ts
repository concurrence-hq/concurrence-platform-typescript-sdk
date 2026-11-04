import type { components, paths } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * External auth claim mappings — versioned rules that map external identity claims to workspace roles.
 */
export class ExternalAuthClaimMappingsResource extends WorkspaceScopedResource {
  /** List Claim Mappings */
  async list(
    params?: paths['/v1/{workspace_id}/external-auth-claim-mappings']['get']['parameters']['query'],
  ) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-auth-claim-mappings', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(
    params?: paths['/v1/{workspace_id}/external-auth-claim-mappings']['get']['parameters']['query'],
  ) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Create Claim Mapping */
  async create(
    body: components['schemas']['src__routes__external_auth_claim_mappings__CreateRequest'],
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/external-auth-claim-mappings', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Dry-run the SAME resolver the per-turn path uses — read-only, never writes. */
  async resolvePreview(body: components['schemas']['ResolvePreviewRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/external-auth-claim-mappings/resolve-preview', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Get Claim Mapping */
  async get(mappingId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-auth-claim-mappings/{mapping_id}', {
        params: { path: { workspace_id: this.workspaceId, mapping_id: mappingId } },
      }),
    )
  }

  /** Supersede an active mapping (immutable history) — flip active → superseded. */
  async supersede(mappingId: string) {
    return extractData(
      await this.client.POST(
        '/v1/{workspace_id}/external-auth-claim-mappings/{mapping_id}/supersede',
        {
          params: { path: { workspace_id: this.workspaceId, mapping_id: mappingId } },
        },
      ),
    )
  }
}
