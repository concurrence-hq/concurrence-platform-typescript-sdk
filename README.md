<p align="center">
  <img src="./assets/readme/amigo-banner.png" alt="Amigo banner" width="100%" />
</p>

<h1 align="center">@amigo-ai/platform-sdk</h1>

<p align="center">Official TypeScript SDK for the <a href="https://platform.api-us.concurrence.com/v1/docs">Amigo Platform API</a>.</p>

<p align="center">
  <a href="https://docs.amigo.ai">Product Docs</a>
  ·
  <a href="https://docs.amigo.ai/developer-guide/platform-api/platform-sdk">Developer Guide</a>
  ·
  <a href="https://docs.amigo.ai/api-reference">API Reference</a>
  ·
  <a href="./examples/README.md">Examples</a>
  ·
  <a href="./api.md">API Surface</a>
  ·
  <a href="./CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@amigo-ai/platform-sdk"><img src="https://img.shields.io/npm/v/@amigo-ai/platform-sdk.svg" alt="npm version" /></a>
  <a href="https://github.com/amigo-ai/amigo-platform-typescript-sdk/actions/workflows/test.yml"><img src="https://github.com/amigo-ai/amigo-platform-typescript-sdk/actions/workflows/test.yml/badge.svg" alt="CI" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
</p>

Typed from the committed `openapi.json` snapshot, validated on active LTS Node releases (20, 22, and 24), and tested as packaged ESM and CommonJS tarballs before release.

## Platform context

The SDK is the typed client boundary between your runtime and the workspace-scoped Platform API. The API then fronts the platform systems that power agents, actions, calls, analytics, world state, connectors, and webhooks.

![TypeScript SDK platform context](./assets/readme/platform-architecture.svg)

## Documentation

