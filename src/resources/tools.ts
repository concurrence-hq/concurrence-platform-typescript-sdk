import type { components } from '../generated/api.js'
import type { ServiceId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Tools — manual execution of integration-backed tool calls (used by the
 * tool-testing surface in the developer console) and per-service resolution
 * of which concrete tool implementations bind to a service's tool slots.
 *
 * @beta New in this release; surface may evolve.
 */
export class ToolsResource extends WorkspaceScopedResource {
  /** Manually execute a tool call against the workspace's integrations */
  async execute(body: components['schemas']['ToolExecuteRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/tools/execute', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Resolve the bound tool implementations for a service */
  async resolveForService(serviceId: ServiceId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/services/{service_id}/tools/resolve', {
        params: { path: { workspace_id: this.workspaceId, service_id: serviceId } },
      }),
    )
  }

  /**
   * List the platform's built-in world and surface tools, read live from the agent engine's
   * registry. The catalog is the same for every workspace. Needs service update permission;
   * throws `ServiceUnavailableError` when the agent engine can't be reached.
   */
  async listCatalog() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/tools/catalog', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }
}
