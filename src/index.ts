/**
 * @amigo-ai/platform-sdk
 *
 * Official TypeScript SDK for the Amigo Platform API.
 *
 * @example
 * ```typescript
 * import { AmigoClient } from '@amigo-ai/platform-sdk'
 *
 * const client = new AmigoClient({
 *   apiKey: 'your-api-key',
 *   workspaceId: 'your-workspace-id',
 * })
 *
 * const agents = await client.agents.list()
 * console.log(agents.items)
 * ```
 */

import type { FetchResponse, HeadersOptions } from 'openapi-fetch'
import type { MediaType, PathsWithMethod } from 'openapi-typescript-helpers'
import { ConfigurationError } from './core/errors.js'
import { DEFAULT_IDENTITY_URL } from './core/device-code.js'
import {
  applyPlatformRequestOptions,
  createPlatformClient,
  type ClientHooks,
  type PlatformFetch,
} from './core/openapi-client.js'
import {
  mergeRequestOptions,
  type AmigoRequestOptions,
  type InitParam,
  type OperationFor,
  type ScopedRequestOptions,
} from './core/request-options.js'
import type { RetryOptions } from './core/retry.js'
import { MeResource } from './resources/me.js'
import { WorkspacesResource } from './resources/workspaces.js'
import { ApiKeysResource } from './resources/api-keys.js'
import { TokensResource } from './resources/tokens.js'
import { WorkspaceAuthenticationResource } from './resources/workspace-authentication.js'
import { SsoLifecycleResource } from './resources/sso-lifecycle.js'
import { SsoGrantsResource } from './resources/sso-grants.js'
import { IdentityCredentialsResource } from './resources/identity-credentials.js'
import { AgentsResource } from './resources/agents.js'
import { AgentRunsResource } from './resources/agent-runs.js'
export { AGENT_RUN_FRAMEWORKS, AGENT_RUN_FRAMEWORK_LABELS } from './resources/agent-runs.js'
export type { AgentRunFramework } from './resources/agent-runs.js'
import { RunsResource } from './resources/runs.js'
import { SkillsResource } from './resources/skills.js'
import { ActionsResource } from './resources/actions.js'
export type {
  IdentityLifecycleActionRequest,
  IdentityLifecycleActionResponse,
} from './resources/actions.js'
import { OperatorsResource } from './resources/operators.js'
import { PromptLogsResource } from './resources/prompt-logs.js'
import { TriggersResource } from './resources/triggers.js'
import { ServicesResource } from './resources/services.js'
import { StagingClonesResource } from './resources/staging-clones.js'
import { ContextGraphsResource } from './resources/context-graphs.js'
import { DataSourcesResource } from './resources/data-sources.js'
import { WorldResource } from './resources/world.js'
import { CallsResource } from './resources/calls.js'
import { ConversationsResource } from './resources/conversations.js'
import { IntegrationsResource } from './resources/integrations.js'
import { ExternalIntegrationsResource } from './resources/external-integrations.js'
import { AnalyticsResource } from './resources/analytics.js'
import { SimulationsResource } from './resources/simulations.js'
import { MetricsResource } from './resources/metrics.js'
import { ProductionEvalsResource } from './resources/production-evals.js'
import { SettingsResource } from './resources/settings.js'
import { RecordingsResource } from './resources/recordings.js'
import { AuditResource } from './resources/audit.js'
import { ComplianceResource } from './resources/compliance.js'
import { EventsResource } from './resources/events.js'
import { FunctionsResource } from './resources/functions.js'
import { ObserversResource } from './resources/observers.js'
import { FhirResource } from './resources/fhir.js'
import { InsightsResource } from './resources/insights.js'
import { CommandCenterResource } from './resources/command-center.js'
import { SensoriumResource } from './resources/sensorium.js'
import { ClientConfigResource } from './resources/client-config.js'
import { DashboardsResource } from './resources/dashboards.js'
import { IntakeResource } from './resources/intake.js'
import { DataQueryResource } from './resources/data-query.js'
import { BriefsResource } from './resources/briefs.js'
import { NetworkResource } from './resources/network.js'
import { PipelineResource } from './resources/pipeline.js'
import { ToolsResource } from './resources/tools.js'
import { SurfacesResource } from './resources/surfaces.js'
import { SessionsResource } from './resources/sessions.js'
import { WorkspaceDataQueriesResource } from './resources/workspace-data-queries.js'
import { resolveScopedPlatformClient, scopePlatformClient } from './resources/base.js'
import type { components, paths } from './generated/api.js'
import type { MetricValue as MetricValueAlias } from './resources/metrics.js'
import { withResponse, type AmigoResponse } from './core/utils.js'

export const DEFAULT_BASE_URL = 'https://platform.api-us.concurrence.com'

