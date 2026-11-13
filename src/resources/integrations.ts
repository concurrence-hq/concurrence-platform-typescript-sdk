import type { components, paths } from '../generated/api.js'
import type { IntegrationId, IntegrationEndpointId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams } from '../core/utils.js'

export type Integration = components['schemas']['RestIntegrationResponse']
export type IntegrationAuth = NonNullable<Integration['auth']>
export type IntegrationAuthRequest = NonNullable<CreateIntegrationRequest['auth']>
export type CustomTokenExchangeIntegrationAuthRequest =
  components['schemas']['CustomTokenExchangeAuthRequest']
export type IntegrationIdentityBinding = NonNullable<
  CustomTokenExchangeIntegrationAuthRequest['identity_bindings']
>[string]
export type IntegrationIdentityBindings = NonNullable<
  CustomTokenExchangeIntegrationAuthRequest['identity_bindings']
>
export type IntegrationIdentityBindingTestValues = NonNullable<
  CustomTokenExchangeIntegrationAuthRequest['identity_binding_test_values']
>
export type CreateIntegrationRequest =
  components['schemas']['src__routes__integrations__create_integration__Request']
export type UpdateIntegrationRequest =
  components['schemas']['src__routes__integrations__update_integration__Request']
export type IntegrationListResponse =
  components['schemas']['src__routes__integrations__list_integrations__Response']
export type IntegrationEndpoint = components['schemas']['EndpointResponse']
export type CreateIntegrationEndpointRequest =
  components['schemas']['src__routes__integrations__create_endpoint__Request']
export type UpdateIntegrationEndpointRequest =
  components['schemas']['src__routes__integrations__update_endpoint__Request']
export type IntegrationEndpointListResponse =
  components['schemas']['src__routes__integrations__list_endpoints__Response']
export type TestIntegrationEndpointRequest =
  components['schemas']['src__routes__integrations__test_endpoint__Request']
export type TestIntegrationEndpointResponse =
  components['schemas']['src__routes__integrations__test_endpoint__Response']

export interface ListIntegrationsParams extends ListParams {
  enabled?: boolean | null
  search?: string | null
  sort_by?: string[]
}

export interface ListEndpointsParams extends ListParams {
  search?: string | null
  sort_by?: string[]
}

/**
 * Manage integrations — connections to external systems (EHRs, CRMs, etc.).
 *
 * REST integrations carry workspace-level `base_url` + `auth` config. Their
 * endpoints are managed as a separate sub-resource: create the integration
 * first, then add endpoints via `createEndpoint` / `updateEndpoint` /
 * `deleteEndpoint`. Endpoints are identified by UUID (`endpoint_id`); the
 * `name` field is human-facing only.
 */
export class IntegrationsResource extends WorkspaceScopedResource {
  // ─── Integrations ─────────────────────────────────────────────────────────

