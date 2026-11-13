import type { components, operations } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

/** Query params for the account-scoped audit-log feed (`GET /v1/audit-log/me`). */
export type ListMyAuditEventsParams = NonNullable<
  operations['list-my-audit-events']['parameters']['query']
>

/** Query params for the cross-workspace platform audit-log feed (`GET /v1/audit-log/platform`). */
export type ListPlatformAuditEventsParams = NonNullable<
  operations['list-audit-events-platform']['parameters']['query']
>

export interface ListAuditParams {
  service?: string | null
  action?: string | null
  actor_entity_id?: string | null
  resource_type?: string | null
  resource_id?: string | null
  phi_only?: boolean
  date_from?: string | null
  date_to?: string | null
  limit?: number
  offset?: number
}

export interface PhiAccessParams {
  entity_id?: string | null
  date_from?: string | null
  date_to?: string | null
  limit?: number
  offset?: number
}

export interface EntityAccessLogParams {
  date_from?: string | null
  date_to?: string | null
  limit?: number
  offset?: number
}

export class AuditResource extends WorkspaceScopedResource {
  async list(params?: ListAuditParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/audit', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListAuditParams) {
    return this.iterateOffsetPaginatedList(
      (pageParams) => this.list(pageParams),
      (page) => page.events,
      params,
    )
  }

  async getSummary(params?: { date_from?: string | null; date_to?: string | null }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/audit/summary', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  async getPhiAccess(params?: PhiAccessParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/audit/phi-access', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  getPhiAccessAutoPaging(params?: PhiAccessParams) {
    return this.iterateOffsetPaginatedList(
      (pageParams) => this.getPhiAccess(pageParams),
      (page) => page.events,
      params,
    )
  }

  async createExport(body: components['schemas']['AuditExportRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/audit/export', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /**
   * Poll an async audit export by its statement ID.
   *
   * `createExport` returns a `statement_id`; exports run asynchronously against
   * Databricks and resolve to presigned result chunks. Poll this until
   * `status` is terminal.
   */
  async getExport(statementId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/audit/export/{statement_id}', {
        params: { path: { workspace_id: this.workspaceId, statement_id: statementId } },
      }),
    )
  }

  /**
   * List the authenticated identity's own audit events.
   *
   * Account-scoped (`GET /v1/audit-log/me`): the caller's own actions across
   * every workspace they belong to. Not workspace-scoped — the bound
   * `workspaceId` is not sent.
   */
  async listMyAuditEvents(params?: ListMyAuditEventsParams) {
    return extractData(
      await this.client.GET('/v1/audit-log/me', {
        params: { query: params },
      }),
    )
  }

  /**
   * List audit events across all workspaces (platform-admin scope).
   *
   * Cross-workspace (`GET /v1/audit-log/platform`): omit `workspace_id` for the
   * full platform feed, or pass it to filter to one workspace. Not
   * workspace-scoped — the bound `workspaceId` is not sent.
   */
  async listPlatformAuditEvents(params?: ListPlatformAuditEventsParams) {
    return extractData(
      await this.client.GET('/v1/audit-log/platform', {
        params: { query: params },
      }),
    )
  }

  async getEntityAccessLog(entityId: string, params?: EntityAccessLogParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/audit/entity/{entity_id}/access-log', {
        params: { path: { workspace_id: this.workspaceId, entity_id: entityId }, query: params },
      }),
    )
  }

  getEntityAccessLogAutoPaging(entityId: string, params?: EntityAccessLogParams) {
    return this.iterateOffsetPaginatedList(
      (pageParams) => this.getEntityAccessLog(entityId, pageParams),
      (page) => page.events,
      params,
    )
  }
}