type Mutable<T> = { -readonly [K in keyof T]: T[K] }
// The generated client exposes TRACE, but the SDK only publishes helpers for
// platform methods that exist in the committed OpenAPI snapshot.
type PlatformMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch'
type EmptyOptions = Record<never, never>
type PathForMethod<Method extends PlatformMethod> = Extract<PathsWithMethod<paths, Method>, string>
type SuccessData<Operation extends Record<string | number, unknown>> = Extract<
  FetchResponse<Operation, EmptyOptions, MediaType>,
  { error?: never }
>['data']
type IsNever<Value> = [Value] extends [never] ? true : false
type DefinedSuccessData<Operation extends Record<string | number, unknown>> = Exclude<
  SuccessData<Operation>,
  undefined
>
// Success data preserves nullable response bodies. Endpoints with no success
// body resolve to undefined so low-level helpers can represent 204/205 results.
type OperationResponse<
  Path extends keyof paths & string,
  Method extends PlatformMethod,
> = Method extends keyof paths[Path]
  ? paths[Path][Method] extends infer Operation extends Record<string | number, unknown>
    ? IsNever<SuccessData<Operation>> extends true
      ? never
      : // Preserve nullable success bodies; only no-content operations collapse to undefined.
        [DefinedSuccessData<Operation>] extends [never]
        ? undefined
        : DefinedSuccessData<Operation>
    : never
  : never

export interface AmigoClientConfig {
  /** API key created via POST /v1/{workspace_id}/api-keys */
  apiKey: string

  /** Workspace ID — all resource operations are scoped to this workspace */
  workspaceId: string

  /**
   * Override the base URL. Defaults to https://platform.api-us.concurrence.com
   *
   * Other regions use `https://platform.api-eu.concurrence.com` (also `-au`,
   * `-ca`).
   *
   * For BFF proxy patterns (e.g., Next.js), point this at your proxy:
   * ```ts
   * new AmigoClient({ baseUrl: '/api/platform', ... })
   * ```
   */
  baseUrl?: string

  /**
   * Base URL for the identity service, which `client.tokens` calls for
   * `POST /token`. Defaults to `baseUrl` when you set one, otherwise
   * https://identity.api-us.concurrence.com.
   *
   * The hosted platform serves identity on its own host, so set both when you
   * point `baseUrl` at another region:
   * ```ts
   * new AmigoClient({
   *   baseUrl: 'https://platform.api-eu.concurrence.com',
   *   identityBaseUrl: 'https://identity.api-eu.concurrence.com',
   *   ...
   * })
   * ```
   */
  identityBaseUrl?: string

  /** Retry configuration for failed requests */
  retry?: RetryOptions

  /** Convenience alias for retry count (same semantics as "number of retries") */
  maxRetries?: number

  /** Default request timeout in milliseconds */
  timeout?: number

  /** Additional headers sent with every request */
  headers?: HeadersOptions

  /** Request lifecycle hooks for logging, tracing, or metrics */
  hooks?: ClientHooks

  /**
   * Custom fetch implementation.
   *
   * Use for BFF proxy routing, server-side cookie forwarding,
   * or test mocking. When provided, all HTTP requests flow
   * through this function instead of globalThis.fetch.
   */
  fetch?: typeof globalThis.fetch

  /**
   * Base URL for the agent engine (voice-agent) WebSocket endpoints.
   *
   * Required when `baseUrl` points to a BFF proxy or a different host
   * than the agent engine — WebSockets cannot traverse HTTP proxies.
   * Used by `conversations.textStreamUrl()` to build the `ws://` URL.
   *
   * Accepts `http://` or `https://` (auto-mapped to `ws://` / `wss://`)
   * or direct `ws://` / `wss://` URLs.
   *
   * Defaults to deriving from `baseUrl` (works when REST API and agent
   * engine share the same origin).
   *
   * ```ts
   * new AmigoClient({
   *   baseUrl: '/api/platform',  // BFF proxy for REST
   *   agentBaseUrl: 'wss://agent-engine.api-us.concurrence.com',  // direct for WS
   *   ...
   * })
   * ```
   */
  agentBaseUrl?: string
}

