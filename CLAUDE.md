# @amigo-ai/platform-sdk

Official TypeScript SDK for the Amigo Platform API (`@amigo-ai/platform-sdk` on npm).

## Key Commands

| Task                                           | Command                |
| ---------------------------------------------- | ---------------------- |
| Build (generate types + bundle + declarations) | `npm run build`        |
| Run unit tests                                 | `npm test`             |
| Run all tests (unit + core + integration)      | `npx vitest run`       |
| Typecheck                                      | `npm run typecheck`    |
| Lint                                           | `npm run lint`         |
| Format check                                   | `npm run format`       |
| Format write                                   | `npm run format:write` |
| Generate types from OpenAPI spec               | `npm run gen-types`    |

The `build` script runs type generation, esbuild bundling, and `tsc` declaration emit in sequence.

## Architecture

```
platform-v2/services/platform-api/openapi.json  (public projection committed here as openapi.json, CI-checked)
       |  scripts/gen-types.mjs (openapi-typescript)
       v
src/generated/api.ts  (auto-generated -- DO NOT EDIT)
       |
       v
src/resources/*.ts  (typed resource classes using openapi-fetch client)
       |
       v
src/index.ts  (AmigoClient -- entry point, injects client into all resources)
```

```
src/
  index.ts              -- AmigoClient class, config validation, public re-exports
  core/
    auth.ts             -- API key auth middleware
    errors.ts           -- Error hierarchy (AmigoError base), error factory, is*Error guards
    retry.ts            -- Exponential backoff with jitter, Retry-After header support
    openapi-client.ts   -- Creates openapi-fetch Client with auth + error + retry middleware
    utils.ts            -- Response helpers
    device-code.ts      -- RFC 8628 device code login
    idempotency.ts      -- Idempotency key helper
    reconnecting-websocket.ts -- Reconnecting WebSocket primitive for realtime helpers
    request-options.ts  -- Per-request option types
    url.ts              -- URL helpers
    branded-types.ts    -- Branded type aliases (WorkspaceId, AgentId, ActionId, etc.)
    rate-limit.ts       -- RateLimitInfo type, parseRateLimitHeaders()
    webhooks.ts         -- HMAC-SHA256 webhook verification, parseWebhookEvent()
  resources/            -- One typed resource class per API area (list: `ls src/resources`)
    actions.ts, agent-runs.ts, agents.ts, analytics.ts, api-keys.ts, audit.ts, base.ts,
    billing.ts, briefs.ts, calls.ts, client-config.ts, command-center.ts, compliance.ts,
    context-graphs.ts, conversations.ts, dashboards.ts, data-query.ts, data-sources.ts,
    dynamic-behavior-sets.ts, events.ts, external-auth-claim-mappings.ts,
    external-identity-bindings.ts, external-integrations.ts, external-role-assignments.ts,
    external-roles.ts, fhir.ts, functions.ts, harnesses.ts, identity-credentials.ts,
    identity/base.ts, insights.ts, intake.ts, integrations.ts, m42.ts, me.ts,
    memory-dimensions.ts, metering.ts, metric-store.ts, metrics.ts, models.ts, network.ts,
    observers.ts, operation-grants.ts, operators.ts, pipeline.ts, production-evals.ts,
    prompt-logs.ts, recordings.ts, review-queue.ts, role-grants.ts, runs.ts,
    scheduling-rule-sets.ts, sensorium.ts, services.ts, sessions.ts, settings.ts,
    simulations.ts, skills.ts, sso-grants.ts, sso-group-grants.ts, sso-lifecycle.ts,
    staging-clones.ts, surfaces.ts, test-calls.ts, tokens.ts, tools.ts, traces.ts, triggers.ts,
    use-cases.ts, voice.ts, workspace-authentication.ts, workspace-data-queries.ts,
    workspace-tables.ts, workspaces.ts, world.ts
  generated/
    api.ts              -- Auto-generated OpenAPI types (DO NOT EDIT)
tests/
  core/                 -- Core utility tests (rate-limit, webhooks)
  integration/          -- Integration tests (require real API credentials)
  resources/            -- Per-resource unit tests
scripts/
  gen-types.mjs         -- OpenAPI -> TypeScript codegen with FastAPI path param patching
  build.mjs             -- esbuild bundler producing ESM (.mjs) and CJS (.cjs)
  generate-changelog.sh -- Conventional commit changelog generator
```

## Conventions

- **Strict TypeScript** -- `strict: true`, `noUncheckedIndexedAccess: true` in tsconfig.
- **Runtime dependencies** -- `openapi-fetch` and its aligned `openapi-typescript-helpers` range support the runtime and published declarations.
- **Dual ESM/CJS output** -- esbuild produces `dist/index.mjs` (ESM) and `dist/index.cjs` (CJS). Declarations go to `dist/types/`.
- **Vitest** -- Test runner with coverage thresholds (80% lines, 75% branches, 80% functions and statements).
- **ESLint** -- Lint runs with `--max-warnings 0` (zero tolerance).
- **Skills rebranded to Actions** -- `client.actions.*` (API paths still `/skills/` for backward compat).

## Important Patterns

### Error Hierarchy

`AmigoError` is the base class. Subclasses map to HTTP status codes (e.g., `AuthenticationError` for 401, `NotFoundError` for 404, `RateLimitError` for 429). `createApiError()` maps response status to the right error class. The inline error middleware in `createPlatformClient()` plugs into openapi-fetch middleware.

### Retry with Jitter

`createRetryingFetch()` wraps the global fetch with exponential backoff and jitter. It respects `Retry-After` headers and only retries idempotent methods (GET by default). POST requests only retry on 429 when a `Retry-After` header is present.

### Rate Limit Headers

`parseRateLimitHeaders(headers)` extracts `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` from response headers.

### Webhook Verification

`parseWebhookEvent(payload, signature, secret)` verifies HMAC-SHA256 signatures and parses webhook payloads. Uses Web Crypto API for cross-platform compatibility.

## Generated Code

Files in `src/generated/` are auto-generated from the platform-api OpenAPI spec. Do not edit them manually. Regenerate with:

```sh
npm run gen-types
```

The codegen script uses this repository's committed `openapi.json` by default. A sibling source checkout is optional; public builds require no private repository.

## Breaking Changes

Response field removal, rename, or type change breaks this SDK and all consumers (developer-console). Coordinate with `concurrence-hq/platform-v2` (spec change) and `concurrence-hq/developer-console` (UI updates) before releasing a version with breaking type changes.

## Cross-Repo Contract

The SDK types are generated from the committed OpenAPI spec. The `spec-sync` workflow starts on a manual run or a `spec-updated` dispatch (it has no schedule yet; one returns after a manual run on the served spec shows the expected result). It downloads the production Platform API's public spec and, when the projection differs from the committed one, prints the differing JSON pointers and auto-opens a PR with regenerated types. The served spec differs from the committed one beyond the internal operations it omits, so the projection restores the published compatibility operations and the schema properties the committed spec marks `x-internal` (a field the API newly marks internal never enters the SDK this way), drops name-only `tags` entries and rewrites `servers` (a url-only entry is replaced by the committed entry with the same URL, a new URL is kept after those, and a dropped URL is removed). That a run on an unchanged API reproduces the committed file is shown by a test on a fixture, not yet by a run on the served document. Breaking changes are detected by `oasdiff` CI in `concurrence-hq/platform-v2`.
