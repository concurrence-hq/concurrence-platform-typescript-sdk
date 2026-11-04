import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Models — models available to the workspace.
 */
export class ModelsResource extends WorkspaceScopedResource {
  /** Every model the workspace's data residency allows in its region. A regional workspace sees only the models whose every request path stays in the region's geography. Any role. */
  async list() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/models', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }
}
