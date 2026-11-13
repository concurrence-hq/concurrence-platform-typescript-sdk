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
platform/services/platform-api/openapi.json  (committed, CI-checked)
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
    errors.ts           -- Error hierarchy (AmigoError base), error factory, error middleware
    retry.ts            -- Exponential backoff with jitter, Retry-After header support
    openapi-client.ts   -- Creates openapi-fetch Client with auth + error + retry middleware
    utils.ts            -- Response helpers
    branded-types.ts    -- Branded type aliases (WorkspaceId, AgentId, ActionId, etc.)
    rate-limit.ts       -- RateLimitInfo type, parseRateLimitHeaders()
    webhooks.ts         -- HMAC-SHA256 webhook verification, parseWebhookEvent()
  resources/
    actions.ts          -- Action (skill) CRUD and testing
    agents.ts           -- Agent CRUD and versioning
    analytics.ts        -- Call stats, event breakdown, data quality
    api-keys.ts         -- API key management
    tokens.ts           -- Exchange API key for identity-issued JWT (POST /token)
    audit.ts            -- Audit log queries
    calls.ts            -- Call list, detail, intelligence, trace analysis
    context-graphs.ts   -- Context graph (HSM) CRUD and versioning
    data-sources.ts     -- Connected data source management
    integrations.ts     -- Integration CRUD, endpoint testing, health check
    operators.ts        -- Operator CRUD, dashboard, queue, escalations, call actions
    recordings.ts       -- Call recording access
    services.ts         -- Service CRUD
    settings.ts         -- Workspace settings (voice, branding, outreach, security, retention, workflows)
    simulations.ts      -- Call simulation management
    triggers.ts         -- Trigger CRUD, fire, pause, resume, runs
    workspaces.ts       -- Workspace CRUD
    world.ts            -- World model entities, events, relationships
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
- **Vitest** -- Test runner with coverage thresholds (85% lines, 80% branches).
- **ESLint** -- Lint runs with `--max-warnings 0` (zero tolerance).
- **Skills rebranded to Actions** -- `client.actions.*` (API paths still `/skills/` for backward compat).

## Important Patterns

### Error Hierarchy

`AmigoError` is the base class. Subclasses map to HTTP status codes (e.g., `AuthenticationError` for 401, `NotFoundError` for 404, `RateLimitError` for 429). `createApiError()` maps response status to the right error class. `createErrorMiddleware()` plugs into openapi-fetch middleware.

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

Response field removal, rename, or type change breaks this SDK and all consumers (developer-console). Coordinate with `amigo-ai/platform` (spec change) and `amigo-ai/developer-console` (UI updates) before releasing a version with breaking type changes.

## Cross-Repo Contract

The SDK types are generated from the committed OpenAPI spec. When the spec changes upstream, the `spec-sync` workflow auto-opens a PR with regenerated types. Breaking changes are detected by `oasdiff` CI in the API repo.