export class AmigoClient {
  readonly workspaceId!: string
  readonly baseUrl!: string
  readonly agentBaseUrl!: string | undefined
  readonly workspaces!: WorkspacesResource
  readonly me!: MeResource
  readonly apiKeys!: ApiKeysResource
  readonly tokens!: TokensResource
  readonly workspaceAuthentication!: WorkspaceAuthenticationResource
  readonly ssoLifecycle!: SsoLifecycleResource
  readonly ssoGrants!: SsoGrantsResource
  readonly identityCredentials!: IdentityCredentialsResource
  readonly agents!: AgentsResource
  readonly agentRuns!: AgentRunsResource
  readonly runs!: RunsResource
  /** @deprecated Use `actions` instead */
  readonly skills!: SkillsResource
  readonly actions!: ActionsResource
  readonly operators!: OperatorsResource
  readonly promptLogs!: PromptLogsResource
  readonly triggers!: TriggersResource
  readonly services!: ServicesResource
  readonly stagingClones!: StagingClonesResource
  readonly contextGraphs!: ContextGraphsResource
  readonly dataSources!: DataSourcesResource
  readonly world!: WorldResource
  readonly calls!: CallsResource
  readonly conversations!: ConversationsResource
  readonly integrations!: IntegrationsResource
  readonly externalIntegrations!: ExternalIntegrationsResource
  readonly analytics!: AnalyticsResource
  readonly simulations!: SimulationsResource
  readonly metrics!: MetricsResource
  /** Production evals: eval definitions run against live calls, and each call's verdicts */
  readonly productionEvals!: ProductionEvalsResource
  readonly settings!: SettingsResource
  readonly recordings!: RecordingsResource
  readonly audit!: AuditResource
  readonly compliance!: ComplianceResource
  readonly events!: EventsResource
  readonly functions!: FunctionsResource
  /**
   * Voice-call observer real-time stream. Subscribe with
   * ``client.observers.subscribe({ callSid, token, onEvent })``. See
   * {@link ObserversResource}.
   */
  readonly observers!: ObserversResource
  /** FHIR / EHR data interop — sync status, imports, resources, patient views */
  readonly fhir!: FhirResource
  /** Natural-language insights — schema, suggestions, SQL, chat sessions */
  readonly insights!: InsightsResource
  /** Command Center — rolled-up workspace homepage snapshot */
  readonly commandCenter!: CommandCenterResource
  /** Sensorium — operator-facing live agent loop observability */
  readonly sensorium!: SensoriumResource
  /** Browser-safe platform config, such as the Google Maps key */
  readonly clientConfig!: ClientConfigResource
  /** Plotly dashboard definitions and their panel queries */
  readonly dashboards!: DashboardsResource
  /** Customer data intake: files, datasets, Drive sources, sync batches, materialization */
  readonly intake!: IntakeResource
  /** Data queries over workspace Lakebase tables: filtered table reads and one-statement SQL */
  readonly dataQuery!: DataQueryResource
  /** AI-generated entity briefs (workspace-level + per-entity) */
  readonly briefs!: BriefsResource
  /** Workspace network metadata (egress IP allowlist) */
  readonly network!: NetworkResource
  /** Data ingestion pipeline observability (sources, throughput, review backlog) */
  readonly pipeline!: PipelineResource
  /** Manual tool execution + per-service tool resolution */
  readonly tools!: ToolsResource
  /** Surfaces — short-lived form/intake experiences (lifecycle: create→deliver→review→approve) */
  readonly surfaces!: SurfacesResource
  /** Live agent sessions — list active calls + inject mid-call directives */
  readonly sessions!: SessionsResource
  /** Workspace data queries — Lakebase-backed query tool registry */
  readonly workspaceDataQueries!: WorkspaceDataQueriesResource
  /** @internal — exposed for path-level type inference in GET/POST/PUT/etc. */
  readonly api!: PlatformFetch

  constructor(config: AmigoClientConfig) {
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new ConfigurationError('apiKey is required and must be a non-empty string')
    }
    if (!config.workspaceId || typeof config.workspaceId !== 'string') {
      throw new ConfigurationError('workspaceId is required and must be a non-empty string')
    }

    const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    // A custom baseUrl (BFF proxy, gateway) also carries /token unless identityBaseUrl is set.
    const identityBaseUrl = (
      config.identityBaseUrl ??
      config.baseUrl ??
      DEFAULT_IDENTITY_URL
    ).replace(/\/$/, '')

    const client = createPlatformClient({
      apiKey: config.apiKey,
      baseUrl,
      identityBaseUrl,
      retry: config.retry,
      maxRetries: config.maxRetries,
      timeout: config.timeout,
      headers: config.headers,
      hooks: config.hooks,
      fetch: config.fetch,
    })

