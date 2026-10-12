# API Surface

> Generated from source. Do not edit directly.

Repo-local reference for the public TypeScript SDK surface. This document complements the product docs and stays focused on the package exports that ship from this repository.

## Client

### `AmigoClient`

Configuration fields:

- `apiKey: string`
- `workspaceId: string`
- `baseUrl?: string`
- `retry?: RetryOptions`
- `maxRetries?: number`
- `timeout?: number`
- `headers?: HeadersOptions`
- `hooks?: ClientHooks`
- `fetch?: typeof globalThis.fetch`
- `agentBaseUrl?: string`

Instance fields:

- `workspaceId: string`
- `baseUrl: string`

Client methods:

- `withOptions(options)`
- `GET(path, options?)`
- `POST(path, options?)`
- `PUT(path, options?)`
- `PATCH(path, options?)`
- `DELETE(path, options?)`
- `HEAD(path, options?)`
- `OPTIONS(path, options?)`

Notes:

- Workspace-scoped paths receive the configured `workspaceId` automatically, and the configured value wins if `workspace_id` is provided manually.
- `client.withOptions(options)` and `client.<resource>.withOptions(options)` layer headers, timeout, and retry overrides onto the normal resource surface.
- Low-level helpers return `AmigoResponse<T>` with `data`, `response`, `requestId`, and `rateLimit`.
- Object responses from resource methods include `_request_id` and `lastResponse` metadata.

## Core exports

- Errors: `AmigoError`, `BadRequestError`, `AuthenticationError`, `PermissionError`, `NotFoundError`, `ConflictError`, `ValidationError`, `RateLimitError`, `ServerError`, `ServiceUnavailableError`, `NetworkError`, `RequestTimeoutError`, `ParseError`, `ConfigurationError`
- Error guards: `isAmigoError`, `isNotFoundError`, `isRateLimitError`, `isAuthenticationError`, `isRequestTimeoutError`, `isPermissionError`, `isConflictError`, `isValidationError`, `isServerError`, `isNetworkError`, `isHttpException`, `isHttpValidationError`, `isUnparseableErrorBody`
- Request option types: `AmigoRequestOptions`, `ScopedRequestOptions`
- Webhooks: `verifyWebhookSignature`, `parseWebhookEvent`, `WebhookVerificationError`
- Pagination and response helpers: `paginate`, `buildLastResponse`, `extractRequestId`
- Conversation helpers: `sessionConnectAuthProtocols`, `textStreamAuthProtocols`
- Conversation types: `ChannelKind`, `ConversationDetail`, `ConversationTurn`, `ConversationTurnAvailableAction`, `ConversationTurnStateTransition`, `CreateConversationRequest`, `SessionConnectUrlParams`, `SwitchChannelRequest`, `TextStreamAuthProtocols` (WebSocket constructor subprotocol tuple), `TextStreamUrlParams`, `TurnDoneEvent`, `TurnErrorEvent`, `TurnMessageEvent`, `TurnRequest`, `TurnResponse`, `TurnConversationSnapshot`, `TurnStreamEvent`, `TurnThinkingEvent`, `TurnTokenEvent`, `TurnToolCallCompletedEvent`, `TurnToolCallStartedEvent`
- Voice provider constants: `STT_PROVIDERS`, `TTS_PROVIDERS`, `VOICE_SESSION_PROVIDERS`
- Voice provider types: `AgentVoiceConfig`, `ServiceVoiceConfigInput`, `ServiceVoiceConfigOutput`, `SttProvider`, `TtsProvider`, `VoiceSessionProvider`, `VoiceSettingsRequest`, `VoiceSettingsResponse`
- Response and hook types: `PaginatedList`, `ListParams`, `LastResponseInfo`, `ResponseMetadata`, `WithResponseMetadata`, `AmigoResponse`, `RetryOptions`, `RateLimitInfo`, `ClientHooks`, `RequestHookContext`, `ResponseHookContext`, `ErrorHookContext`
- Generated OpenAPI types: `paths`, `components`, `operations`
- Generated API types are produced with `npm run gen-types` from the committed `openapi.json` snapshot.
- The generated OpenAPI types may include spec-only endpoints that do not yet have resource wrappers; use the low-level `GET`/`POST`/`PUT`/`PATCH`/`DELETE` helpers for those operations until a dedicated resource is added. Current spec-only groups include `/use-cases`, `/cost-to-serve`, and `/metric-store`.