| Need                                        | Best entry point                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Product architecture and deployment context | [docs.amigo.ai](https://docs.amigo.ai/)                                            |
| Tutorials and integration guidance          | [Developer Guide](https://docs.amigo.ai/developer-guide/platform-api/platform-sdk) |
| Endpoint-by-endpoint REST reference         | [API Reference](https://docs.amigo.ai/api-reference)                               |
| Repo-local SDK examples                     | [examples/README.md](./examples/README.md)                                         |
| Generated package surface                   | [api.md](./api.md)                                                                 |
| Published release history                   | [CHANGELOG.md](./CHANGELOG.md)                                                     |

### Guides

| Guide                                                        | Description                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| [Build a Custom Patient Form](./docs/guides/build-a-form.md) | Create, deliver, and render patient intake forms using surfaces |

The docs site remains the primary reference. The repo-local examples stay close to the shipped package surface and are typechecked in CI to reduce drift.

## Installation

```bash
npm install @amigo-ai/platform-sdk
```

## Quick start

```typescript
import { AmigoClient } from '@amigo-ai/platform-sdk'

const client = new AmigoClient({
  apiKey: 'your-api-key',
  workspaceId: 'your-workspace-id',
})

// List agents
const { items: agents } = await client.agents.list({ limit: 10 })
console.log(agents.map((agent) => agent.name))

// Search entities in the world model
const entityResults = await client.world.listEntities({
  q: 'Jane Doe',
  entity_type: ['patient'],
  limit: 5,
})
console.log(entityResults.entities[0]?.display_name)

// Get call analytics for the last 30 days
const stats = await client.analytics.getCalls({ days: 30 })
console.log(stats.total_calls, stats.avg_duration_seconds)
```

## Authentication

### API key (server-to-server)

Pass `apiKey` and `workspaceId` to `AmigoClient`. Best for backend services and scripts.

### Device code flow (CLI and desktop apps)

For interactive apps where users sign in via the browser, use `loginWithDeviceCode`:

```typescript
import {
  loginWithDeviceCode,
  openBrowser,
  formatDeviceCodeInstructions,
  TokenManager,
  FileTokenStorage,
} from '@amigo-ai/platform-sdk'

const result = await loginWithDeviceCode({
  onCode: async (issuance) => {
    console.log(formatDeviceCodeInstructions(issuance))
    await openBrowser(issuance.verification_uri_complete)
  },
  onWorkspaceRequired: async (workspaces) => {
    // Prompt user to pick a workspace
    return workspaces[0].workspace_id
  },
})

// Persist credentials across runs
const tokens = new TokenManager({ storage: new FileTokenStorage() })
await tokens.store(result)

// Use the token
const client = new AmigoClient({ apiKey: result.accessToken, workspaceId: result.workspaceId })
```

To sign out, call `tokens.signOut()`. It requests revocation of the refresh token and access token at Identity, then removes the stored credentials. It joins any in-flight refresh, includes its rotated credentials in the revocation requests, and prevents access-token reads during sign-out. Refresh network requests have a 30-second deadline; each revocation attempt has a five-second deadline and retries once on a server error. If a revocation request fails it rejects, after removing the credentials. A successful response confirms acceptance of the request; it does not prove immediate rejection by every token consumer. `tokens.clear()` only forgets the credentials on this machine; a copied token stays valid until it expires.

Services that validate JWTs locally can keep accepting previously issued access tokens until expiry. Sign-out does not guarantee immediate access-token revocation across every downstream service.

See [`examples/auth/device-code-login.ts`](./examples/auth/device-code-login.ts) for a complete working example.

### Exchange an API key for a JWT

Use `client.tokens.exchangeApiKey()` to swap a long-lived API key for a
short-lived identity-issued JWT. This is useful when you want to mint a
narrowly scoped, time-bound token from a privileged server (for example to
forward to a browser via a BFF proxy, or to call the platform from a runtime
that can't safely hold the raw API key).

The call posts to `POST /token` on the identity host (`identityBaseUrl`, see
[Hosts](#hosts)) and is **not**
workspace-scoped — `workspaceId` is still required on the client because it
governs every other resource call on the same instance, but `POST /token`
itself ignores it. The SDK also unconditionally strips the configured
`Authorization` header for this one request and sends the exchange key only
as the `api_key` form field, so the configured client key is never sent over
the wire on the exchange call.

```typescript
import { AmigoClient } from '@amigo-ai/platform-sdk'

const apiKey = process.env.AMIGO_API_KEY
const workspaceId = process.env.AMIGO_WORKSPACE_ID
if (!apiKey || !workspaceId) {
  throw new Error('AMIGO_API_KEY and AMIGO_WORKSPACE_ID must be set')
}

const client = new AmigoClient({ apiKey, workspaceId })

const { access_token, expires_in, scope } = await client.tokens.exchangeApiKey({
  apiKey,
  // Optional: request a narrower scope on the issued JWT. Enforcement is
  // server-side — the SDK just forwards the value as a form field.
  scope: 'entities:read agents:read',
})

console.log(`Got JWT, expires in ${expires_in}s with scope "${scope}"`)

// Use the JWT in a second client. JWTs are passed as `apiKey` — Bearer auth.
const scopedClient = new AmigoClient({ apiKey: access_token, workspaceId })

const { items: agents } = await scopedClient.agents.list({ limit: 5 })
console.log(agents.map((agent) => agent.name))
```

The response is the standard OAuth-style token payload (`access_token`,
`token_type`, `expires_in`, `scope`, plus optional `session_id` /
`refresh_token` when applicable). The `apiKey` you pass to
`exchangeApiKey()` can be a different key than the one configured on the
client — the configured key is not used to authenticate the exchange
request itself.

### External-user sessions for customer text chat

Use external-user sessions when a customer backend needs to start or continue
text conversations on behalf of one of its own users without giving that user a
workspace membership. The customer backend first obtains a constrained parent
JWT with `external_user_sessions:create`, then mints a short-lived
`external_user` child JWT bound to one workspace, subject, and service.
For a complete setup walkthrough, see
[`docs/guides/external-user-text-conversations.md`](./docs/guides/external-user-text-conversations.md).

Create a parent external-integration credential from an admin/owner backend.
The plaintext `client_secret` is returned only once, from create or rotate:

```typescript
import { AmigoClient } from '@amigo-ai/platform-sdk'

const admin = new AmigoClient({ apiKey: process.env.AMIGO_API_KEY!, workspaceId })

const integration = await admin.externalIntegrations.create({
  name: 'customer-portal',
  display_name: 'Customer Portal',
  description: 'Backend that mints external-user chat sessions',
})

const { client_secret, credential } = await admin.externalIntegrations.createCredential(
  integration.id,
  {
    name: 'production backend',
    service_ids: [serviceId],
  },
)

console.log(credential.client_id)
// Store client_secret immediately in your secrets manager. It is shown only once.
```

At runtime, the backend sequence is:

1. Exchange `client_credentials` for the parent JWT.
2. Mint an `external_user` session for `external_subject_key`, `subject_type`,
   and `service_id`.
3. Create a conversation with the child JWT.
4. Send turns or stream turns with the child JWT.
5. Rotate the refresh token before the access token expires.

```typescript
import { EXTERNAL_USER_SESSION_CREATE_SCOPE } from '@amigo-ai/platform-sdk'

const backend = new AmigoClient({ apiKey: process.env.AMIGO_API_KEY!, workspaceId })

const parent = await backend.tokens.exchangeClientCredentials({
  clientId: process.env.AMIGO_EXTERNAL_INTEGRATION_CLIENT_ID!,
  clientSecret: process.env.AMIGO_EXTERNAL_INTEGRATION_CLIENT_SECRET!,
  scope: EXTERNAL_USER_SESSION_CREATE_SCOPE,
})

const session = await backend.tokens.createExternalUserSession({
  parentAccessToken: parent.access_token,
  externalSubjectKey: 'customer-user-123',
  subjectType: 'user',
  serviceId,
  // Optional: include only when this subject is already linked to a world entity.
  consumerEntityId,
  ttlSeconds: 1800,
})

const externalUser = new AmigoClient({
  apiKey: session.access_token,
  workspaceId,
})

const conversation = await externalUser.conversations.create({ service_id: serviceId })
await externalUser.conversations.createTurn(conversation.id, {
  message: 'Hello, I need help scheduling',
})

const refreshed = await backend.tokens.refresh({
  refreshToken: session.refresh_token!,
  workspaceId,
})
```

`external_user` tokens are intentionally conversation-scoped. They can create,
read, close, send turns, and stream turns for their own service-bound
conversation, but they cannot list workspace conversations or request
`include_tool_calls`. A service or entity mismatch is rejected by the API.
Handle `token_expired` by rotating with `client.tokens.refresh()`. Treat refresh
reuse/theft errors as terminal and restart the session from the parent
credential.

## Configuration

| Option            | Type           | Required | Description                                                                                                   |
| ----------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `apiKey`          | `string`       | Yes      | API key or JWT from device code flow (Bearer auth)                                                            |
| `workspaceId`     | `string`       | Yes      | Your workspace ID — all resource operations are scoped to this                                                |
| `baseUrl`         | `string`       | No       | Override the API base URL (default: `https://platform.api-us.concurrence.com`)                                |
| `identityBaseUrl` | `string`       | No       | Identity host for `client.tokens` (default: `baseUrl` if set, else `https://identity.api-us.concurrence.com`) |
| `retry`           | `RetryOptions` | No       | Retry configuration for transient failures                                                                    |
| `maxRetries`      | `number`       | No       | Convenience alias for retry count                                                                             |
| `timeout`         | `number`       | No       | Default request timeout in milliseconds                                                                       |
| `headers`         | `HeadersInit`  | No       | Default headers added to every request                                                                        |
| `hooks`           | `ClientHooks`  | No       | Request/response lifecycle hooks for tracing or logging                                                       |
| `fetch`           | `typeof fetch` | No       | Custom fetch for BFF proxy, cookie forwarding, or test mocking                                                |

### Hosts

The defaults are US production. In another region, set both
base URLs: identity has its own host, and `client.tokens` calls it.

| Environment | `baseUrl`                                 | `identityBaseUrl`                         |
| ----------- | ----------------------------------------- | ----------------------------------------- |
| US          | `https://platform.api-us.concurrence.com` | `https://identity.api-us.concurrence.com` |
| EU          | `https://platform.api-eu.concurrence.com` | `https://identity.api-eu.concurrence.com` |
| AU          | `https://platform.api-au.concurrence.com` | `https://identity.api-au.concurrence.com` |
| CA          | `https://platform.api-ca.concurrence.com` | `https://identity.api-ca.concurrence.com` |

Device-code login (`loginWithDeviceCode`, `TokenManager`) takes the same
identity host as its own `identityBaseUrl` option.

### Retry options

```typescript
const client = new AmigoClient({
  apiKey: 'your-key',
  workspaceId: 'your-workspace-id',
  retry: {
    maxAttempts: 3, // Total attempts including first. Default: 3
    baseDelayMs: 250, // Base delay for exponential backoff. Default: 250
    maxDelayMs: 30000, // Cap on delay. Default: 30_000
  },
})
```

GET requests are retried on 408, 429, 500, 502, 503, 504. POST requests are only retried on 429 with a `Retry-After` header. Backoff uses full jitter.

### Runtime requirements

The SDK is built around web-standard primitives. Use it in runtimes that provide:

- `fetch`, `Request`, `Response`, `Headers`, `URL`
- `AbortController`
- `TextEncoder` / `TextDecoder`
- `crypto.subtle` for webhook signature verification

CI currently validates active LTS Node releases. Standards-based edge/server runtimes with the same APIs work well with the low-level request wrappers.

## Generated Types

The SDK ships with generated OpenAPI types and re-exports them for direct use:

```typescript
import type { components, operations, paths } from '@amigo-ai/platform-sdk'

type Agent = components['schemas']['AgentResponse']
type ListAgentsQuery = operations['list_agents_v1__workspace_id__agents_get']['parameters']['query']
```

Public builds are generated from the committed [`openapi.json`](./openapi.json) snapshot in this repo so type output stays deterministic across machines and CI runs. When you need to refresh that snapshot, run:

```bash
npm run openapi:sync
```

Sync and type generation use the same public-contract projection. Internal-only operations and their exclusive schema dependencies are omitted; shared types and the explicitly preserved, already-published workspace-copy API remain compatible. The committed snapshot must be unchanged by a second projection, which CI verifies before publication.

For a repo-local overview of the exported client surface, see the generated [api.md](./api.md).

## Advanced request control

The normal resource surface supports scoped request overrides, so you can keep the ergonomic API while adding timeout, retry, and header controls:

```typescript
const agents = await client
  .withOptions({
    timeout: 5_000,
    maxRetries: 1,
    headers: { 'X-Debug-Trace': 'true' },
  })
  .agents.list({ limit: 10 })

console.log(agents._request_id)
console.log(agents.lastResponse.statusCode)
console.log(agents.items)
```

You can scope options to a single resource as well:

```typescript
const agent = await client.agents.withOptions({ timeout: 2_000 }).get('agent-id')
```

For lower-level control, use the built-in typed HTTP helpers. Workspace-scoped routes automatically receive your configured `workspaceId`, and the configured value wins if `workspace_id` is provided manually.

```typescript
const result = await client.GET('/v1/{workspace_id}/agents', {
  params: { query: { limit: 10 } },
  timeout: 5_000,
  maxRetries: 1,
  headers: { 'X-Debug-Trace': 'true' },
})

console.log(result.requestId)
console.log(result.data.items)
console.log(result.rateLimit.remaining)
```

Available helpers:

- `client.GET(...)`
- `client.POST(...)`
- `client.PUT(...)`
- `client.PATCH(...)`
- `client.DELETE(...)`
- `client.HEAD(...)`
- `client.OPTIONS(...)`
- `client.withOptions(...)`
- `client.<resource>.withOptions(...)`

### Response metadata

Object responses from resource methods include non-enumerable request metadata:

```typescript
const agent = await client.agents.get('agent-id')

console.log(agent._request_id)
console.log(agent.lastResponse.statusCode)
console.log(agent.lastResponse.rateLimit.remaining)
```

Low-level request helpers return the raw `Response` alongside parsed data:

```typescript
const { data, response, requestId } = await client.GET('/v1/{workspace_id}/agents')

console.log(requestId)
console.log(response.headers.get('content-type'))
console.log(data.items)
```

### Request hooks

Use hooks for logging, tracing, and metrics without wrapping `fetch` yourself:

```typescript
const client = new AmigoClient({
  apiKey: 'your-api-key',
  workspaceId: 'your-workspace-id',
  hooks: {
    onRequest({ request, schemaPath }) {
      console.log('request', request.method, schemaPath)
    },
    onResponse({ response, requestId }) {
      console.log('response', response.status, requestId)
    },
  },
})
```

## Resources

### Tokens

Exchange a long-lived API key for a short-lived identity-issued JWT, or mint
external-user session tokens for customer text chat. See
[Exchange an API key for a JWT](#exchange-an-api-key-for-a-jwt) and
[External-user sessions for customer text chat](#external-user-sessions-for-customer-text-chat)
under Authentication for the full walkthroughs.

```typescript
import { EXTERNAL_USER_SESSION_CREATE_SCOPE } from '@amigo-ai/platform-sdk'

const { access_token, expires_in } = await client.tokens.exchangeApiKey({
  apiKey: process.env.AMIGO_API_KEY!,
  scope: 'entities:read agents:read',
})

const parent = await client.tokens.exchangeClientCredentials({
  clientId: process.env.AMIGO_EXTERNAL_INTEGRATION_CLIENT_ID!,
  clientSecret: process.env.AMIGO_EXTERNAL_INTEGRATION_CLIENT_SECRET!,
  scope: EXTERNAL_USER_SESSION_CREATE_SCOPE,
})
```

### Workspace SSO administration

`client.workspaceAuthentication`, `client.ssoLifecycle`, and `client.ssoGrants`
call the configured `identityBaseUrl` with the client's workspace ID. These
operations require a current human administrator session; an API key or machine
credential does not substitute for that authority. Pass the human access token
through `apiKey`. A Console-style proxy must set `identityBaseUrl` to its Identity
proxy separately from the Platform proxy.

These methods require server support for workspace authentication policies and
lifecycle endpoints; publishing or upgrading the SDK does not enable those features.

Configure an optional policy with explicit coverage, review the current credential
inventory, and prepare and test recovery before requesting activation. Recovery
setup and lifecycle configuration require an independent account sign-in. Owner
confirmation, readiness, activation, and ordinary disabling require the configured
SSO sign-in. Readiness returns blockers and an expiry; activation rechecks current
server evidence and accepts only `expected_revision`. Use `get()` to read the
policy after activation.

Recovery codes and provider private keys belong in transient input state, outside
query caches, URLs, logs, and browser storage. `testRecovery()` consumes one code
and requires the selected recovery administrator. The standalone
`recoverWorkspaceAuthentication()` helper accepts the workspace, recovery revision,
and code without an authenticated client. It disables the policy and invalidates
the code set; it never signs in, creates membership, or returns a token.

Lifecycle `verify()` and `snapshot()` are previews. Configuration or a successful
preview alone does not establish enforced access or an offboarding guarantee.
Managed grants remain separate from independent membership. Before
`convertIndependent()`, read `independent()` and forward its `updated_at` string
unchanged as `expected_updated_at`; converting it through `Date` can discard
precision. The SDK rejects grant revisions outside JavaScript's safe integer range
instead of rounding them. Server-owned revisions are read-only.

Identity writes are never retried automatically, including after `Retry-After`.
Read the current state after an uncertain result; reuse the original approval ID
when retrying a grant approval. Scoped request signals, timeouts, and headers use
the same `withOptions()` API as other resources. Identity errors preserve status
and recognized policy conflict codes while omitting arbitrary response details.

### Identity credential administration

`client.identityCredentials` manages `/admin/credentials` on `identityBaseUrl`.
It is separate from `client.apiKeys`, which manages legacy Platform API keys.
Supply `workspace_id` explicitly when listing or creating credentials; the server
enforces workspace authority. `get()`, `update()`, and `deactivate()` take the
credential ID. Deactivation retains the record and associated data.

For machine credentials (`api_key` and `client_credentials`), `expires_at` accepts
a timezone-aware ISO timestamp. SSO and session-token lifetimes remain managed by
their respective lifecycles. Preserve timestamp strings
without rounding through `Date`. On update, omitting the field preserves its
current value; explicit `null` removes expiration and is an increase in authority.
On create, omitted/null expiry preserves unbounded compatibility only when the
server permits it. The server limits explicit API key expiry to 90 days and client
credential expiry to 3,650 days, and constrains machine callers to their own expiry.
Expiry support requires the corresponding Identity server release.
Changing a deadline does not rewrite an already issued JWT's expiry or guarantee
immediate closure of existing streams. Verify the relevant consumer's admission
and refresh behavior when planning a credential replacement.

Machine creation returns `{ credential, client_id, client_secret }`; SSO and
session-token creation return credential metadata directly. The machine secret is
returned once and belongs outside logs, query caches, URLs, and browser storage.
Writes never retry automatically, even when scoped retry options request it.

```typescript
const credentials = await client.identityCredentials.list({ workspace_id: workspaceId })
await client.identityCredentials.update(credentialId, {
  expires_at: '2027-01-01T00:00:00Z',
})
```

### Agents

```typescript
import type { VoiceSessionProvider } from '@amigo-ai/platform-sdk'

// Create an agent
const agent = await client.agents.create({
  name: 'Patient Intake Agent',
  description: 'Handles inbound scheduling calls',
})

// Create a version (the versioned config object)
const version = await client.agents.createVersion(agent.id, {
  name: 'v1',
  identity: {
    name: 'Alex',
    role: 'Scheduling Coordinator',
    developed_by: 'Acme Health',
    default_spoken_language: 'en',
    relationship_to_developer: {
      ownership: 'Acme Health',
      type: 'assistant',
      conversation_visibility: 'public',
      thought_visibility: 'private',
    },
  },
  voice_config: {
    voice_id: 'voice-abc123',
    session_provider: 'inhouse' satisfies VoiceSessionProvider,
  },
})

// Get the latest version
const latest = await client.agents.getVersion(agent.id, 'latest')

const { items: agents } = await client.agents.list({ search: 'intake' })
```

### Actions

Actions are reusable agent capabilities (formerly "skills").

```typescript
const action = await client.actions.create({
  slug: 'schedule-appointment',
  name: 'Schedule Appointment',
  description: 'Books appointments in the scheduling system',
  input_schema: {
    type: 'object',
    properties: {
      patient_id: { type: 'string' },
      appointment_type: { type: 'string' },
    },
    required: ['patient_id', 'appointment_type'],
  },
})

// Test with a sample input
const result = await client.actions.test(action.id, {
  input: { patient_id: 'ID-001', appointment_type: 'follow-up' },
})
console.log(result.result, result.duration_ms)
```

### Services

Services wire together an agent + context graph + phone channel.

```typescript
import type { VoiceSessionProvider } from '@amigo-ai/platform-sdk'

const { items: services } = await client.services.list()
const service = await client.services.get('service-id')
console.log(service.agent_name, service.channel_type, service.version_sets)

await client.services.update(service.id, {
  voice_config: {
    ...(service.voice_config ?? {}),
    session_provider: 'inhouse' satisfies VoiceSessionProvider,
  },
})

// Replace one version set and leave the others as they are
await client.services.upsertVersionSet(service.id, 'canary', {
  version_set: { agent_version_number: 3, context_graph_version_number: 7 },
})

// Platform caller verification is on by default. Off, the agent never asks a caller to
// verify, and every platform tool that reads a patient record refuses.
await client.services.update(service.id, { platform_caller_verification: false })
```

### Runs

List runs with optional service, kind, channel, and status filters. Values within a filter
match any selected value; different filters combine. Omitted or empty filters leave that
dimension unfiltered.

The API accepts up to 100 service IDs and filters conversations and live voice runs before
pagination. Historical framework runs have no stored service attribution and are excluded
when a service is selected. Combining only `kind: ['framework']` with a service selection
returns no matches.

```typescript
const runs = await client.runs.list({
  serviceId: ['00000000-0000-0000-0000-000000000101'],
  kind: ['conversation'],
  channel: ['voice'],
  status: ['live', 'completed'],
  limit: 25,
})

// Keep the service filter when requesting the next page.
if (runs.has_more) {
  const nextPage = await client.runs.list({
    serviceId: ['00000000-0000-0000-0000-000000000101'],
    kind: ['conversation'],
    channel: ['voice'],
    status: ['live', 'completed'],
    continuationToken: runs.continuation_token,
  })
  console.log(nextPage.items)
}
```

Pass up to 100 conversation IDs as `sourceConversationId` to find the runs those conversations
produced, such as a Playground session's run. Runs with no source conversation, such as framework
runs, are excluded.

```typescript
const { items: conversationRuns } = await client.runs.list({
  sourceConversationId: ['conversation-id'],
})
```

### World Model

The world model tracks entities (patients, contacts, appointments) and the events that flow through them.

```typescript
// Filter entities with simple list queries
const patients = await client.world.listEntities({
  q: 'Jane Doe',
  entity_type: ['patient'],
  limit: 10,
})
console.log(patients.entities.length)

// Get a single entity
const patient = await client.world.getEntity('entity-id')
console.log(patient.display_name, patient.entity_type)

// Query timeline
const timeline = await client.world.getTimeline('entity-id', { limit: 20 })

// Semantic search over the world model
const results = await client.world.search({
  q: 'Jane Doe',
  entity_type: 'patient',
  limit: 5,
})

// Current enrichment values for an entity, and the history of one key
const { values } = await client.world.listEnrichment('entity-id')
const { history } = await client.world.getEnrichmentHistory('entity-id', 'preferred_language')
```

### Calls

Calls are read-only — they are created by the voice pipeline.

```typescript
const { items: calls } = await client.calls.list({
  direction: 'inbound',
  service_id: 'service-id',
})

// Get full detail with transcript and intelligence
const detail = await client.calls.get(calls[0].call_sid)
console.log(detail.intelligence?.summary)
console.log(detail.transcript)

// Analytics benchmarks
const benchmarks = await client.calls.getBenchmarks({ days: 30 })
```

### Text conversations

Use `client.conversations.create()` to start a new durable conversation, then
`client.conversations.createTurn()` for user-first synchronous text turns (or
`streamTurn()` for a typed SSE event stream).

```typescript
const conversation = await client.conversations.create({
  service_id: 'service-id',
  entity_id: 'entity-id',
})

const firstTurn = await client.conversations.createTurn(conversation.id, {
  message: 'Hello, I need help scheduling',
})

const nextTurn = await client.conversations.createTurn(conversation.id, {
  message: 'Tuesday morning works',
})

console.log(nextTurn.output.map((message) => message.text))
```

Move an active conversation to a different channel (e.g. hand off web chat to
iMessage/SMS) with `switchChannel()`; close it with `close()` so the customer
can start fresh on the next inbound message:

```typescript
await client.conversations.switchChannel(conversation.id, {
  channel: 'imessage',
  reason: 'customer_request',
  recipient: '+15555550123', // required for sms/imessage
  use_case_id: 'use-case-id', // required for sms/imessage
  dispatch_opener: true,
})

await client.conversations.close(conversation.id)
```

For real-time browser clients, build the text-stream URL and use WebSocket
subprotocol auth so the token is not placed in the URL:

```typescript
import { textStreamAuthProtocols } from '@amigo-ai/platform-sdk'

const apiKey = process.env.AMIGO_API_KEY!
const url = client.conversations.textStreamUrl({ serviceId: 'service-id' })
const socket = new WebSocket(url, textStreamAuthProtocols(apiKey))

socket.addEventListener('open', () => {
  socket.send(JSON.stringify({ type: 'message', text: 'Hello' }))
})
```

If a browser rejects your API key as a WebSocket subprotocol value, use the
query-token fallback only in trusted contexts. URL tokens can appear in browser
history, server access logs, HTTP proxy logs, and referrer headers:

```typescript
// WARNING: query tokens can be captured by URL logs and browser history.
const url = client.conversations.textStreamUrl({ serviceId: 'service-id', token: apiKey })
const socket = new WebSocket(url)
```

### Real-time event streams

For workspace-wide events (calls, surfaces, pipeline, operators, channels), use the typed SSE consumer:

```typescript
const handle = client.events.subscribeToWorkspace({
  onEvent: (event) => {
    switch (event.event_type) {
      case 'call.started':
        console.log('call started:', event.call_sid)
        break
      case 'pipeline.error':
        console.error('pipeline error:', event)
        break
    }
  },
  onError: (err) => console.error('terminal:', err),
  onReconnect: (attempt) => console.warn(`reconnect #${attempt}`),
})

// Later: handle.unsubscribe(); await handle.done
```

The helper handles automatic reconnect (exp backoff with jitter, server-sent
`retry:` honored), gapless replay via `Last-Event-ID`, and discriminated-union
dispatch. Server emits a structured `error` frame with a stable `code` on
terminal failures — narrow with the typed error guard:

```typescript
import { isWorkspaceEventStreamError } from '@amigo-ai/platform-sdk'

onError: (err) => {
  if (isWorkspaceEventStreamError(err)) {
    if (err.code === 'too_many_streams') {
      // workspace has too many open streams; close another tab
    } else if (err.retryable) {
      // SDK already retried up to maxReconnects; safe to try again later
    }
  }
}
```

For per-call voice observation (`agent_transcript_delta`, `latency`, `session_*`,
`participant_*`, etc.), use the WebSocket-based observer helper:

```typescript
const observerHandle = client.observers.subscribe({
  callSid: 'CAxxx',
  token: bearerToken,
  onEvent: (event) => {
    switch (event.type) {
      case 'agent_transcript_delta':
        renderAgentDelta(event.delta)
        break
      case 'session_end':
        showSummary(event)
        break
    }
  },
  onError: (err) => console.error('observer terminal:', err.reason, err.closeCode),
})
```

Both helpers are built on the shared `ReconnectingWebSocket` primitive, which
maps platform-specific WebSocket close codes (4001 client error, 4029 rate
limit, 4403 auth, 4100 token expired) to a typed reason taxonomy and applies an
idle watchdog (default 45s) so a half-dead socket forces a reconnect rather
than hanging indefinitely. Compose it directly via `createReconnectingWebSocket`
when you need a managed WebSocket outside these resources.

### Analytics

```typescript
// Dashboard KPIs with period-over-period deltas
const dashboard = await client.analytics.getDashboard({ days: 7 })
console.log(dashboard.call_volume.value, dashboard.call_volume.delta_pct)
console.log(dashboard.avg_quality.value)

// Call volume time series
const calls = await client.analytics.getCalls({ days: 30 })
console.log(calls.total_calls, calls.calls_by_date)

// Per-agent performance
const { agents } = await client.analytics.getAgents({ days: 7 })

// Every service's numbers in one request: group_by adds one entry per service to `groups`
const callStats = await client.analytics.getAdvancedCallStats({ days: 30, group_by: 'service_id' })
for (const group of callStats.groups ?? []) {
  console.log(group.service_id, group.summary.total_calls, group.summary.escalated)
}
const toolStats = await client.analytics.getToolPerformance({ days: 30, group_by: 'service_id' })

// Compare two periods
const comparison = await client.analytics.compareCallPeriods({
  current_from: '2026-04-01',
  current_to: '2026-04-15',
  previous_from: '2026-03-15',
  previous_to: '2026-03-31',
})
```

### Metrics and production evals

`metrics.listLatest` returns the newest period of each metric series by default. A
categorical or boolean series comes back as one row, with `distribution` counting each value.

```typescript
const page = await client.metrics.listLatest({ scope: 'aggregate', sort_by: ['+metric_key'] })

// Keep the same filters when requesting the next page.
if (page.has_more) {
  const next = await client.metrics.listLatest({
    scope: 'aggregate',
    sort_by: ['+metric_key'],
    continuation_token: page.continuation_token,
  })
  console.log(next.metrics)
}
```

Production evals score live calls on any channel. A metric eval names an active `ai_query`
call_intelligence metric from the workspace's metric settings.

```typescript
await client.productionEvals.createDefinition({
  eval_key: 'appointment_booked',
  eval_type: 'metric',
  metric_key: 'appointment_booked',
  expected: { equals: true },
})

// Run the active definitions against one completed call (waits on the judge)
const { results } = await client.productionEvals.evaluate(conversationId)

// Read stored verdicts later
const stored = await client.productionEvals.getResults(conversationId)

// One eval's verdicts across calls in a date window (UTC days), failed verdicts first
const verdicts = await client.productionEvals.listResults({
  eval_key: 'appointment_booked',
  date_from: '2026-10-01',
  date_to: '2026-10-28',
})

// Pass rate and score across calls, and recent voice-judge scores for one service
const quality = await client.analytics.getEvalQuality({ days: 30, interval: '1d' })
const voiceJudge = await client.services.listVoiceJudgeResults(serviceId, { limit: 20 })
```

### Integrations

```typescript
const { items: integrations } = await client.integrations.list({ enabled: true })

// Test a specific endpoint
const result = await client.integrations.testEndpoint('integration-id', 'geocode', {
  textQuery: '123 Main St, Springfield',
})
```

### Data Sources

Data sources are stored records. Nothing polls or syncs them since the
[connector runner](https://docs.concurrence.com/developer-guide/platform-api/data-world-model/connector-runner)
was retired, so send source records with `client.fhir.import()` or `client.intake`.

```typescript
const { items: sources } = await client.dataSources.list()
const source = await client.dataSources.get('source-id')
console.log(source.source_type, source.is_active, source.updated_at)

// Events recorded for the source in the last 90 days
const status = await client.dataSources.getStatus('source-id')
console.log(status.event_count)
```

### Settings

```typescript
import type { SttProvider, TtsProvider, VoiceLanguage } from '@amigo-ai/platform-sdk'

// Voice. `language` is one of VOICE_LANGUAGES; `multilingual` starts each call in English
// and follows the language the caller speaks.
const voice = await client.settings.voice.get()
await client.settings.voice.update({
  voice_id: 'new-voice-id',
  speed: 1.1,
  language: 'es' satisfies VoiceLanguage,
  stt_provider: 'deepgram' satisfies SttProvider,
  tts_provider: 'cartesia' satisfies TtsProvider,
})

// Retention
const retention = await client.settings.retention.get()
await client.settings.retention.update({ call_recordings_days: 90 })
```

### Surfaces (Patient Forms)

Surfaces are workspace-scoped form specs for collecting patient data. Create a form, deliver it via SMS or email, and track completion. See the full guide: [Build a Custom Patient Form](./docs/guides/build-a-form.md).

```typescript
// Create a patient intake form
const surface = await client.POST('/v1/{workspace_id}/surfaces', {
  body: {
    entity_id: patientId,
    title: 'New Patient Intake',
    channel: 'sms',
    fields: [
      { key: 'full_name', label: 'Full Name', field_type: 'text', required: true },
      { key: 'date_of_birth', label: 'Date of Birth', field_type: 'date', required: true },
      {
        key: 'allergies',
        label: 'Allergies',
        field_type: 'multiselect',
        options: ['Penicillin', 'Sulfa', 'None'],
      },
    ],
  },
})
console.log(surface.data.url) // Patient-facing token URL

// Deliver via SMS
await client.POST('/v1/{workspace_id}/surfaces/{surface_id}/deliver', {
  params: { path: { surface_id: surface.data.id } },
  body: { channel_address: '+15551234567' },
})

// Track completion
const { data: rates } = await client.GET(
  '/v1/{workspace_id}/analytics/surfaces/completion-rates',
  {},
)
```

Public token routes (`/s/{token}/spec`, `/s/{token}/submit`, etc.) require no API key -- use `openapi-fetch` with the SDK's `paths` type for full type safety on unauthenticated endpoints.

### Operators

```typescript
const { items: operators } = await client.operators.list()
const dashboard = await client.operators.getDashboard()
const queue = await client.operators.getQueue()
const escalations = await client.operators.getActiveEscalations()

// Join/leave calls, switch mode, send guidance
await client.operators.joinCall('operator-id', { call_sid: 'call-sid' })
await client.operators.sendGuidance('operator-id', { text: 'Ask about allergies' })
await client.operators.wrapUp('operator-id', { outcome: 'resolved' })
```

### Operator hand-over

Operators is a beta feature. A workspace has to be enabled for it, and any other workspace gets a
403 (`PermissionError`) from these calls. Ask your Concurrence representative for access.

Hand-over lets a person take over a live conversation. The calls act as the signed-in operator, so
build the client from that operator's identity token, as in the
[device code flow](#device-code-flow-cli-and-desktop-apps). A workspace API key gets a 403.
`operator_id` must be that operator's own id, and the operator needs the `Operator:Update`
permission (the operator, admin and owner roles).

On a text channel (sms, whatsapp, email, web or imessage) the operator takes over, writes a reply,
then hands back. A text run is held under a lease. `takeOver` returns the hold (`held_by`), how long
it lasts (`lease_seconds`, 90) and a `hold_token`, and the hold ends by itself unless the operator
renews it with `renewTakeover`:

```typescript
// operatorToken is the signed-in operator's identity token.
const operatorClient = new AmigoClient({ apiKey: operatorToken, workspaceId })

// Every run says whether it can be taken over. `run.takeover.reason` says why not, and
// `run.takeover.held_by` says who holds it now and until when.
const run = await operatorClient.runs.get(runId)

if (run.takeover.eligible) {
  const hold = await operatorClient.runs.takeOver(runId, {
    operator_id: operatorId,
    mode: 'takeover',
  })

  // Renew while the operator is present, well inside `lease_seconds`. Send `hold_token` back
  // exactly as `takeOver` returned it: it is opaque, and the server matches it exactly.
  if (hold.hold_token) {
    await operatorClient.runs.renewTakeover(runId, {
      operator_id: operatorId,
      hold_token: hold.hold_token,
    })
  }

  // The agent sends the reply as its own message. A 200 means it was handed over, not sent.
  // A run has one reply waiting at a time, and a reply waits up to 2 minutes.
  await operatorClient.runs.authorTurn(runId, {
    operator_id: operatorId,
    text: 'Thanks for waiting. Your refill is ready for pickup.',
  })

  // What became of the reply: `none`, `pending`, `consumed` or `expired`.
  const { state } = await operatorClient.runs.getAuthoredTurn(runId)

  // The agent picks the conversation back up, and a reply still waiting is discarded.
  await operatorClient.runs.handBack(runId, { operator_id: operatorId })
}
```

On a web conversation an external user owns, no agent is started for them. `authorTurn` then
returns `waits_for_person: true`, and the reply goes out when the person next sends a message or
polls, before `expires_at`.

These 409s carry a `detail.code` in the error body: `hold_lost` on a renewal when the hold is gone
(handed back, ended, or another operator took the run), `run_held` on a takeover when another
operator holds the run, and `no_hold` or `reply_pending` on `authorTurn`. A 503 means the run is
busy. The SDK does not retry a POST on a 503, so call again.

```typescript
import { ConflictError, isHttpException } from '@amigo-ai/platform-sdk'

try {
  await operatorClient.runs.renewTakeover(runId, { operator_id: operatorId, hold_token })
} catch (err) {
  const detail = err instanceof ConflictError && isHttpException(err) ? err.errorBody.detail : null
  if (typeof detail === 'object' && !Array.isArray(detail) && detail?.code === 'hold_lost') {
    // The operator no longer holds the run. Take over again to hold it.
  }
}
```

On a voice run the operator joins by phone. `takeOver` dials the number on the operator's profile
into the call. Take over with `mode: 'listen'` to listen first, then call `runs.switchMode` with the
`participant_call_sid` from the response to go live:

```typescript
const joined = await operatorClient.runs.takeOver(runId, {
  operator_id: operatorId,
  mode: 'listen',
})

if (joined.participant_call_sid) {
  await operatorClient.runs.switchMode(runId, {
    operator_id: operatorId,
    mode: 'takeover',
    participant_call_sid: joined.participant_call_sid,
  })
}

// Message the agent without taking over, or hand the call back.
await operatorClient.runs.sendGuidance(runId, {
  operator_id: operatorId,
  message: 'Ask about allergies',
})
await operatorClient.runs.handBack(runId, { operator_id: operatorId })
```

`renewTakeover`, `authorTurn` and `getAuthoredTurn` are for text runs, and `authorTurn` returns a
409 on a voice run. A reply is 1 to 4,000 characters.

To keep an operator screen current, `client.events.subscribeToWorkspace` delivers `call.escalated`,
`operator.registered`, `operator.status_changed`, `operator.joined_call`, `operator.left_call`,
`operator.mode_changed` and `operator.wrap_up`. See [Real-time event streams](#real-time-event-streams).

### Triggers (Automations)

```typescript
const trigger = await client.triggers.create({
  name: 'Daily outreach',
  schedule: '0 9 * * 1-5',
  timezone: 'America/New_York',
  action_id: 'skill-id',
  event_type: 'trigger.scheduled',
  input_template: { campaign: 'follow-up' },
})

await client.triggers.fire(trigger.id)
await client.triggers.pause(trigger.id)
await client.triggers.resume(trigger.id)
const runs = await client.triggers.listRuns(trigger.id)
```

### Compliance

```typescript
const hipaa = await client.compliance.getHipaa()
```

### Audit

```typescript
const { items: events } = await client.audit.list({ limit: 50 })
const summary = await client.audit.getSummary()
await client.audit.createExport({ start_date: '2026-01-01', end_date: '2026-03-31' })
```

### Recordings

```typescript
const urls = await client.recordings.get('call-sid')
```

### Functions (UC Functions)

```typescript
const { items: functions } = await client.functions.list()
const fn = await client.functions.get('my-function')
const result = await client.functions.test('my-function', { input: { query: 'test' } })
```

### Workspace Data Queries

```typescript
const query = await client.workspaceDataQueries.create({
  name: 'recent_orders',
  description: 'Recent orders by status',
  sql_template: 'select * from custom.orders where status = :status',
  parameters: [{ name: 'status', type: 'string', description: 'Order status' }],
})
const result = await client.workspaceDataQueries.invoke(query.id, {
  input: { status: 'open' },
})
```

A query over practice data, such as FAQ articles, locations or hours, declares that its rows hold
no patient's record, so the voice agent never counts its result as one. A query that declares
nothing is counted as one that may hold a patient's record.

```typescript
await client.workspaceDataQueries.create({
  name: 'office_hours',
  description: 'Opening hours by location',
  sql_template: 'select location, opens, closes from custom.office_hours',
  declarations: { reads: { patient_in: 'none' } },
})
```

To run one statement without saving it, use `dataQuery.execute`. It runs as the workspace's own
database role, so it reaches only what that role's grants allow.

```typescript
const { columns, rows } = await client.dataQuery.execute({
  sql: "select id, status from custom.orders where status = 'open'",
})
```

### Intake

Files land in registered datasets, either uploaded directly or synced from Google Shared Drive
sources. Snapshot datasets then materialize into customer-data tables.

```typescript
await client.intake.datasets.registerSchema({
  name: 'clinical-notes',
  file_type: 'pdf',
  accepted_file_types: ['pdf', 'docx'],
})

// A File uploads under its own name. Pass `filename` for a plain Blob.
const uploaded = await client.intake.files.upload({
  dataset: 'clinical-notes',
  file: new File([pdfBytes], 'visit.pdf', { type: 'application/pdf' }),
  doc_metadata: { patient_id: 'patient-123' },
})
const original = await client.intake.files.download(uploaded.id)

for await (const file of client.intake.files.listAutoPaging({ status: 'curated' })) {
  console.log(file.filename, file.version)
}

// Sync a dataset's Drive folders, prepare new files and publish, then wait for the run
let run = await client.intake.datasets.startUpdate('clinical-notes')
while (['checking_drive', 'preparing', 'publishing'].includes(run.status)) {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  run = await client.intake.datasets.getUpdateRun(run.run_id)
}

// Write a snapshot dataset to its customer-data table
await client.intake.materialize({ dataset: 'claims' })
```

### Dashboards

```typescript
const dashboard = await client.dashboards.getBySlug('call-quality')
const { results } = await client.dashboards.execute(dashboard.id, {
  filter_values: { days: 30 },
})
for (const panel of results) {
  if (panel.error) console.warn(panel.panel_id, panel.error)
}
```

### Tool catalog and client config

```typescript
// Built-in world and surface tools, read live from the agent engine
const { tools } = await client.tools.listCatalog()

// Platform values that are safe to embed in browser code
const { google_maps_api_key } = await client.clientConfig.get()
```

## Webhook Verification

Use the raw request body when verifying webhook deliveries. Timestamped signatures are replay-protected by default.

```typescript
import { parseWebhookEvent, WebhookVerificationError } from '@amigo-ai/platform-sdk'

const body = await request.text()

try {
  const event = await parseWebhookEvent({
    payload: body,
    signature: request.headers.get('x-amigo-signature') ?? '',
    timestamp: request.headers.get('x-amigo-timestamp') ?? undefined,
    secret: process.env.AMIGO_WEBHOOK_SECRET!,
  })

  console.log(event.type, event.data)
} catch (error) {
  if (error instanceof WebhookVerificationError) {
    console.error('Rejected webhook:', error.message)
  } else {
    throw error
  }
}
```

If your delivery channel only provides a legacy HMAC without a timestamp, the original helper signature still works:

```typescript
import { parseWebhookEvent } from '@amigo-ai/platform-sdk'

const event = await parseWebhookEvent(rawBody, signature, secret)
```

## BFF Proxy (Next.js)

For frontend apps that use a Backend-for-Frontend proxy:

```typescript
const client = new AmigoClient({
  apiKey: 'bff-proxy',
  workspaceId: 'ws-id',
  baseUrl: '/api/platform',
  fetch: customFetchWithCookies,
})
```

## Pagination

The SDK now exposes first-class async auto-pagination helpers on collection resources:

```typescript
import { AmigoClient } from '@amigo-ai/platform-sdk'

for await (const agent of client.agents.listAutoPaging({ limit: 100 })) {
  console.log(agent.name)
}

for await (const entity of client.world.listEntitiesAutoPaging({ limit: 100 })) {
  console.log(entity.display_name)
}
```

For custom pagination flows, the lower-level `paginate(...)` utility remains available.

## Error handling

All SDK errors extend `AmigoError`. Use type guards for specific handling:

```typescript
import {
  AmigoClient,
  AmigoError,
  isNotFoundError,
  isRateLimitError,
  isAuthenticationError,
} from '@amigo-ai/platform-sdk'

try {
  await client.agents.get('agent-id')
} catch (err) {
  if (isNotFoundError(err)) {
    console.log('Agent not found')
  } else if (isRateLimitError(err)) {
    console.log('Rate limited, retry after:', err.retryAfter, 'seconds')
  } else if (isAuthenticationError(err)) {
    console.log('Invalid API key')
  } else if (err instanceof AmigoError) {
    console.log('API error:', err.message, err.errorCode, err.requestId)
  }
}
```

Webhook verification errors are separate from API transport errors and throw `WebhookVerificationError`.

### Error classes

| Class                 | HTTP Status | Description                             |
| --------------------- | ----------- | --------------------------------------- |
| `BadRequestError`     | 400         | Malformed request                       |
| `AuthenticationError` | 401         | Invalid or expired API key              |
| `PermissionError`     | 403         | Insufficient permissions                |
| `NotFoundError`       | 404         | Resource does not exist                 |
| `ConflictError`       | 409         | Duplicate slug or version conflict      |
| `ValidationError`     | 422         | Request body validation failure         |
| `RateLimitError`      | 429         | Too many requests — check `.retryAfter` |
| `ServerError`         | 5xx         | Server-side error                       |
| `ConfigurationError`  | —           | SDK misconfiguration at init time       |
| `NetworkError`        | —           | Fetch/network failure                   |
| `RequestTimeoutError` | —           | Request exceeded the configured timeout |

## CommonJS (CJS) usage

```javascript
const { AmigoClient } = require('@amigo-ai/platform-sdk')
```

## License

MIT