  /** Create a new REST integration */
  async create(body: CreateIntegrationRequest): Promise<Integration> {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/integrations', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /** List integrations (REST + desktop) */
  async list(params?: ListIntegrationsParams): Promise<IntegrationListResponse> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/integrations', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListIntegrationsParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  /** Get a single integration */
  async get(integrationId: IntegrationId | string): Promise<Integration> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/integrations/{integration_id}', {
        params: { path: { workspace_id: this.workspaceId, integration_id: integrationId } },
      }),
    )
  }

  /** Patch a REST integration. Pass `auth: null` to clear auth. */
  async update(
    integrationId: IntegrationId | string,
    body: UpdateIntegrationRequest,
  ): Promise<Integration> {
    return extractData(
      await this.client.PATCH('/v1/{workspace_id}/integrations/{integration_id}', {
        params: { path: { workspace_id: this.workspaceId, integration_id: integrationId } },
        body,
      }),
    )
  }

  /** Delete a REST integration */
  async delete(integrationId: IntegrationId | string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/integrations/{integration_id}', {
      params: { path: { workspace_id: this.workspaceId, integration_id: integrationId } },
    })
  }

  // ─── Endpoints ────────────────────────────────────────────────────────────

  /** List endpoints on a REST integration */
  async listEndpoints(
    integrationId: IntegrationId | string,
    params?: ListEndpointsParams,
  ): Promise<IntegrationEndpointListResponse> {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/integrations/{integration_id}/endpoints', {
        params: {
          path: { workspace_id: this.workspaceId, integration_id: integrationId },
          query: params,
        },
      }),
    )
  }

  listEndpointsAutoPaging(integrationId: IntegrationId | string, params?: ListEndpointsParams) {
    return this.iteratePaginatedList(
      (pageParams) => this.listEndpoints(integrationId, pageParams),
      params,
    )
  }

  /** Get a single endpoint */
  async getEndpoint(
    integrationId: IntegrationId | string,
    endpointId: IntegrationEndpointId | string,
  ): Promise<IntegrationEndpoint> {
    return extractData(
      await this.client.GET(
        '/v1/{workspace_id}/integrations/{integration_id}/endpoints/{endpoint_id}',
        {
          params: {
            path: {
              workspace_id: this.workspaceId,
              integration_id: integrationId,
              endpoint_id: endpointId,
            },
          },
        },
      ),
    )
  }

  /** Add an endpoint to a REST integration */
  async createEndpoint(
    integrationId: IntegrationId | string,
    body: CreateIntegrationEndpointRequest,
  ): Promise<IntegrationEndpoint> {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/integrations/{integration_id}/endpoints', {
        params: { path: { workspace_id: this.workspaceId, integration_id: integrationId } },
        body,
      }),
    )
  }

  /** Patch an endpoint. The endpoint `name` is immutable. */
  async updateEndpoint(
    integrationId: IntegrationId | string,
    endpointId: IntegrationEndpointId | string,
    body: UpdateIntegrationEndpointRequest,
  ): Promise<IntegrationEndpoint> {
    return extractData(
      await this.client.PATCH(
        '/v1/{workspace_id}/integrations/{integration_id}/endpoints/{endpoint_id}',
        {
          params: {
            path: {
              workspace_id: this.workspaceId,
              integration_id: integrationId,
              endpoint_id: endpointId,
            },
          },
          body,
        },
      ),
    )
  }

  /** Delete an endpoint from a REST integration */
  async deleteEndpoint(
    integrationId: IntegrationId | string,
    endpointId: IntegrationEndpointId | string,
  ): Promise<void> {
    await this.client.DELETE(
      '/v1/{workspace_id}/integrations/{integration_id}/endpoints/{endpoint_id}',
      {
        params: {
          path: {
            workspace_id: this.workspaceId,
            integration_id: integrationId,
            endpoint_id: endpointId,
          },
        },
      },
    )
  }

  /**
   * Execute an endpoint with test parameters and return the full response
   * pipeline breakdown. Used by the developer console to validate config.
   */
  async testEndpoint(
    integrationId: IntegrationId | string,
    endpointId: IntegrationEndpointId | string,
    body: TestIntegrationEndpointRequest,
  ): Promise<TestIntegrationEndpointResponse> {
    return extractData(
      await this.client.POST(
        '/v1/{workspace_id}/integrations/{integration_id}/endpoints/{endpoint_id}/test',
        {
          params: {
            path: {
              workspace_id: this.workspaceId,
              integration_id: integrationId,
              endpoint_id: endpointId,
            },
          },
          body,
        },
      ),
    )
  }

  /** Approve a pending human-in-the-loop integration-write approval for a conversation. Publishes `integration.approval_granted` to the workspace event channel; the subscribed text session fires the gated write. Requires `ReviewQueue.review` permission. */
  async approveWrite(
    conversationId: string,
    params?: paths['/v1/{workspace_id}/integrations/approvals/{conversation_id}/approve']['post']['parameters']['query'],
  ) {
    return extractData(
      await this.client.POST(
        '/v1/{workspace_id}/integrations/approvals/{conversation_id}/approve',
        {
          params: {
            path: { workspace_id: this.workspaceId, conversation_id: conversationId },
            query: params,
          },
        },
      ),
    )
  }

  /** Reject a pending human-in-the-loop integration-write approval for a conversation. Publishes `integration.approval_rejected` to the workspace event channel; the subscribed text session declines the gated write. Requires `ReviewQueue.review` permission. */
  async rejectWrite(
    conversationId: string,
    body: components['schemas']['IntegrationRejectRequest'],
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/integrations/approvals/{conversation_id}/reject', {
        params: { path: { workspace_id: this.workspaceId, conversation_id: conversationId } },
        body,
      }),
    )
  }
}
