import type { components } from '../generated/api.js'
import type { AgentId } from '../core/branded-types.js'
import { WorkspaceScopedResource, extractData } from './base.js'
import type { ListParams } from '../core/utils.js'

export interface ListAgentsParams extends ListParams {
  search?: string
}

export class AgentsResource extends WorkspaceScopedResource {
  async create(body: components['schemas']['CreateAgentRequest']) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/agents', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  async list(params?: ListAgentsParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/agents', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listAutoPaging(params?: ListAgentsParams) {
    return this.iteratePaginatedList((pageParams) => this.list(pageParams), params)
  }

  async get(agentId: AgentId | string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/agents/{agent_id}', {
        params: { path: { workspace_id: this.workspaceId, agent_id: agentId } },
      }),
    )
  }

  async update(agentId: AgentId | string, body: components['schemas']['UpdateAgentRequest']) {
    return extractData(
      await this.client.PUT('/v1/{workspace_id}/agents/{agent_id}', {
        params: { path: { workspace_id: this.workspaceId, agent_id: agentId } },
        body,
      }),
    )
  }

  async delete(agentId: AgentId | string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/agents/{agent_id}', {
      params: { path: { workspace_id: this.workspaceId, agent_id: agentId } },
    })
  }

  async listVersions(agentId: AgentId | string, params?: ListParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/agents/{agent_id}/versions', {
        params: { path: { workspace_id: this.workspaceId, agent_id: agentId }, query: params },
      }),
    )
  }

  listVersionsAutoPaging(agentId: AgentId | string, params?: ListParams) {
    return this.iteratePaginatedList((pageParams) => this.listVersions(agentId, pageParams), params)
  }

  async getVersion(agentId: AgentId | string, version: number | 'latest') {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/agents/{agent_id}/versions/{version}', {
        params: {
          path: { workspace_id: this.workspaceId, agent_id: agentId, version },
        },
      }),
    )
  }

  async createVersion(
    agentId: AgentId | string,
    body: components['schemas']['CreateAgentVersionRequest'],
  ) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/agents/{agent_id}/versions', {
        params: { path: { workspace_id: this.workspaceId, agent_id: agentId } },
        body,
      }),
    )
  }
}
