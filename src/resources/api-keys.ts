import type { components } from '../generated/api.js'
import type { ApiKeyId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams } from '../core/utils.js'

/**
 * Manage API keys for a workspace.
 *
 * API keys are used to authenticate SDK/API requests. Each key has a role
 * and a set of permissions. New and rotated keys expire after 1-90 days.
 * Existing keys may have no expiry set; their expiry fields are null.
 */
export class ApiKeysResource extends WorkspaceScopedResource {
  /**
   * Get info about the currently authenticated API key.
   * Does not require a workspace ID in the path.
   */
  async me() {
    return extractData(await this.client.GET('/v1/auth/me', {}))
  }

  /** Create a new API key */
  async create(body: components['schemas']['CreateApiKeyRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/api-keys', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** List API keys in the workspace */
  async list(params?: ListParams & { mine_only?: boolean }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/api-keys', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListParams & { mine_only?: boolean }) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Revoke an API key */
  async revoke(keyId: ApiKeyId | string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/api-keys/{key_id}', {
      params: { path: { workspace_id: this.workspaceId, key_id: keyId } },
    })
  }

  /** Rotate an API key — invalidates the old key and issues a new one */
  async rotate(keyId: ApiKeyId | string, body: components['schemas']['RotateApiKeyRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/api-keys/{key_id}/rotate', {
        params: { path: { workspace_id: this.workspaceId, key_id: keyId } },
        body,
      }),
    )
  }
}
