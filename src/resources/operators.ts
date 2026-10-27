import type { components, operations } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type EscalationStatsParams = NonNullable<
  operations['escalation-stats']['parameters']['query']
>

export type OperatorAuditLogParams = NonNullable<
  operations['list-audit-log']['parameters']['query']
>

export class OperatorsResource extends WorkspaceScopedResource {
  async list(params?: { status?: string; limit?: number; offset?: number }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operators', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: { status?: string; limit?: number; offset?: number }) {
    return this.iterateOffsetPaginatedList(
      (pageParams) => this.list(pageParams),
      (page) => page.items,
      params,
    )
  }

  async create(body: components['schemas']['CreateOperatorRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/operators', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  async get(operatorId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operators/{operator_id}', {
        params: { path: { workspace_id: this.workspaceId, operator_id: operatorId } },
      }),
    )
  }

  /** Update an operator (name, role, status, etc.) */
  async update(operatorId: string, body: components['schemas']['UpdateOperatorRequest']) {
    return extractData(
      await this.client.PATCH('/v1/{workspace_id}/operators/{operator_id}', {
        params: { path: { workspace_id: this.workspaceId, operator_id: operatorId } },
        body,
      }),
    )
  }

  async getDashboard() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operators/dashboard', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  async getQueue() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operators/queue', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  async getEscalations(params?: { status?: string; limit?: number; offset?: number }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operators/escalations', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  getEscalationsAutoPaging(params?: { status?: string; limit?: number; offset?: number }) {
    return this.iterateOffsetPaginatedList(
      (pageParams) => this.getEscalations(pageParams),
      (page) => page.items,
      params,
    )
  }

  async getActiveEscalations() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operators/escalations/active', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  async getEscalationStats(params?: EscalationStatsParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operators/escalations/stats', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  async getPerformance(params?: {
    days?: number
    date_from?: string | null
    date_to?: string | null
    interval?: '1h' | '1d' | '1w'
    service_id?: string | null
  }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operators/performance', {
        params: { path: { workspace_id: this.workspaceId }, query: params as never },
      }),
    )
  }

  async joinCall(operatorId: string, body: components['schemas']['JoinCallRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/operators/{operator_id}/join-call', {
        params: { path: { workspace_id: this.workspaceId, operator_id: operatorId } },
        body,
      }),
    )
  }

  async leaveCall(operatorId: string, body: components['schemas']['LeaveCallRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/operators/{operator_id}/leave-call', {
        params: { path: { workspace_id: this.workspaceId, operator_id: operatorId } },
        body,
      }),
    )
  }

  async switchMode(operatorId: string, body: components['schemas']['SwitchModeRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/operators/{operator_id}/switch-mode', {
        params: { path: { workspace_id: this.workspaceId, operator_id: operatorId } },
        body,
      }),
    )
  }

  async sendGuidance(operatorId: string, body: components['schemas']['SendGuidanceRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/operators/{operator_id}/send-guidance', {
        params: { path: { workspace_id: this.workspaceId, operator_id: operatorId } },
        body,
      }),
    )
  }

  async createBriefing(operatorId: string, body: { call_sid: string }) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/operators/{operator_id}/briefing', {
        params: { path: { workspace_id: this.workspaceId, operator_id: operatorId } },
        body,
      }),
    )
  }

  async wrapUp(operatorId: string, body: components['schemas']['WrapUpRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/operators/{operator_id}/wrap-up', {
        params: { path: { workspace_id: this.workspaceId, operator_id: operatorId } },
        body,
      }),
    )
  }

  async getCallTranscript(callSid: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operators/calls/{call_sid}/transcript', {
        params: { path: { workspace_id: this.workspaceId, call_sid: callSid } },
      }),
    )
  }

  /**
   * List the operator actions recorded in the workspace's audit ledger, newest
   * first. Filter by one `operator_id` or `action`, and page with
   * `continuation_token`. The ledger refreshes about every 15 minutes, so an
   * action appears after that delay. Returns 503 when the ledger cannot be read.
   */
  async getAuditLog(params?: OperatorAuditLogParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/operators/audit-log', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  getAuditLogAutoPaging(params?: OperatorAuditLogParams) {
    return this.iteratePaginatedList((pageParams) => this.getAuditLog(pageParams), params)
  }
}
