import type { components } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type ClientConfig = components['schemas']['ClientConfigResponse']

/**
 * Client config: platform values that are safe to embed in browser code, such as the Google
 * Maps key (restricted by referrer at the provider). The values are the same for every
 * workspace; the workspace path only scopes the auth.
 */
export class ClientConfigResource extends WorkspaceScopedResource {
  async get() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/config/client', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }
}