    AmigoClient.hydrate(this, client, config.workspaceId, baseUrl, config.agentBaseUrl)
  }

  withOptions(options: ScopedRequestOptions): AmigoClient {
    return AmigoClient.fromPlatformClient(
      scopePlatformClient(this.api, options),
      this.workspaceId,
      this.baseUrl,
      this.agentBaseUrl,
    )
  }

  async GET<Path extends PathForMethod<'get'>>(
    path: Path,
    ...[init]: InitParam<AmigoRequestOptions<OperationFor<Path, 'get'>>>
  ): Promise<AmigoResponse<OperationResponse<Path, 'get'>>> {
    return withResponse(await this.resolveApiRequest(path, 'GET', init)) as AmigoResponse<
      OperationResponse<Path, 'get'>
    >
  }

  async POST<Path extends PathForMethod<'post'>>(
    path: Path,
    ...[init]: InitParam<AmigoRequestOptions<OperationFor<Path, 'post'>>>
  ): Promise<AmigoResponse<OperationResponse<Path, 'post'>>> {
    return withResponse(await this.resolveApiRequest(path, 'POST', init)) as AmigoResponse<
      OperationResponse<Path, 'post'>
    >
  }

  async PUT<Path extends PathForMethod<'put'>>(
    path: Path,
    ...[init]: InitParam<AmigoRequestOptions<OperationFor<Path, 'put'>>>
  ): Promise<AmigoResponse<OperationResponse<Path, 'put'>>> {
    return withResponse(await this.resolveApiRequest(path, 'PUT', init)) as AmigoResponse<
      OperationResponse<Path, 'put'>
    >
  }

  async PATCH<Path extends PathForMethod<'patch'>>(
    path: Path,
    ...[init]: InitParam<AmigoRequestOptions<OperationFor<Path, 'patch'>>>
  ): Promise<AmigoResponse<OperationResponse<Path, 'patch'>>> {
    return withResponse(await this.resolveApiRequest(path, 'PATCH', init)) as AmigoResponse<
      OperationResponse<Path, 'patch'>
    >
  }

  async DELETE<Path extends PathForMethod<'delete'>>(
    path: Path,
    ...[init]: InitParam<AmigoRequestOptions<OperationFor<Path, 'delete'>>>
  ): Promise<AmigoResponse<OperationResponse<Path, 'delete'>>> {
    return withResponse(await this.resolveApiRequest(path, 'DELETE', init)) as AmigoResponse<
      OperationResponse<Path, 'delete'>
    >
  }

  async HEAD<Path extends PathForMethod<'head'>>(
    path: Path,
    ...[init]: InitParam<AmigoRequestOptions<OperationFor<Path, 'head'>>>
  ): Promise<AmigoResponse<OperationResponse<Path, 'head'>>> {
    return withResponse(await this.resolveApiRequest(path, 'HEAD', init), {
      allowEmptyBody: true,
    }) as AmigoResponse<OperationResponse<Path, 'head'>>
  }

  async OPTIONS<Path extends PathForMethod<'options'>>(
    path: Path,
    ...[init]: InitParam<AmigoRequestOptions<OperationFor<Path, 'options'>>>
  ): Promise<AmigoResponse<OperationResponse<Path, 'options'>>> {
    return withResponse(await this.resolveApiRequest(path, 'OPTIONS', init), {
      allowEmptyBody: true,
    }) as AmigoResponse<OperationResponse<Path, 'options'>>
  }

  /**
   * Bind a path literal + method to a fully-typed callable.
   *
   * Captures the path as a literal type at definition time, so the returned
   * callable keeps full request/response inference even when stored,
   * exported, or composed across modules. Solves the "explicit `as const` on
   * path params" footgun: consumers who store a path in a `string` variable
   * lose path inference and the SDK collapses to `unknown`.
   *
   * ```ts
   * const getCall = client.defineRoute('GET', '/v1/{workspace_id}/calls/{call_id}')
   * const call = await getCall({ params: { path: { call_id } } })
   * // call.data: CallDetailResponse | undefined  (fully typed)
   * ```
   *
   * Workspace IDs are still auto-injected by the underlying dispatchers — the
   * helper is purely a type-level convenience. Runtime behavior is identical
   * to calling the matching method directly, so retries, hooks, error
   * conversion, and timeout handling all apply.
   */
  defineRoute<Path extends PathForMethod<'get'>>(
    method: 'GET',
    path: Path,
  ): (
    ...args: InitParam<AmigoRequestOptions<OperationFor<Path, 'get'>>>
  ) => Promise<AmigoResponse<OperationResponse<Path, 'get'>>>
  defineRoute<Path extends PathForMethod<'post'>>(
    method: 'POST',
    path: Path,
  ): (
    ...args: InitParam<AmigoRequestOptions<OperationFor<Path, 'post'>>>
  ) => Promise<AmigoResponse<OperationResponse<Path, 'post'>>>
  defineRoute<Path extends PathForMethod<'put'>>(
    method: 'PUT',
    path: Path,
  ): (
    ...args: InitParam<AmigoRequestOptions<OperationFor<Path, 'put'>>>
  ) => Promise<AmigoResponse<OperationResponse<Path, 'put'>>>
  defineRoute<Path extends PathForMethod<'patch'>>(
    method: 'PATCH',
    path: Path,
  ): (
    ...args: InitParam<AmigoRequestOptions<OperationFor<Path, 'patch'>>>
  ) => Promise<AmigoResponse<OperationResponse<Path, 'patch'>>>
  defineRoute<Path extends PathForMethod<'delete'>>(
    method: 'DELETE',
    path: Path,
  ): (
    ...args: InitParam<AmigoRequestOptions<OperationFor<Path, 'delete'>>>
  ) => Promise<AmigoResponse<OperationResponse<Path, 'delete'>>>
  defineRoute<Path extends PathForMethod<'head'>>(
    method: 'HEAD',
    path: Path,
  ): (
    ...args: InitParam<AmigoRequestOptions<OperationFor<Path, 'head'>>>
  ) => Promise<AmigoResponse<OperationResponse<Path, 'head'>>>
  defineRoute<Path extends PathForMethod<'options'>>(
    method: 'OPTIONS',
    path: Path,
  ): (
    ...args: InitParam<AmigoRequestOptions<OperationFor<Path, 'options'>>>
  ) => Promise<AmigoResponse<OperationResponse<Path, 'options'>>>
  defineRoute(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
    path: string,
  ): (init?: AmigoRequestOptions<unknown>) => Promise<AmigoResponse<unknown>> {
    type AnyDispatcher = (p: string, i?: unknown) => Promise<AmigoResponse<unknown>>
    const dispatcher = this[method] as unknown as AnyDispatcher
    return (init?: AmigoRequestOptions<unknown>) => dispatcher.call(this, path, init)
  }

  private static fromPlatformClient(
    client: PlatformFetch,
    workspaceId: string,
    baseUrl: string,
    agentBaseUrl?: string,
  ): AmigoClient {
    const instance = Object.create(AmigoClient.prototype) as AmigoClient
    AmigoClient.hydrate(instance, client, workspaceId, baseUrl, agentBaseUrl)
    return instance
  }

  private static hydrate(
    target: AmigoClient,
    client: PlatformFetch,
    workspaceId: string,
    baseUrl: string,
    agentBaseUrl?: string,
  ): void {
    const mutable = target as Mutable<AmigoClient>

    mutable.workspaceId = workspaceId
    mutable.baseUrl = baseUrl
    mutable.agentBaseUrl = agentBaseUrl
    ;(target as unknown as { api: PlatformFetch }).api = client

    mutable.workspaces = new WorkspacesResource(client, workspaceId)
    // ``MeResource`` operates on /v1/me/... — account-scoped, not
    // workspace-scoped. Pass a sentinel literal instead of forwarding
    // the bound ``workspaceId`` so any accidental future use of
    // ``this.workspaceId`` inside ``MeResource`` (or its base) is
    // visibly wrong rather than silently picking up the caller's
    // workspace context. Pinned by the exact-URL test in
    // ``tests/resources/me.test.ts``.
    mutable.me = new MeResource(client, '_account')
    mutable.apiKeys = new ApiKeysResource(client, workspaceId)
    mutable.tokens = new TokensResource(client, workspaceId)
    mutable.workspaceAuthentication = new WorkspaceAuthenticationResource(client, workspaceId)
    mutable.ssoLifecycle = new SsoLifecycleResource(client, workspaceId)
    mutable.ssoGrants = new SsoGrantsResource(client, workspaceId)
    mutable.identityCredentials = new IdentityCredentialsResource(client, '_identity-admin')
    mutable.agents = new AgentsResource(client, workspaceId)
    mutable.agentRuns = new AgentRunsResource(client, workspaceId)
    mutable.runs = new RunsResource(client, workspaceId)
    mutable.skills = new SkillsResource(client, workspaceId)
    mutable.actions = new ActionsResource(client, workspaceId)
    mutable.operators = new OperatorsResource(client, workspaceId)
    mutable.promptLogs = new PromptLogsResource(client, workspaceId)
    mutable.triggers = new TriggersResource(client, workspaceId)
    mutable.services = new ServicesResource(client, workspaceId)
    mutable.stagingClones = new StagingClonesResource(client, workspaceId)
    mutable.contextGraphs = new ContextGraphsResource(client, workspaceId)
    mutable.dataSources = new DataSourcesResource(client, workspaceId)
    mutable.world = new WorldResource(client, workspaceId)
    mutable.calls = new CallsResource(client, workspaceId)
    mutable.conversations = new ConversationsResource(client, workspaceId, agentBaseUrl)
    mutable.integrations = new IntegrationsResource(client, workspaceId)
    mutable.externalIntegrations = new ExternalIntegrationsResource(client, workspaceId)
    mutable.analytics = new AnalyticsResource(client, workspaceId)
    mutable.simulations = new SimulationsResource(client, workspaceId)
    mutable.metrics = new MetricsResource(client, workspaceId)
    mutable.productionEvals = new ProductionEvalsResource(client, workspaceId)
    mutable.settings = new SettingsResource(client, workspaceId)
    mutable.recordings = new RecordingsResource(client, workspaceId)
    mutable.audit = new AuditResource(client, workspaceId)
    mutable.compliance = new ComplianceResource(client, workspaceId)
    mutable.events = new EventsResource(client, workspaceId)
    mutable.functions = new FunctionsResource(client, workspaceId)
    mutable.observers = new ObserversResource(client, workspaceId, agentBaseUrl)
    mutable.fhir = new FhirResource(client, workspaceId)
    mutable.insights = new InsightsResource(client, workspaceId)
    mutable.commandCenter = new CommandCenterResource(client, workspaceId)
    mutable.sensorium = new SensoriumResource(client, workspaceId)
    mutable.clientConfig = new ClientConfigResource(client, workspaceId)
    mutable.dashboards = new DashboardsResource(client, workspaceId)
    mutable.intake = new IntakeResource(client, workspaceId)
    mutable.dataQuery = new DataQueryResource(client, workspaceId)
    mutable.briefs = new BriefsResource(client, workspaceId)
    mutable.network = new NetworkResource(client, workspaceId)
    mutable.pipeline = new PipelineResource(client, workspaceId)
    mutable.tools = new ToolsResource(client, workspaceId)
    mutable.surfaces = new SurfacesResource(client, workspaceId)
    mutable.sessions = new SessionsResource(client, workspaceId)
    mutable.workspaceDataQueries = new WorkspaceDataQueriesResource(client, workspaceId)
  }

  private async resolveApiRequest<
    Path extends keyof paths & string,
    Method extends 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
  >(
    path: Path,
    method: Method,
    init: AmigoRequestOptions<OperationFor<Path, Lowercase<Method>>> | undefined,
  ): Promise<{ data?: unknown; error?: unknown; response: Response }> {
    const { baseClient, options } = resolveScopedPlatformClient(this.api)
    const mergedInit = mergeRequestOptions(options, withWorkspaceId(path, init, this.workspaceId))
    const requestInit = applyPlatformRequestOptions(
      baseClient,
      mergedInit as AmigoRequestOptions<OperationFor<Path, Lowercase<Method>>> | undefined,
    )

    switch (method) {
      case 'GET':
        return await baseClient.GET(path as never, requestInit as never)
      case 'POST':
        return await baseClient.POST(path as never, requestInit as never)
      case 'PUT':
        return await baseClient.PUT(path as never, requestInit as never)
      case 'PATCH':
        return await baseClient.PATCH(path as never, requestInit as never)
      case 'DELETE':
        return await baseClient.DELETE(path as never, requestInit as never)
      case 'HEAD':
        return await baseClient.HEAD(path as never, requestInit as never)
      case 'OPTIONS':
        return await baseClient.OPTIONS(path as never, requestInit as never)
    }
  }
}

