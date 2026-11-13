import { WorkspaceScopedResource, extractData } from './base.js'

/** Frameworks currently supported by the platform's framework-native runner. */
export const AGENT_RUN_FRAMEWORKS = {
  OPENAI_AGENTS: 'openai-agents',
  CLAUDE_AGENT_SDK: 'claude-agent-sdk',
} as const

export type AgentRunFramework = (typeof AGENT_RUN_FRAMEWORKS)[keyof typeof AGENT_RUN_FRAMEWORKS]

/** Human-readable labels for framework selectors and run summaries. */
export const AGENT_RUN_FRAMEWORK_LABELS: Record<AgentRunFramework, string> = {
  [AGENT_RUN_FRAMEWORKS.OPENAI_AGENTS]: 'OpenAI Agents SDK',
  [AGENT_RUN_FRAMEWORKS.CLAUDE_AGENT_SDK]: 'Anthropic Claude Agent SDK',
}

/**
 * The CONTEXT edge of the framework-agnostic world-model harness. The unified
 * `runs` resource (`/runs`) now owns list/get/trajectory/operator verbs —
 * this resource's former create/get were retired with the agent-runner
 * service.
 */
export class AgentRunsResource extends WorkspaceScopedResource {
  /**
   * The CONTEXT edge — the retrievable, framework-neutral session bootstrap a
   * service hands an agent: identity/instructions, world scope, tool
   * descriptors, guardrails, the real enforced write-floor, and runtime. This
   * is the exact context a remote framework would fetch before a run.
   */
  async harnessContext(params: { serviceId: string; versionSet?: string }) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/agent-runs/harness-context', {
        params: {
          path: { workspace_id: this.workspaceId },
          // camelCase args → snake_case wire query (service_id / version_set).
          query: { service_id: params.serviceId, version_set: params.versionSet },
        },
      }),
    )
  }
}