## Resources

All workspace-scoped resources also expose `withOptions(options)`.

### `agentBaseUrl`

### `workspaces`

- `list`
- `listAutoPaging`
- `get`
- `update`
- `archive`
- `provision`
- `testCallerNumbers.get`
- `testCallerNumbers.update`

### `me`

- `createWorkspace`

### `apiKeys`

- `me`
- `create`
- `list`
- `listAutoPaging`
- `revoke`
- `rotate`

### `tokens`

- `exchangeApiKey`
- `exchangeClientCredentials`
- `createExternalUserSession`
- `refresh`

### `agents`

- `create`
- `list`
- `listAutoPaging`
- `get`
- `update`
- `delete`
- `listVersions`
- `listVersionsAutoPaging`
- `getVersion`
- `createVersion`

### `agentRuns`

- `harnessContext`

### `runs`

- `list`
- `summary`
- `get`
- `trajectory`
- `sendGuidance`
- `takeOver`
- `handBack`
- `switchMode`

### `skills`

- `create`
- `list`
- `listAutoPaging`
- `get`
- `update`
- `delete`
- `test`

### `actions`

- `create`
- `list`
- `listAutoPaging`
- `get`
- `update`
- `delete`
- `getReferences`
- `test`

### `operators`

- `list`
- `listAutoPaging`
- `create`
- `get`
- `update`
- `getDashboard`
- `getQueue`
- `getEscalations`
- `getEscalationsAutoPaging`
- `getActiveEscalations`
- `getEscalationStats`
- `getPerformance`
- `joinCall`
- `leaveCall`
- `switchMode`
- `sendGuidance`
- `createBriefing`
- `wrapUp`
- `getCallTranscript`
- `getAuditLog`
- `getAuditLogAutoPaging`

### `promptLogs`

- `list`
- `listAutoPaging`

### `triggers`

- `list`
- `listAutoPaging`
- `create`
- `get`
- `update`
- `delete`
- `fire`
- `pause`
- `resume`
- `listRuns`
- `listRunsAutoPaging`

### `services`

- `create`
- `list`
- `listAutoPaging`
- `get`
- `update`
- `delete`

### `contextGraphs`

- `create`
- `list`
- `listAutoPaging`
- `get`
- `update`
- `delete`
- `createVersion`
- `listVersions`
- `listVersionsAutoPaging`
- `getVersion`

### `dataSources`

- `create`
- `list`
- `listAutoPaging`
- `get`
- `update`
- `delete`
- `getStatus`
- `getSyncHistory`

### `world`

- `listEntities`
- `listEntitiesAutoPaging`
- `getEntity`
- `getRelationships`
- `getGraph`
- `getProvenance`
- `getLineage`
- `getMerged`
- `getConnectorEntities`
- `getConnectorResources`
- `listEntityTypes`
- `listDuplicates`
- `search`
- `getTimeline`
- `getTimelineAutoPaging`
- `getStats`
- `getSourceBreakdown`

### `calls`

- `list`
- `listAutoPaging`
- `get`
- `getTimeline`
- `getIntelligence`
- `getBenchmarks`
- `getPhoneVolume`
- `getTraceAnalysis`
- `listTraces`
- `getMetrics`
- `createOutbound`

### `conversations`

- `create`
- `get`
- `close`
- `switchChannel`
- `createTurn`
- `pollTurn`
- `createTurnStream`
- `streamTurn`
- `textStreamUrl`
- `sessionConnectUrl`

### `integrations`

- `create`
- `list`
- `listAutoPaging`
- `get`
- `update`
- `delete`
- `listEndpoints`
- `listEndpointsAutoPaging`
- `getEndpoint`
- `createEndpoint`
- `updateEndpoint`
- `deleteEndpoint`
- `testEndpoint`

### `externalIntegrations`

- `list`
- `listAutoPaging`
- `create`
- `get`
- `update`
- `delete`
- `listCredentials`
- `createCredential`
- `revokeCredential`
- `rotateCredential`