// --- Public exports ---

export type { AmigoClientConfig as AmigoConfig }

export {
  AmigoError,
  BadRequestError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  ServerError,
  ServiceUnavailableError,
  NetworkError,
  RequestTimeoutError,
  ParseError,
  ConfigurationError,
  isAmigoError,
  isNotFoundError,
  isRateLimitError,
  isAuthenticationError,
  isRequestTimeoutError,
  isPermissionError,
  isConflictError,
  isValidationError,
  isServerError,
  isNetworkError,
  isHttpException,
  isHttpValidationError,
  isUnparseableErrorBody,
} from './core/errors.js'

export type {
  ErrorContext,
  PlatformErrorBody,
  HttpExceptionBody,
  HttpValidationErrorBody,
  UnparseableErrorBody,
  AmigoErrorWithBody,
} from './core/errors.js'

export type {
  WorkspaceId,
  ApiKeyId,
  AgentId,
  SkillId,
  ActionId,
  ServiceId,
  ContextGraphId,
  CallId,
  PhoneNumberId,
  IntegrationId,
  IntegrationEndpointId,
  EntityId,
  EventId,
  SimulationRunId,
  SimulationSessionId,
  FunctionId,
  DataSourceId,
} from './core/branded-types.js'

export {
  workspaceId,
  apiKeyId,
  agentId,
  skillId,
  actionId,
  serviceId,
  contextGraphId,
  callId,
  phoneNumberId,
  integrationId,
  integrationEndpointId,
  entityId,
  eventId,
  simulationRunId,
  simulationSessionId,
  functionId,
  dataSourceId,
} from './core/branded-types.js'

