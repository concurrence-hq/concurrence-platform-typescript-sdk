import type { components, operations } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

export type ProductionEvalDefinition = components['schemas']['ProductionEvalDefinition']
export type ProductionEvalDefinitionListResponse =
  components['schemas']['ProductionEvalDefinitionListResponse']
export type CreateProductionEvalDefinitionRequest =
  components['schemas']['CreateProductionEvalDefinitionRequest']
export type UpdateProductionEvalDefinitionRequest =
  components['schemas']['UpdateProductionEvalDefinitionRequest']
export type ListProductionEvalDefinitionsParams = NonNullable<
  operations['list-production-eval-definitions']['parameters']['query']
>
export type CallEvalResult = components['schemas']['CallEvalResult']
export type CallEvalResultsResponse = components['schemas']['CallEvalResultsResponse']

/**
 * Production evals — eval definitions that run against a workspace's live calls,
 * and the verdicts they record per call (keyed by conversation id, any channel).
 */
export class ProductionEvalsResource extends WorkspaceScopedResource {
  // ─── Definitions ──────────────────────────────────────────────────────────

  /** List eval definitions, optionally filtered by service or active state */
  async listDefinitions(params?: ListProductionEvalDefinitionsParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/production-eval-definitions', {
        params: { path: { workspace_id: this.workspaceId }, query: params },
      }),
    )
  }

  listDefinitionsAutoPaging(params?: ListProductionEvalDefinitionsParams) {
    return this.iteratePaginatedList((pageParams) => this.listDefinitions(pageParams), params)
  }

  /**
   * Create an eval definition. A metric eval's `metric_key` must name an active ai_query
   * call_intelligence metric in the workspace's metric settings; any other key is a 422.
   */
  async createDefinition(body: CreateProductionEvalDefinitionRequest) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/production-eval-definitions', {
        params: { path: { workspace_id: this.workspaceId } },
        body,
      }),
    )
  }

  /**
   * Patch an eval definition. Setting `metric_key` or `eval_type`, or setting `active` to true,
   * re-checks the metric the same way `createDefinition` does.
   */
  async updateDefinition(definitionId: string, body: UpdateProductionEvalDefinitionRequest) {
    return extractData(
      await this.client.PATCH('/v1/{workspace_id}/production-eval-definitions/{definition_id}', {
        params: { path: { workspace_id: this.workspaceId, definition_id: definitionId } },
        body,
      }),
    )
  }

  /** Delete an eval definition */
  async deleteDefinition(definitionId: string): Promise<void> {
    await this.client.DELETE('/v1/{workspace_id}/production-eval-definitions/{definition_id}', {
      params: { path: { workspace_id: this.workspaceId, definition_id: definitionId } },
    })
  }

  // ─── Per-call verdicts ────────────────────────────────────────────────────

  /**
   * Run the workspace's active eval definitions against one completed call and store the
   * verdicts. Synchronous: the request waits on the judge.
   */
  async evaluate(conversationId: string) {
    return extractData(
      await this.client.POST('/v1/{workspace_id}/calls/{conversation_id}/evaluate', {
        params: { path: { workspace_id: this.workspaceId, conversation_id: conversationId } },
      }),
    )
  }

  /**
   * Get a call's stored verdicts. `results` is empty when the call exists but hasn't been
   * evaluated; a call that doesn't exist throws `NotFoundError`.
   */
  async getResults(conversationId: string) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/calls/{conversation_id}/eval-results', {
        params: { path: { workspace_id: this.workspaceId, conversation_id: conversationId } },
      }),
    )
  }
}
