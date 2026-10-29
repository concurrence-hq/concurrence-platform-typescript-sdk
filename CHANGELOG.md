# Changelog

## [0.129.0] - 2026-10-29

### Maintenance

- sync API types from platform (6bbf7a97) (#503)

## [0.128.0] - 2026-10-28

### Features

- add typed group lifecycle bindings (ALL-2141) (#502)

### Documentation

- createOutbound names which statuses are safe to retry (ALL-765) (#501)

## [0.127.0] - 2026-10-27

### Maintenance

- sync API types from platform (5f5b0eb3) (#500)

## [0.126.0] - 2026-10-26

### Features

- a dynamicBehaviorSets resource and a one-pin helper on a service version set (ALL-2048) (#497)

### Documentation

- sync API descriptions from platform 4da0ac54 (ALL-2043) (#498)

### Maintenance

- sync API types from platform (ALL-2022)

## [0.125.0] - 2026-10-26

### Documentation

- execute throws ValidationError for SQL outside the allowlist (ALL-2043) (#495)

### Maintenance

- sync API types from platform (ba861ff2) (#496)

## [0.124.0] - 2026-10-26

### Features

- add generic credential expiry administration (ALL-2017) (#494)

## [0.123.0] - 2026-10-25

### Features

- TokenManager.signOut requests revocation and clears credentials (ALL-1912) (#482)

### Maintenance

- a staging host in a README, doc comment, example or generated type fails the build (ALL-2006) (#493)

## [0.122.1] - 2026-10-25

### Documentation

- the baseUrl docs no longer name a staging host (ALL-2006) (#490)

## [0.122.0] - 2026-10-25

### Maintenance

- sync API types from platform (32222915) (#492)

## [0.121.1] - 2026-10-25

### Bug Fixes

- preserve opaque list cursors in request types (#491)

## [0.121.0] - 2026-10-25

### Features

- expose lifecycle status and scheduling bindings (ALL-2015) (#489)

## [0.120.0] - 2026-10-25

### Features

- add workspace SSO administration resources (ALL-2012) (#488)

## [0.119.0] - 2026-10-25

### Features

- add typed staging clone resources (ALL-1951) (#487)

## [0.118.0] - 2026-10-24

### Maintenance

- sync API types from platform (73bf5263) (#485)

## [0.117.0] - 2026-10-24

### Maintenance

- sync API types from platform (1502142a) (#484)

## [0.116.0] - 2026-10-23

### Features

- add authorTurn for staging a non-voice operator reply (#480)

### Maintenance

- sync API types from platform (606d2230) (#481)

## [0.115.0] - 2026-10-18

### Documentation

- fix the data sources example for the 0.112.0 API (#473)

### Maintenance

- sync API types from platform (0425d7e7) (#476)

## [0.114.1] - 2026-10-14

### Bug Fixes

- yield artifact, state_transition and state events from streamTurn (#465)

## [0.114.0] - 2026-10-14

### Maintenance

- sync API types from platform (7f971c28) (#474)

## [0.113.1] - 2026-10-14

### Bug Fixes

- default to the concurrence hosts; api.platform.amigo.ai no longer resolves (#475)

## [0.113.0] - 2026-10-13

### Features

- wrap cases, suites, suite runs, benchmarks and the path step (#469)

## [0.112.0] - 2026-10-13

### Features

- wrap intake, dashboards and the other routes the console calls raw (#471)

### Improvements

- fix!: remove SDK wrappers for routes platform-api no longer serves (#470)

### Bug Fixes

- listLatest takes filters; wrap production evals, eval quality and voice judge (#468)
- take run filter values from the generated spec (#467)

## [0.111.0] - 2026-10-12

### Improvements

- fix!: sync SDK types to platform main (b126798e) (#466)

## [0.110.0] - 2026-10-03

### Features

- expose service filters in the SDK (#463)

### Maintenance

- add ccrowley96 as SDK code owner (#464)

## [0.109.1] - 2026-09-30

### Bug Fixes

- align npm repository metadata with renamed SDK repository (#462)

## [0.109.0] - 2026-09-30

### Improvements

- fix!: sync SDK types to platform main + remove post-call accuracy fields (#458)
- fix!: sync SDK types to platform main (bbfd1e26) (#456)

## [0.108.1] - 2026-09-08

### Security

- refresh secure tooling and public contributor setup (#455)

### Maintenance

- recover tagged releases through trusted publishing (#453)

## [0.108.0] - 2026-09-08

### Improvements

- fix!: sync SDK types to platform main (f04e5c7b7) (#450)

### Bug Fixes

- match fleet status to the supported voice-only contract (#451)

### Maintenance

- remove the automated PR reviewer (#449)

## [0.107.0] - 2026-08-11

### Improvements

- fix!: sync SDK types to platform main (b765cecc) (#448)

## [0.106.0] - 2026-08-07

### Improvements

- fix!: sync SDK types to platform main (290a81fc) (#446)
- Update CODEOWNERS (#447)

### Bug Fixes

- drop SDK wrappers for retired intake-link and environment-settings endpoints (#445)

## [0.105.0] - 2026-08-04

### Improvements

- fix!: unbreak SDK type sync — retire the billing resource (#444)

## [0.104.0] - 2026-07-28

### Bug Fixes

- unbreak SDK type sync (JsonValue codegen, retire use-cases, reconcile audit + external-integrations) (#443)

## [0.103.0] - 2026-07-19

### Maintenance

- sync SDK to post-consolidation openapi (drop gpt_live/openai_realtime/turn_runtime) (#441)
- move CI reviewers to Claude Fable 5 (#440)

## [0.102.1] - 2026-07-15

### Improvements

- Expose framework runtime labels (#438)

## [0.102.0] - 2026-07-14

### Maintenance

- sync openapi + drop wrappers for removed platform endpoints (#437)

## [0.101.0] - 2026-07-13

### Features

- RunsResource — SDK surface for the unified run backbone (#434)

## [0.100.0] - 2026-07-13

### Maintenance

- sync API types from platform (a95c19c4) (#433)

## [0.99.0] - 2026-07-13

### Maintenance

- sync API types from platform (93d6187f)

## [0.98.1] - 2026-07-13

### Bug Fixes

- return uploads as binary blobs (#431)

## [0.98.0] - 2026-07-11

### Features

- add promoteSession + sync spec (#424)

## [Unreleased]

### Features

- `simulations.promoteSession(sessionId)` — typed wrapper for `POST /simulations/sessions/{id}/promote`. Promotes a run-less (interactive playground) session into a coverage run so it can be forked/scored; idempotent (`already_bound: true` when the session already belongs to a run). Regenerates types with the new `promote-simulation-session` operation + `PromoteSessionResponse` schema.

### Fixes

- `intake.links.downloadUpload(linkId, uploadId)` now returns the endpoint's binary payload as a `Blob` instead of attempting JSON decoding. `intake.links.listUploads(linkId, params?)` also forwards `limit` and `offset` so consumers can page beyond the API's default 200 uploads.

## [0.97.0] - 2026-07-11

### Features

- add forkSession + scoreSession resource methods (#418)

## [0.96.0] - 2026-07-10

### Maintenance

- sync API types from platform (238b56b3) (#413)

## [0.95.0] - 2026-07-10

### Features

- expose is_active filter, fire input override, surface-analytics params (#412)

## [0.94.1] - 2026-07-10

### Maintenance

- lock in latest-model id passthrough; bump PR-review orchestrator to claude-opus-4-7 (#414)

## [0.94.0] - 2026-07-10

### Features

- gpt_live session provider (GPT-Live full-duplex family, dark) (#407)

### Improvements

- feat(voice)!: session_provider = model families (amigo | gpt_realtime | gpt_live) (#408)

## [0.93.0] - 2026-07-10

### Maintenance

- sync API types from platform (9f2a7948) (#405)

## [0.92.0] - 2026-07-10

### Features

- switchChannel wrapper + ChannelKind export + README fix (#403)

### Maintenance

- sync openapi with platform (drop correction_categories + retired review-queue) (#402)

## [0.91.0] - 2026-07-09

### Documentation

- add explicit migration block to 0.33.0 entry (#184)

### Maintenance

- sync API types from platform (d359e61a) (#400)

## [0.90.0] - 2026-07-08

### Maintenance

- sync API types from platform (9f39604d) (#401)

## [0.89.0] - 2026-07-07

### Maintenance

- sync API types from platform (e4fbdbf9) (#395)

## [0.88.0] - 2026-07-03

### Features

- agentRuns + agentDefinitions clients (frameworks layer) (#386)

## [0.87.0] - 2026-07-03

### Maintenance

- sync API types from platform (6dda4e01) (#385)

## [0.86.0] - 2026-07-02

### Maintenance

- sync API types from platform (0d7a0f02) (#383)

## [0.85.1] - 2026-07-02

### Features

- add use cases sdk resource (#380)

## [0.85.0] - 2026-07-02

### Maintenance

- sync API types from platform (c1ce82a3) (#379)

## [0.84.0] - 2026-07-02

### Maintenance

- sync API types from platform (a56c3ebd) (#375)

## [0.83.0] - 2026-07-01

### Features

- getFleetStatus — Agones fleet capacity (voice | tool-runner) (#374)

### Maintenance

- sync API types from platform (8ef6b2ba) (#373)
- alert on npm publish failure (publish.yml was silent) (#367)

## [0.82.0] - 2026-06-30

### Improvements

- feat(sdk)!: remove channels resource (client.channels.sesSetup) (#366)

## [0.81.0] - 2026-06-30

### Maintenance

- sync API types from platform (4aa80347) (#365)

## [0.80.0] - 2026-06-26

### Bug Fixes

- drop ses-setup list surface to match post-#4083 spec (#356)

### Maintenance

- sync API types from platform (a8de1d3e) (#357)

## [0.79.0] - 2026-06-26

### Bug Fixes

- reconnecting-websocket watchdog/terminal-code/rate-limit bugs + per-connect getProtocols (v0.79.0) (#355)

## [Unreleased]

<!--
Release versioning is owned by the Release workflow (.github/workflows/release.yml):
it bumps package.json and prepends a stamped `## [X.Y.Z] - DATE` entry generated from
commit history at release time. Do NOT hand-bump the version or hand-stamp a dated
entry in a feature PR. The notes below describe the changes awaiting the next release.
-->

### Breaking Changes

- **Removed the `channels` resource (`client.channels.sesSetup.*`).** The email-channel
  configuration surface (SES setup) was retired from platform-api, so the SDK no longer
  ships `ChannelsResource` / `SesSetupResource` or the `CreateSesSetupRequest`, `DnsRecord`,
  and `SesSetupDetail` types. The corresponding `/v1/{workspace_id}/channels/*` operations
  are gone from the generated types.

### Bug Fixes

- **Reconnecting WebSocket: idle watchdog no longer permanently kills the socket.** The idle watchdog previously force-closed with terminal code `4001`, which the reconnect loop treated as a non-retryable `client_error` — so the watchdog (whose entire purpose is to FORCE a reconnect) silently gave up instead. The watchdog now closes with a dedicated NON-terminal code `4099`, and the loop additionally checks `watchdogTriggered` before the terminal branch (defense-in-depth). Watchdog-driven reconnects surface a distinct `idle_watchdog` reason on `onReconnect`.
- **Reconnecting WebSocket: permanent server rejections fail fast.** Added the platform's permanent-rejection close codes `4004` (call/session not found) and `3003` (workspace mismatch) to the terminal set so they error immediately instead of looping the full reconnect budget (~12×). The terminal `onError` carries the originating `closeCode`.
- **Reconnecting WebSocket: rate-limit (`4029`) is now messageable.** Rate-limited closes (`4029` / `1013`) surface a `rate_limited` reason on `onReconnect` (in addition to the existing slow-backoff floor) so consumers can show "too many connections — retrying…"; when the retry budget is exhausted, the originating close code is forwarded to `onError`.

### Improvements

- **Reconnecting WebSocket: fresh subprotocols per (re)connect.** New optional `getProtocols?: () => string | string[] | Promise<...>` option, invoked on EACH (re)connect to mint fresh auth subprotocols (e.g. a refreshed bearer token) so a long-lived stream whose token expires mid-reconnect no longer replays a stale token into a 4403 loop. Falls back to the static `protocols` option when omitted — fully backward compatible. A transient `getProtocols` rejection is retried up to the reconnect budget rather than treated as terminal.
- Added `onReconnect` `reason` field (`idle_watchdog` | `rate_limited` | `transient`) and exported the `ReconnectingWebSocketReconnectReason` type.

## [0.78.1] - 2026-06-25

### Improvements

- Productize voice provider controls in SDK (#351)

## [0.78.0] - 2026-06-24

### Bug Fixes

- sync typed call-quality response + repair analytics test (#350)

## [0.77.0] - 2026-06-23

### Maintenance

- sync API types from platform (3931d218) (#348)

## [0.76.0] - 2026-06-22

### Maintenance

- sync API types from platform (f34b8e73) (#344)

## [0.75.0] - 2026-06-19

### Bug Fixes

- expose integration identity binding types (#340)

## [0.74.0] - 2026-06-18

### Maintenance

- sync API types from platform (efa08720) (#338)

## [0.73.0] - 2026-06-18

### Maintenance

- sync API types from platform (4dd6a5be) (#334)

## [0.72.0] - 2026-06-16

### Maintenance

- sync API types from platform (309bf1c8) (#331)

## [0.71.0] - 2026-06-15

### Maintenance

- sync API types from platform (b4049042) (#330)
- cover the surfaces + analytics.surfaces wrappers in the smoke test (#328)

## [0.70.0] - 2026-06-14

### Maintenance

- sync API types from platform (e3e8535c) (#326)

## [0.69.0] - 2026-06-12

### Features

- support include_tool_calls on conversations.get() (#320)

## [0.68.0] - 2026-06-12

### Maintenance

- sync API types from platform — drop removed memory resources + #3653 posture fields (#317)

## [0.67.0] - 2026-06-09

### Maintenance

- sync API types from platform (90344cb6) (#309)

## [0.66.0] - 2026-06-09

### Improvements

- Add external user session SDK support (#308)

## [0.65.0] - 2026-06-06

### Maintenance

- sync API types from platform (caa14f52) (#304)

## [0.64.0] - 2026-06-05

### Features

- poll option + pollTurn() for background tool results (#303)

### Maintenance

- sync API types from platform (230ae559) (#302)

## [0.63.0] - 2026-06-04

### Maintenance

- sync API types from platform (d285ad20)

## [0.62.1] - 2026-06-01

### Fixes

- `pickWorkspace` error message no longer tells callers to "pass workspaceId" (it's already required); it now accurately describes a server returning multiple workspaces despite a pinned workspace.
- Device-code tests assert the real wire format (parse `workspace_id` from the request body instead of a vacuous substring match) and assert the specific multi-workspace error rather than any throw.

## [0.62.0] - 2026-06-01

### Breaking changes

- `loginWithDeviceCode` now **requires** `workspaceId`. Device login is workspace-specific: the device code is pinned to the workspace at issuance, the browser approver must hold a session scoped to it, and the CLI receives a workspace-scoped token directly.
- `onWorkspaceRequired` is now optional and deprecated. With `workspaceId` pinned it is never invoked; it survives only as a fallback for legacy/un-pinned device codes and will be removed in a future release.

## [0.61.1] - 2026-06-01

### Features

- add conversation state transitions (#285)

## [0.61.0] - 2026-05-29

### Maintenance

- No public SDK changes were recorded in this release.

## [0.60.0] - 2026-05-27

### Improvements

- Expose conversation detail turn metadata (#276)

## [0.59.0] - 2026-05-27

### Improvements

- Update SDK OpenAPI schema (#274)

## [0.58.0] - 2026-05-26

### Breaking Changes

- **Integrations: auth-shape collapse.** The six legacy REST auth variants
  (`api_key_header`, `bearer_token`, `oauth2_client_credentials`,
  `oauth2_jwt_bearer`, `gcp_wif`, `bearer_token_exchange`) have been collapsed
  to four (`static_header`, `oauth2_client_credentials`, `oauth2_jwt_bearer`,
  `custom_token_exchange`). Per-type SSM path fields are gone in favor of a
  single `secret_value` field on create/update that the platform provisions
  to a unified SSM path. `oauth2_client_credentials` now requires
  `client_auth_method` (`"basic" | "body"`). `oauth2_jwt_bearer` drops
  `client_id`, renames `token_lifetime_seconds` → `assertion_lifetime_seconds`,
  adds `assertion_algorithm`/`include_iat`/`include_jti`, and folds
  `gcp_scopes` into `extra_claims`. `bearer_token_exchange` is replaced by
  `custom_token_exchange` with RFC 6901-pointer-based static/param fields.

- **Integrations: endpoint sub-resource.** Endpoints are no longer embedded
  in the integration response — `RestIntegrationResponse` exposes
  `endpoint_count` instead of `endpoints[]`. New CRUD methods on
  `IntegrationsResource`: `listEndpoints`, `listEndpointsAutoPaging`,
  `getEndpoint`, `createEndpoint`, `updateEndpoint`, `deleteEndpoint`.

- **`testEndpoint` identifies endpoints by UUID, not name.**
  `client.integrations.testEndpoint(integrationId, endpointId, body)` now
  takes the endpoint `id` (UUID). Callers passing the human-readable
  endpoint `name` will hit 404.

- **`integrations.update` is now PATCH.** Was `PUT` under the hood; this is
  invisible at the JS API boundary but worth noting if you were relying on
  the wire-level method.

- **Removed `client.integrations.testConnection` and `getHealthCheck`.** The
  underlying `POST /test-connection` and `GET /health-check` endpoints were
  removed from the platform API.

### New types

- `IntegrationEndpointId` branded type + `integrationEndpointId(id)`
  constructor.

### Maintenance

- Sync API types from platform (operation-IDs snapshot updated: adds the new
  integration-endpoint operations, drops `integration-health-check`, picks up
  unrelated simulation-suite + simulation-case rename churn).

## [0.57.0] - 2026-05-20

### Maintenance

- sync API types from platform

## [0.56.0] - 2026-05-14

### Improvements

- Remove personas API surface

## [Unreleased]

### Breaking Changes

- Remove the standalone personas API surface. This drops `client.personas`,
  `PersonasResource`, `PersonaId`, and service `persona_id` / `persona_name`
  fields in coordination with platform PR #2980. Simulation scenario persona
  payloads are unchanged. Cut this as at least a minor pre-1.0 release
  (`0.56.0` or later); publishing it as `0.55.x` would be a breaking patch.

## [0.55.0] - 2026-05-14

### Maintenance

- remove CRM SDK resource (#250)

## [0.54.0] - 2026-05-14

### Improvements

- Remove retired safety and unification resources (#249)

## [0.53.0] - 2026-05-14

### Maintenance

- sync API types from platform (6d39b2e1)

## [0.52.0] - 2026-05-14

### Improvements

- Update generated operation snapshots (#247)
- Regenerate SDK without voiceprint settings (#246)

## [0.51.0] - 2026-05-14

### Improvements

- Remove Superscribe SDK surface (#245)

## [0.49.0] - 2026-05-10

### Maintenance

- sync API types from platform (f49b8311) (#239)

## [0.48.4] - 2026-05-10

### Features

- add order param to listEntities, remove deprecated semantic/tags (#233)

### Maintenance

- sync API types from platform (d4bf31ab) (#234)
- sync API types from platform (3e7c46cb) (#235)

## [0.48.3] - 2026-05-09

### Maintenance

- No public SDK changes were recorded in this release.

## [0.48.2] - 2026-05-09

### Bug Fixes

- update surface example channel from 'sms' to 'web' (#232)

### Maintenance

- sync API types from platform (596cb6c0) (#231)

## [0.48.1] - 2026-05-08

### Maintenance

- sync API types from platform (95949c90) (#221)

## [0.48.0] - 2026-05-08

### Maintenance

- sync API types from platform (c727beb1) (#219)

## [0.47.1] - 2026-05-07

### Features

- add WorkspaceDatabaseResource (#209)

## [0.47.0] - 2026-05-07

### Maintenance

- sync API types from platform (2ee68069) (#207)

## [0.46.0] - 2026-05-06

### Maintenance

- sync API types from platform (#2612 ENG-229)

## [0.45.0] - 2026-05-06

### Bug Fixes

- sync API types from platform (63b80002) + add lifecycle fixtures (#198)

## [0.44.0] - 2026-05-05

### Features

- sync TestInvokeResponse from platform; tighten testV2 return type (#200)

### Maintenance

- improve SesSetupListResponse guard error message (#199)

## [0.43.0] - 2026-05-05

### Bug Fixes

- wire ChannelsResource instantiation in AmigoClient (#197)

## [0.42.0] - 2026-05-05

### Features

- `client.channels.sesSetup` — workspace-scoped CRUD over the channel-manager-backed SES setup proxy (`/v1/{workspace_id}/channels/ses-setup`). Methods: `create`, `list` + `listAutoPaging`, `get`, `verify`, `delete`. Workspace is injected at client construction time, not the call site. Closes the "no SDK surface for SES tenant onboarding" gap (amigo-ai/platform#2561). Types: `CreateSesSetupRequest`, `SesSetupDetail`, `SesSetupListItem`, `SesSetupListResponse`, `DnsRecord`.

## [0.41.0] - 2026-05-05

### Features

- client.promptLogs resource (list + auto-paging) (#196)

## [0.40.0] - 2026-05-05

### Maintenance

- sync API types from platform (30ae0891) (#195)

## [0.39.0] - 2026-05-05

### Features

- client.functions.listRegistered() (v0.38.0) (#194)

### Maintenance

- sync API types from platform (#2581 ENG-222 follow-up)

## [0.38.0] - 2026-05-05

### Features

- `client.functions(ws).listRegistered()` — list every V109-registered platform function in the workspace (latest version per name). Closes the "name-driven only" gap on the developer-console Functions Studio (amigo-ai/platform#2585).

### Maintenance

- sync API types from platform: 396→397 paths picking up `GET /v1/{ws}/functions/registered` and the bounded `InvokeRequest.input` (max 32 keys).

## [0.37.0] - 2026-05-05

### Features

- client.functions V109 surface — deploy/invoke/promote/rollback (v0.36.0) (#190)

## [0.36.0] - 2026-05-05

### Features

- `client.functions(ws).deploy/listVersions/getVersion/invoke/testV2/promote/rollback` — typed surface over the V109 SQL-first platform-functions routes (amigo-ai/platform#2552, #2562, #2567).

### Maintenance

- sync API types from platform (V109 substrate)

## [0.34.0] - 2026-05-05

### Features

- sync TextStreamFrame typed union from platform-api (#181)

## [0.33.0] - 2026-05-04

### ⚠️ Type-level breaking changes

The `ObserverSSEEvent.ToolCallStartedEvent` and `ObserverSSEEvent.ToolCallCompletedEvent` shapes were tightened to match what agent-engine actually emits on the wire (closes the drift documented in [amigo-ai/platform#2535](https://github.com/amigo-ai/platform/pull/2535)). The wire format never carried the old field names, so this is **type-only breaking** — runtime traffic is unchanged. But TypeScript consumers who read the renamed fields will see compile errors after upgrading.

| Event                    | Before (0.32.0)                                | After (0.33.0)                             |
| ------------------------ | ---------------------------------------------- | ------------------------------------------ |
| `ToolCallStartedEvent`   | `tool_input?: Record<string, unknown> \| null` | `input?: Record<string, unknown> \| null`  |
| `ToolCallStartedEvent`   | `call_id?: string \| null`                     | `call_id: string` (now required + bounded) |
| `ToolCallStartedEvent`   | `tool_name: string`                            | `tool_name: string` (max 256)              |
| `ToolCallCompletedEvent` | `error?: string \| null`                       | `error_message?: string \| null`           |
| `ToolCallCompletedEvent` | `call_id?: string \| null`                     | `call_id: string` (now required + bounded) |
| `ToolCallCompletedEvent` | `tool_name: string`                            | `tool_name: string` (max 256)              |

New optional metadata fields on both events: `parent_call_id`, `integration_name`, `endpoint_name`, `protocol`. These are additive — existing readers ignore them.

#### Migration

**Find every callsite** with grep:

```bash
# old field names that need renaming
rg -n '\.tool_input\b' src/      # ToolCallStartedEvent.tool_input → .input
rg -n '\bevent\.error\b'  src/   # ToolCallCompletedEvent.error → .error_message
rg -n 'ToolCall(Started|Completed)Event' src/   # all consumers of the shapes
```

**Codemod (sed)** — only safe if your repo doesn't reuse `tool_input` / `event.error` for unrelated objects. Review the diff before committing:

```bash
# rename ToolCallStartedEvent.tool_input → .input
git ls-files '*.ts' '*.tsx' | xargs sed -i.bak -E \
    's/(\.|: ?)tool_input\b/\1input/g'

# rename ToolCallCompletedEvent.error → .error_message (specific to event.error)
git ls-files '*.ts' '*.tsx' | xargs sed -i.bak -E \
    's/\b(toolCall|completedEvent|tool_call_completed|event)\.error\b/\1.error_message/g'

# delete the .bak backups after diffing
find . -name '*.ts.bak' -o -name '*.tsx.bak' | xargs rm
```

For developer-console specifically, this rename was applied in [amigo-ai/developer-console#864](https://github.com/amigo-ai/developer-console/pull/864) — drop the local `ObserverEventEnvelope<T, Extra>` shim and consume the SDK type directly.

### Features

- tighten ObserverSSEEvent tool_call schemas (#176)

## [0.32.0] - 2026-05-04

### Maintenance

- sync API types from platform (4ca8f1c0) (#174)
- sync API types from platform (d97d37c8) (#167)
- sync API types from platform (d97d37c8) (#167)

## [0.31.0] - 2026-05-04

### Features

- streamTurn targets explicit /turns/stream endpoint (0.30.0) (#168)

## [0.30.0] - 2026-05-04

### Features

- **`client.conversations.streamTurn` + `createTurnStream` now target the always-SSE endpoint** — `POST /v1/{ws}/conversations/{id}/turns/stream` (added in platform-api PR #2499). The Accept-sniffing variant of `POST /turns` still works against older platform-api versions, but the SDK now hits the explicit endpoint so the response is unambiguously SSE without header negotiation. Wire format and the `TurnStreamEvent` discriminated union are unchanged — consumer code does not need to change.

### Maintenance

- sync API types from platform — adds `POST /v1/{workspace_id}/conversations/{conversation_id}/turns/stream` (op `create_turn_stream_v1__workspace_id__conversations__conversation_id__turns_stream_post`).

## [0.29.0] - 2026-05-03

### Features

- client.me.createWorkspace; remove legacy createSelfService (0.28.0) (#165)

## [0.28.0] - 2026-05-03

### ⚠️ Breaking changes

- **Removed `client.workspaces.createSelfService()`** — the underlying route `POST /v1/workspaces/self-service` was deleted in platform-api PR #2472. Migrate to **`client.me.createWorkspace(body)`** which calls the new `POST /v1/me/workspaces` endpoint. Request body and response shape are unchanged; only the URL moved.

  Why: the legacy URL nested an account-scoped operation under `/v1/workspaces/<x>` — the developer-console BFF proxy parsed the literal `self-service` as a workspace_id and sent identity a JWT-refresh request scoped to that string, which 4xx'd before the call ever reached platform-api. Lifting the route to `/v1/me/...` (already in the BFF's global-segment allowlist) makes the failure mode structurally impossible. A platform-api hygiene test now blocks any future literal segment under `/v1/workspaces/`.

  Datadog confirmed zero successful traffic on the legacy route in the 7 days before removal — no production callers exist.

### Features

- **`client.me`** — new `MeResource` for account-scoped operations on the authenticated identity. Initial method: `createWorkspace(body)` (replaces `client.workspaces.createSelfService`).

### Maintenance

- sync API types from platform (`edac384e3`) — `/v1/me/workspaces` (POST, op `create-my-workspace`, tag `Account`) added; `/v1/workspaces/self-service` removed.

### ⚠️ Breaking changes (type-level): call-intelligence response shapes

**SDK consumers using `tsc` as a compatibility gate must read this section** — the field removals below are non-breaking at _runtime_ (the producer never populated these fields; consumers always got `None`/`0`/`[]`) but they ARE breaking at _compile_ time: code that references the removed names will fail type-checking against `@amigo-ai/platform-sdk@^0.28.0`.

Picked up from platform-api PR 3b of the call-intelligence typed-cols program (commit `831f0e8ff`, "V091 Pydantic response alignment to producer keys"). The historical Pydantic shapes declared fields the producer never actually emitted — they were silently dropped by `extra="ignore"` and SDK consumers always saw `None` / `0` / `[]` for these fields. The renames + drops align the response shape to producer truth.

Removed fields (the SDK type for these no longer compiles; consumers reading them get `undefined` at runtime today regardless):

- `EmotionSummary.avg_valence` → use **`average_valence`**
- `EmotionSummary.caller_distress_detected` (removed; never populated)
- `EmotionSummary.emotion_shifts` (removed; never populated)
- `RiskSummary.flags` (removed; never populated)
- `SafetySummary.categories` (removed; never populated)
- `ConversationSummary.topic_changes` (removed; never populated)
- `ConversationSummary.avg_turn_duration_seconds` (removed; never populated)
- `LatencySummary.total_silence_seconds` (removed; never populated)
- `OperatorIntelligenceSummary.operator_handle_time_seconds` (removed; never populated)

If your code references any of the above, replace with the renamed field where applicable; for the removed fields, either drop the read or compute the value yourself from the underlying call data.

Type-bound additions to existing fields (non-breaking; tightening `string` schemas to `PhoneE164` / bounded-length strings):

- `phone_number` fields now refer to `PhoneE164` instead of bare `string`.
- Multiple `string` fields gained `maxLength` / `minLength` constraints (e.g. `email_id`, `entity_types`, `sync_schedule`, `skills` items). Existing valid inputs continue to compile; the SDK now rejects strings that exceed the documented bounds at type-check time.

## [0.27.0] - 2026-05-03

### Security

- close dev-console gaps with 16 typed resources + spec-sync rolling PR (#155)

### Documentation

- document realtime event streams (subscribeToWorkspace, observers, ReconnectingWebSocket) (#156)

## [0.26.0] - 2026-05-02

### Maintenance

- sync API types from platform (dc8c9ee1) (#154)

## [0.25.0] - 2026-05-01

### Features

- **Typed error bodies** — `AmigoError` now carries a discriminated `errorBody` (`HttpExceptionBody | HttpValidationErrorBody | UnparseableErrorBody`) plus a verbatim `rawBody` (truncated to 8 KB). New body type guards — `isHttpException`, `isHttpValidationError`, `isUnparseableErrorBody` — let consumers narrow the union without `any`/`unknown` casts. Status-class type guards added: `isPermissionError`, `isConflictError`, `isValidationError`, `isServerError`, `isNetworkError`. Backward compat preserved: existing `err.message` / `err.detail` / `err.errorCode` / `err.requestId` and the legacy `ParseError.body: string` still work unchanged.
- **`createApiError` parse-failure handling hardened** — body reads no longer throw on malformed JSON, empty bodies, or connection-drop mid-read. The factory always returns an `AmigoError` subclass; the unparseable fallback puts the verbatim text on `errorBody.raw_body` for diagnostics.
- **`client.defineRoute(method, path)` path helper** — captures a path literal at definition time, returning a fully-typed callable that survives reassignment, export, and composition across modules. Solves the CLAUDE.md "explicit `as const` on path params" footgun by making the literal-path constraint structural at the call site, with full request/response inference. Workspace IDs continue to be auto-injected; runtime behavior is identical to calling the matching `client.GET/POST/PUT/...` directly.

## [0.24.0] - 2026-05-01

### Features

- Add `client.events.subscribeToWorkspace()` — typed SSE consumer for `WorkspaceSSEEvent`. Wraps `GET /v1/{workspace_id}/events/stream` with automatic reconnect (exponential backoff with full jitter, honoring server-sent `retry:` directives), gapless replay via `Last-Event-ID`, and discriminated-union dispatch (no `any`/`unknown` casts at the consumer). Honors `AbortSignal` for cleanup. Drift-tolerant: malformed or unknown frames are dropped silently. Observer WebSocket helper deferred — see follow-up issue.

## [0.23.0] - 2026-05-01

### Improvements

- Add streamTurn async iterator (typed TurnStreamEvent stream) (#144)

## [0.22.0] - 2026-05-01

### Improvements

- Add includeToolCalls option to ConversationsResource.createTurn (#143)

## [0.21.0] - 2026-05-01

### Features

- add sessionConnectUrl helper for /v1/{ws}/sessions/connect (v0.20.0)

### Maintenance

- sync API types from platform (2c9cf6d9) (#142)
- sync API types from platform (74bd55d2) (#141)

## [0.19.0] - 2026-05-01

### Features

- add TurnStreamEvent types + createTurnStream (v0.18.0) (#140)

## [0.17.2] - 2026-04-29

### Features

- add agentBaseUrl for split-host WebSocket connections

### Bug Fixes

- add clxxa to CODEOWNERS (#124)

### Documentation

- regenerate api.md for agentBaseUrl

## [0.17.1] - 2026-04-29

### Features

- sync API types from platform — add TurnResponse.tool_calls

### Bug Fixes

- clean up text-chat-app proxy and frontend
- make text-chat example interactive instead of one-shot
- use token query param auth (not dual), respect AMIGO_BASE_URL

## [0.17.0] - 2026-04-28

### Features

- add toolEvents SDK param and text-chat reference app
- add text chat reference example and guide (#123)

### Bug Fixes

- add @types/ws dev dependency for example typechecking

## [0.16.0] - 2026-04-28

### Features

- sync API types from platform 90bb35099

### Documentation

- add device code authentication docs and example (#121)

## [0.15.1] - 2026-04-28

### Bug Fixes

- address PR #118 review feedback
- correct device code default identity URL to api.platform.amigo.ai (#119)

## [0.15.0] - 2026-04-28

### Maintenance

- sync API types from platform d42476352

## [0.14.0] - 2026-04-28

### Features

- add text conversation resource (#115)

## [0.13.0] - 2026-04-28

### Maintenance

- sync API types from platform ac4311cb

## [0.12.0] - 2026-04-28

### Maintenance

- sync API types from platform d8a47d66

## [0.11.3] - 2026-04-28

### Maintenance

- No public SDK changes were recorded in this release.

## [0.11.2] - 2026-04-28

### Maintenance

- No public SDK changes were recorded in this release.

## [0.11.1] - 2026-04-28

### Bug Fixes

- handle bootstrap token with workspaceId + add /self/profile path
- handle bootstrap token in device code flow

## [0.11.0] - 2026-04-28

### Features

- device code login for desktop and CLI apps (#112)

## [0.10.0] - 2026-04-27

### Bug Fixes

- harden release test workflow lookup

### Maintenance

- sync API types from platform (d02115a1)

## [0.9.3] - 2026-04-27

### Features

- publish scribe clinical settings in sdk (#99)

### Improvements

- Sync platform API types

## [0.9.1] - 2026-04-27

### Improvements

- Add typed `client.calls.getTimeline(callId)` for the canonical call playback timeline endpoint.

## [0.9.0] - 2026-04-27

### Maintenance

- sync API types from platform call timeline

## [0.8.0] - 2026-04-27

### Improvements

- Expose call timeline actor types (#89)

## [0.7.0] - 2026-04-26

### Improvements

- Add metrics resource (#85)
- Harden release publish visibility check (#84)

## Unreleased

### Breaking Changes

- Metric values now use the exported `MetricValue` discriminated union
  (`numerical`, `categorical`, or `boolean`) generated from the platform
  OpenAPI schema. The previous generated `MetricValueResponse` schema has been
  replaced by value-type-specific schemas. A deprecated top-level
  `MetricValueResponse` compatibility alias remains available from the SDK
  entrypoint.

```ts
if (metric.metric_type === 'numerical') {
  const value: number | null = metric.value
}
```

### Features

- Add `client.metrics` for metric catalogs, latest values, metric history, and
  metric trends.

## [0.6.1] - 2026-04-26

### Improvements

- harden SDK packaging and release automation (#82)

## [0.6.0] - 2026-04-26

### Bug Fixes

- update test fixture for call_duration_seconds rename

### Maintenance

- sync API types from platform (54356672)

## [0.5.10] - 2026-04-25

### Maintenance

- sync API types from platform (f799a6ce) (#73)

## [0.5.9] - 2026-04-25

### Maintenance

- sync API types from platform (6c4d5d8f) (#70)

## [0.5.8] - 2026-04-25

### Maintenance

- sync API types from platform (20f0d9db) (#68)

## [0.5.6] - 2026-04-25

### Maintenance

- sync API types from platform (009bf9cd) (#66)

## [0.5.5] - 2026-04-24

### Maintenance

- sync API types from platform (81ea5e71) (#65)

## [0.5.4] - 2026-04-24

### Maintenance

- sync API types from platform (fb8530c8) (#59)
- sync API types from platform — webhook hardening (PR #1852) (#56)

## [0.5.3] - 2026-04-24

### Features

- add provision, checkEnvironment, convertEnvironment methods (#54)

### Documentation

- add build-a-form and build-a-scribe developer guides

## [0.5.2] - 2026-04-23

### Bug Fixes

- expose api field type for path-level inference in GET/POST/PUT

### Documentation

- regenerate api.md after exposing api field

## [0.5.1] - 2026-04-23

### Maintenance

- sync openapi spec from platform (356 paths, 617 schemas)

## [0.5.0] - 2026-04-22

### Features

- add triggerSync resource method (#45)

### Bug Fixes

- prefix tarball path with ./ so npm treats it as a file, not a package name (#37)
- write .npmrc explicitly for npm publish (setup-node breaks tarball resolution) (#36)
- drop --provenance from npm publish (causes git ls-remote on tarball) (#35)

### Maintenance

- sync API types from platform (04db1b94) (#44)
- sync API types — intake upload links (#38)
- sync API types — dashboard definitions endpoints (#34)

## [0.4.5] - 2026-04-19

### Bug Fixes

- restore README platform svg (#17)

## [0.4.4] - 2026-04-19

### Features

- refresh README platform context and release hardening (#16)

### Security

- Polish the public repo surface and close security findings

### Improvements

- Stabilize Node 18 retry handling and refine the README platform graphic (#15)

### Maintenance

- Refresh generated SDK types from the committed Platform API spec

This changelog tracks notable user-facing changes to the published SDK. Entries stay focused on package behavior, developer experience, and release hardening rather than internal branch noise.

## [0.4.3] - 2026-04-19

### Improvements

- Extend request overrides across the ergonomic resource surface with `withOptions(...)`
- Preserve required non-workspace path parameters in low-level request helpers
- Generate and validate `api.md` in CI
- Validate Node 18, 20, and 22 along with packed tarball installs

## [0.4.2] - 2026-04-19

### Features

- Add advanced request controls, typed low-level HTTP helpers, and response metadata
- Document the advanced surface with repo-local examples and an API surface guide

## [0.4.1] - 2026-04-19

### Improvements

- Add repo-local examples and validate them in CI
- Add ESM and CommonJS dist validation before release
- Align README examples with the shipped client surface

## [0.4.0] - 2026-04-19

### Security

- Harden release automation, spec sync, and package verification for published builds

## [0.3.0] - 2026-04-19

### Improvements

- Add public repo governance and contributor standards
- Add coverage reporting and tighten repo QA checks
- Refresh README presentation and align terminology with the shipped actions surface

### Maintenance

- Stabilize local toolchain defaults and native dependency resolution

## [0.2.1] - 2026-04-19

### Features

- Expand customer-facing resource coverage and align types to the validated Platform API surface
- Rebuild the client on generated OpenAPI types with typed request middleware and custom fetch support
- Add structured error context, serialization helpers, and webhook verification utilities
- Mature the release process with spec sync, changelog generation, and integration test scaffolding

### Bug Fixes

- Align resources, request signatures, and generated types with the validated API surface
- Fix workflow reuse and publish configuration edge cases discovered during release automation

### Documentation

- Expand README coverage for the public resource surface and BFF proxy configuration

### Maintenance

- Tighten package metadata, generated types, and release packaging