export { paginate } from './core/utils.js'
export { buildLastResponse, extractRequestId } from './core/utils.js'
export type {
  PaginatedList,
  ListParams,
  LastResponseInfo,
  ResponseMetadata,
  WithResponseMetadata,
  AmigoResponse,
} from './core/utils.js'
export type { AmigoRequestOptions, ScopedRequestOptions } from './core/request-options.js'
export type { RetryOptions } from './core/retry.js'

export { parseRateLimitHeaders } from './core/rate-limit.js'
export type { RateLimitInfo } from './core/rate-limit.js'

export {
  verifyWebhookSignature,
  parseWebhookEvent,
  WebhookVerificationError,
} from './core/webhooks.js'
export type {
  WebhookEvent,
  WebhookVerificationOptions,
  ParseWebhookEventOptions,
} from './core/webhooks.js'
export type {
  ClientHooks,
  RequestHookContext,
  ResponseHookContext,
  ErrorHookContext,
} from './core/openapi-client.js'

export { TokensResource } from './resources/tokens.js'
export { EXTERNAL_USER_SESSION_CREATE_SCOPE } from './resources/tokens.js'
export type {
  ApiKeyTokenExchangeRequest,
  ApiKeyTokenExchangeResponse,
  ClientCredentialsTokenRequest,
  ClientCredentialsTokenResponse,
  ExternalUserSessionTokenRequest,
  ExternalUserSessionTokenResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from './resources/tokens.js'

export { ExternalIntegrationsResource } from './resources/external-integrations.js'
export type {
  CreateExternalIntegrationCredentialRequest,
  CreateExternalIntegrationRequest,
  ExternalIntegration,
  ExternalIntegrationCredential,
  ExternalIntegrationCredentialSecret,
  ExternalIntegrationListResponse,
  ListExternalIntegrationsParams,
  UpdateExternalIntegrationRequest,
} from './resources/external-integrations.js'

export { IntegrationsResource } from './resources/integrations.js'
export type {
  CreateIntegrationEndpointRequest,
  CreateIntegrationRequest,
  CustomTokenExchangeIntegrationAuthRequest,
  Integration,
  IntegrationAuth,
  IntegrationAuthRequest,
  IntegrationEndpoint,
  IntegrationEndpointListResponse,
  IntegrationIdentityBinding,
  IntegrationIdentityBindings,
  IntegrationIdentityBindingTestValues,
  IntegrationListResponse,
  ListEndpointsParams,
  ListIntegrationsParams,
  TestIntegrationEndpointRequest,
  TestIntegrationEndpointResponse,
  UpdateIntegrationEndpointRequest,
  UpdateIntegrationRequest,
} from './resources/integrations.js'

export type {
  MetricCatalogEntry,
  MetricCatalogResponse,
  MetricListResponse,
  MetricValueListResponse,
  MetricValue,
  NumericalMetricValue,
  CategoricalMetricValue,
  BooleanMetricValue,
  MetricListParams,
  MetricValuesParams,
  MetricTrendParams,
} from './resources/metrics.js'
/** @deprecated Use `MetricValue` instead. */
export type MetricValueResponse = MetricValueAlias

export type { FireTriggerRequest, ListTriggersParams } from './resources/triggers.js'

export type {
  CallEvalResult,
  CallEvalResultsResponse,
  CreateProductionEvalDefinitionRequest,
  ListProductionEvalDefinitionsParams,
  ProductionEvalDefinition,
  ProductionEvalDefinitionListResponse,
  UpdateProductionEvalDefinitionRequest,
} from './resources/production-evals.js'

export type {
  AdvancedCallStatsParams,
  AdvancedCallStatsResponse,
  EntitySurfaceHistoryParams,
  EvalQualityParams,
  EvalQualityResponse,
  SurfaceChannelEffectivenessParams,
  SurfaceCompletionRatesParams,
  SurfaceFieldAbandonmentParams,
  ToolPerformanceParams,
  ToolPerformanceResponse,
} from './resources/analytics.js'

export type {
  ListVoiceJudgeResultsParams,
  VoiceJudgeResult,
  VoiceJudgeResultListResponse,
} from './resources/services.js'

export type {
  StagingClonePreviewRequest,
  StagingClonePreviewResponse,
  StagingClonePullRequest,
  StagingCloneApplyRequest,
  StagingCloneReceipt,
  StagingPairing,
  StagingSourceServices,
  StagingCloneImports,
  StagingSourceServicesParams,
  StagingCloneImportsParams,
  StagingMirrorProposal,
  StagingMirrorApplyRequest,
  StagingMirrorReceipt,
  StagingCloneBatchRequest,
  StagingCloneBatchResult,
} from './resources/staging-clones.js'

export type { StagingWorkspaceSource } from './resources/me.js'

export type { Run, RunManifest } from './resources/runs.js'

/** Voice provider constants and types. */
export {
  STT_PROVIDERS,
  TTS_PROVIDERS,
  VOICE_LANGUAGES,
  VOICE_SESSION_PROVIDERS,
} from './resources/voice.js'
export type {
  AgentVoiceConfig,
  ServiceVoiceConfigInput,
  ServiceVoiceConfigOutput,
  SttProvider,
  TtsProvider,
  VoiceLanguage,
  VoiceSessionProvider,
  VoiceSettingsRequest,
  VoiceSettingsResponse,
} from './resources/voice.js'

export type {
  CreateWorkspaceDataQueryRequest,
  InvokeWorkspaceDataQueryRequest,
  InvokeWorkspaceDataQueryResponse,
  UpdateWorkspaceDataQueryRequest,
  WorkspaceDataQuery,
  WorkspaceDataQueryListItem,
  WorkspaceDataQueryListResponse,
} from './resources/workspace-data-queries.js'

export type { ClientConfig } from './resources/client-config.js'

export type {
  CreateDashboardRequest,
  Dashboard,
  DashboardExecuteResponse,
  DashboardListResponse,
  DashboardPanelResult,
  ExecuteDashboardRequest,
  ListDashboardsParams,
  UpdateDashboardRequest,
} from './resources/dashboards.js'

export type {
  DataQueryParams,
  WorkspaceQueryRequest,
  WorkspaceQueryResponse,
} from './resources/data-query.js'

export type {
  IntakeBatch,
  IntakeBatchDetail,
  IntakeBatchListResponse,
  IntakeDataset,
  IntakeDatasetListResponse,
  IntakeDatasetUpdateRun,
  IntakeFile,
  IntakeFileListResponse,
  IntakeFileStatus,
  IntakeMaterialization,
  IntakeMaterializationListResponse,
  IntakeMaterializeRequest,
  IntakeMaterializeResponse,
  IntakeSource,
  IntakeSourceListResponse,
  IntakeSourceSyncResponse,
  ListIntakeBatchesParams,
  ListIntakeDatasetsParams,
  ListIntakeFilesParams,
  ListIntakeMaterializationsParams,
  ListIntakeSourcesParams,
  RegisterIntakeSchemaRequest,
  RegisterIntakeSourceRequest,
  UploadIntakeFileParams,
} from './resources/intake.js'

export type CallSummary = components['schemas']['CallSummary']
export type CallDetail = components['schemas']['CallDetailResponse']
export type CallTurn = components['schemas']['Turn']
export type CallToolCall = components['schemas']['ToolCall']
export type PlaybackTimeline = components['schemas']['PlaybackTimeline']
export type TimelineActor = components['schemas']['TimelineActor']
export type TimelineLaneDefinition = components['schemas']['TimelineLaneDefinition']
export type TimelineSegment = components['schemas']['TimelineSegment']
export type TimelineTimebase = components['schemas']['TimelineTimebase']
export type TurnTimeline = components['schemas']['TurnTimeline']
export type TimelineSegmentType = TimelineSegment['type']
export type TimelineLane = TimelineSegment['lane']
export type TimelineTrack = NonNullable<TimelineSegment['track']>
export type TimelineActorKind = TimelineActor['kind']
export type TimelineActorRole = TimelineActor['role']

export type {
  SubscribeToWorkspaceOptions,
  SubscriptionHandle,
  WorkspaceSSEEvent,
  WorkspaceSSEEventType,
  WorkspaceEventStreamErrorCode,
} from './resources/events.js'
export { WorkspaceEventStreamError, isWorkspaceEventStreamError } from './resources/events.js'

export { sessionConnectAuthProtocols, textStreamAuthProtocols } from './resources/conversations.js'
export type {
  ChannelKind,
  ConversationDetail,
  ConversationSource,
  ConversationTurn,
  ConversationTurnAvailableAction,
  ConversationTurnStateTransition,
  CreateConversationRequest,
  SessionConnectUrlParams,
  SwitchChannelRequest,
  TextStreamAuthProtocols,
  TextStreamUrlParams,
  TurnArtifactEvent,
  TurnDoneEvent,
  TurnErrorEvent,
  TurnMessageEvent,
  TurnRequest,
  TurnResponse,
  TurnConversationSnapshot,
  TurnStateEvent,
  TurnStateTransitionEvent,
  TurnStreamEvent,
  TurnThinkingEvent,
  TurnTokenEvent,
  TurnToolCallCompletedEvent,
  TurnToolCallStartedEvent,
} from './resources/conversations.js'

// Voice-call observer real-time stream
export { ObserversResource, observerAuthProtocols } from './resources/observers.js'
export type {
  ObserverAuthProtocols,
  ObserverSSEEvent,
  ObserverSSEEventType,
  ObserverSubscribeOptions,
} from './resources/observers.js'

// Reconnecting WebSocket primitive (compose for custom realtime surfaces)
export {
  createReconnectingWebSocket,
  ReconnectingWebSocketError,
} from './core/reconnecting-websocket.js'
export type {
  ReconnectingWebSocketErrorReason,
  ReconnectingWebSocketHandle,
  ReconnectingWebSocketOptions,
  ReconnectingWebSocketReconnectReason,
  ReconnectingWebSocketState,
  WebSocketFactory,
} from './core/reconnecting-websocket.js'

// Device code auth (desktop / CLI login)
export {
  loginWithDeviceCode,
  TokenManager,
  FileTokenStorage,
  MemoryTokenStorage,
  DeviceCodeExpiredError,
  DeviceCodeDeniedError,
  RefreshTokenExpiredError,
  LoginCancelledError,
  formatDeviceCodeInstructions,
  formatDeviceCodeLink,
  formatWorkspaceList,
  openBrowser,
} from './core/device-code.js'
export type {
  DeviceCodeIssuance,
  IdentityTokenResponse,
  WorkspaceChoice,
  MultiWorkspaceResponse,
  DeviceCodeLoginOptions,
  DeviceCodeStatus,
  AuthResult,
  StoredCredentials,
  TokenStorage,
  TokenManagerConfig,
} from './core/device-code.js'

// Generated OpenAPI types — consumers can import specific schemas
export type { paths, components, operations } from './generated/api.js'

function withWorkspaceId<Path extends keyof paths & string, Init>(
  path: Path,
  init: Init | undefined,
  workspaceId: string,
): Init | { params: { path: { workspace_id: string } } } {
  if (!path.includes('{workspace_id}')) {
    return (init ?? {}) as Init
  }

  const current = (init ?? {}) as {
    params?: {
      path?: Record<string, unknown>
    }
  }

  return {
    ...current,
    params: {
      ...(current.params ?? {}),
      path: {
        ...(current.params?.path ?? {}),
        workspace_id: workspaceId,
      },
    },
  }
}

export * from './resources/workspace-authentication.js'
export * from './resources/sso-lifecycle.js'
export * from './resources/sso-grants.js'
export * from './resources/identity-credentials.js'
