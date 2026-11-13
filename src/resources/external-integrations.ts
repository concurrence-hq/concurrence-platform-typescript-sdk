import type { components, operations } from '../generated/api.js'
import type { ListParams } from '../core/utils.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type ExternalIntegration = components['schemas']['ExternalIntegrationResponse']
export type ExternalIntegrationCredential =
  components['schemas']['ExternalIntegrationCredentialResponse']
export type ExternalIntegrationCredentialSecret =
  components['schemas']['ExternalIntegrationCredentialSecretResponse']
export type CreateExternalIntegrationRequest = components['schemas']['ExternalIntegrationRequest']
export type UpdateExternalIntegrationRequest =
  components['schemas']['ExternalIntegrationUpdateRequest']
export type CreateExternalIntegrationCredentialRequest =
  components['schemas']['ExternalIntegrationCredentialRequest']
export type ExternalIntegrationListResponse =
  components['schemas']['ExternalIntegrationListResponse']
export type ListExternalIntegrationsParams = ListParams &
  NonNullable<operations['list-external-integrations']['parameters']['query']>

/**
 * Manage external integrations that can own constrained client credentials for
 * customer backends.
 */
export class ExternalIntegrationsResource extends WorkspaceScopedResource {
  /** List external integrations in the workspace. */
  async list(params?: ListExternalIntegrationsParams): Promise<ExternalIntegrationListResponse> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-integrations', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListExternalIntegrationsParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Register a customer/backend integration record. */
  async create(body: CreateExternalIntegrationRequest): Promise<ExternalIntegration> {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/external-integrations', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** Get one external integration. */
  async get(integrationId: string): Promise<ExternalIntegration> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/external-integrations/{integration_id}', {
        params: { path: { workspace_id: this.workspaceId, integration_id: integrationId } },
      }),
    )
  }

  /** Update external integration metadata. */
  async update(
    integrationId: string,
    body: UpdateExternalIntegrationRequest,
  ): Promise<ExternalIntegration> {
    return extractData(
      await this.client.PATCH('/v1/{workspace_id}/external-integrations/{integration_id}', {
        params: { path: { workspace_id: this.workspaceId, integration_id: integrationId } },
        body,
      }),
    )
  }

  /** Delete an external integration and revoke its active credentials. */
  async delete(integrationId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/external-integrations/{integration_id}', {
      params: { path: { workspace_id: this.workspaceId, integration_id: integrationId } },
    })
  }

  /** List credentials for an external integration. Plaintext secrets are never returned here. */
  async listCredentials(integrationId: string): Promise<ExternalIntegrationCredential[]> {
    return extractData(
      await this.client.GET(
        '/v1/{workspace_id}/external-integrations/{integration_id}/credentials',
        {
          params: { path: { workspace_id: this.workspaceId, integration_id: integrationId } },
        },
      ),
    )
  }

  /** Create a credential and return its one-time plaintext client secret. */
  async createCredential(
    integrationId: string,
    body: CreateExternalIntegrationCredentialRequest,
  ): Promise<ExternalIntegrationCredentialSecret> {
    return extractData(
      await this.client.POST(
        '/v1/{workspace_id}/external-integrations/{integration_id}/credentials',
        {
          params: { path: { workspace_id: this.workspaceId, integration_id: integrationId } },
          body,
        },
      ),
    )
  }

  /** Revoke one external integration credential. */
  async revokeCredential(integrationId: string, credentialId: string): Promise<void> {
    await this.client.DELETE(
      '/v1/{workspace_id}/external-integrations/{integration_id}/credentials/{credential_id}',
      {
        params: {
          path: {
            workspace_id: this.workspaceId,
            integration_id: integrationId,
            credential_id: credentialId,
          },
        },
      },
    )
  }

  /** Rotate a credential and return the replacement one-time plaintext client secret. */
  async rotateCredential(
    integrationId: string,
    credentialId: string,
  ): Promise<ExternalIntegrationCredentialSecret> {
    return extractData(
      await this.client.POST(
        '/v1/{workspace_id}/external-integrations/{integration_id}/credentials/{credential_id}/rotate',
        {
          params: {
            path: {
              workspace_id: this.workspaceId,
              integration_id: integrationId,
              credential_id: credentialId,
            },
          },
        },
      ),
    )
  }
}
