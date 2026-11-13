import type { components } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/**
 * Use cases — bind a use case to the service that runs it.
 */
export class UseCasesResource extends WorkspaceScopedResource {
  /** Return the platform service this use case is bound to in this workspace, or 404 if unbound. Requires Channel.view permission. */
  async getServiceBinding(useCaseId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/use-cases/{use_case_id}/service-binding', {
        params: { path: { workspace_id: this.workspaceId, use_case_id: useCaseId } },
      }),
    )
  }

  /** Bind this use case to a platform service in the current workspace. PUT semantics — rebinding to a different service replaces the prior binding. Inbound webhook events for the use case will resolve to this workspace; outbound dispatch from the service will route through this use case for its channel. 409 if a different use case already binds the same (service, channel) pair, or if this use case is bound in another workspace. 404 if the service or use case is missing or the service belongs to another workspace. The use case is read from channel-manager fresh, and a read that fails is 503. Binding a voice use case holds the service's transfer destinations to the use case's list: 422 for a number the list lacks or that is one of the use case's own. Requires Channel.create permission. */
  async bindService(useCaseId: string, body: components['schemas']['ServiceBindingRequest']) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/use-cases/{use_case_id}/service-binding', {
        params: { path: { workspace_id: this.workspaceId, use_case_id: useCaseId } },
        body,
      }),
    )
  }

  /** Release a use case from its bound service in this workspace. 404 if the use case is not currently bound (covers both 'never bound' and 'already unbound'). Requires Channel.delete permission. */
  async unbindService(useCaseId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/use-cases/{use_case_id}/service-binding', {
      params: { path: { workspace_id: this.workspaceId, use_case_id: useCaseId } },
    })
  }
}
