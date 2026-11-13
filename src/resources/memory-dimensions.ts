import type { components } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Memory dimensions — define dimensions the agent remembers about an entity.
 */
export class MemoryDimensionsResource extends WorkspaceScopedResource {
  /** Create Memory Dimension */
  async create(
    body: components['schemas']['src__routes__memory_dimensions__create_memory_dimension__Request'],
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/memory/dimensions', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }
}
