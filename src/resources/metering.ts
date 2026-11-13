import type { components } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Metering — emit usage events.
 */
export class MeteringResource extends WorkspaceScopedResource {
  /** Emit one metering event for the calling workspace. */
  async emit(body: components['schemas']['MeteringEmitRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/metering/emit', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }
}