### `analytics`

- `getDashboard`
- `getCalls`
- `getAgents`
- `getCallQuality`
- `getEmotionTrends`
- `getLatency`
- `getToolPerformance`
- `getDataQuality`
- `getUsage`
- `getEventBreakdown`
- `getOperatorPerformance`
- `getAdvancedCallStats`
- `compareCallPeriods`
- `surfaces.getCompletionRates`
- `surfaces.getChannelEffectiveness`
- `surfaces.getFieldAbandonment`
- `surfaces.getForEntity`

### `simulations`

- `createSession`
- `getSession`
- `deleteSession`
- `step`
- `recommend`
- `getIntelligence`
- `forkSession`
- `scoreSession`
- `promoteSession`
- `runs.list`
- `runs.create`
- `runs.get`
- `runs.complete`
- `runs.createSession`
- `bridge.run`
- `services.getGraph`
- `services.deleteGraph`
- `services.getGraphPaths`
- `services.listSessions`
- `services.listTurns`

### `metrics`

- `listLatest`
- `getCatalog`
- `getValues`
- `getTrend`

### `settings`

- `voice.get`
- `voice.update`
- `branding.get`
- `branding.update`
- `outreach.get`
- `outreach.update`
- `retention.get`
- `retention.update`
- `gapScanner.get`
- `gapScanner.update`
- `metrics.get`
- `metrics.update`

### `recordings`

- `get`

### `audit`

- `list`
- `listAutoPaging`
- `getSummary`
- `getPhiAccess`
- `getPhiAccessAutoPaging`
- `createExport`
- `getExport`
- `listMyAuditEvents`
- `listPlatformAuditEvents`
- `getEntityAccessLog`
- `getEntityAccessLogAutoPaging`

### `compliance`

- `getDashboard`
- `getHipaa`
- `getAccessReview`

### `events`

- `subscribeToWorkspace`

### `functions`

- `list`
- `get`
- `deploy`
- `delete`
- `invoke`
- `test`

### `observers`

- `subscribe`

### `fhir`

- `getStatus`
- `import`
- `searchPatients`
- `getPatientSummary`
- `getPatientTimeline`
- `resources.search`
- `resources.create`
- `resources.get`
- `resources.update`
- `resources.getHistory`
- `views.patients`
- `views.appointments`
- `views.practitioners`
- `views.organizations`
- `views.locations`
- `views.slots`

### `insights`

- `getDigest`
- `getSchema`
- `getSuggestions`
- `runSql`
- `sessions.create`
- `sessions.get`
- `sessions.chat`

### `commandCenter`

- `get`

### `sensorium`

- `getConnectorHealth`
- `getLoopLatency`

### `dataQuery`

- `run`

### `briefs`

- `get`
- `regenerate`
- `getForEntity`
- `regenerateForEntity`

### `desktopSessions`

- `create`
- `disconnect`
- `sendAction`
- `getScreenshot`
- `getStatus`

### `network`

- `getEgressIps`

### `pipeline`

- `getStatus`
- `getThroughput`
- `getReview`
- `getEntityResolution`
- `outbound.list`
- `outbound.getLog`
- `sources.list`
- `sources.getOverview`
- `sources.listEvents`
- `sources.getHistory`

### `tasks`

- `get`
- `listByCall`

### `tools`

- `execute`
- `resolveForService`

### `surfaces`

- `list`
- `listAutoPaging`
- `listForReview`
- `create`
- `get`
- `update`
- `archive`
- `deliver`
- `getProgress`
- `approve`
- `reject`
- `reshape`

### `sessions`

- `listActive`
- `getFleetStatus`
- `inject`

### `workspaceDatabase`

- `get`
- `post`
- `patch`
- `delete`
- `getFork`
- `createFork`
- `deleteFork`
- `executeQuery`
- `listQueryTools`
- `listQueryToolsAutoPaging`
- `createQueryTool`
- `updateQueryTool`
- `deleteQueryTool`
- `testQueryTool`

### `workspaceDataQueries`

- `list`
- `create`
- `get`
- `update`
- `delete`
- `invoke`

### `api`
