# Cross-repo tech debt audit — 2026-07-02

> Historical engineering review from July 2026. The use-case resource discussed here has since been retired. For current supported helpers and upgrade steps, use [api.md](../api.md) and the [current SDK migration guidance](https://docs.amigo.ai/api-reference/change-logs/sdk-ecosystem#september-2026-compatibility-releases).

Scope: `agent-forge-go`, `amigo-platform-typescript-sdk`, and `developer-console` on isolated feature-branch worktrees based on `origin/main`.

## What was checked

- SDK resource coverage against generated `openapi.json` paths used by developer-console.
- Large files and generated/manual boundaries.
- Public API docs and package validation for the cleanup in this branch.

## Findings relevant to the TypeScript SDK

1. **Console wrappers still bypass the SDK where resources are missing or partial.** `developer-console` has an explicit rule that the SDK is the platform-api contract, but its raw-client exception list still contains several domains. The audit found `use-cases` as a small, bounded gap with generated OpenAPI types already present.
2. **Cleanup implemented here:** added `client.useCases` with list, ownership get/assign/release, and service-binding get/bind/unbind methods, plus resource tests and API docs. This gives developer-console a migration target after the SDK release is published.
3. **Developer-console consumes an old SDK.** The console lockfile resolves `@amigo-ai/platform-sdk@0.57.0` while this SDK branch is `0.82.0`. Publishing and consuming current SDK releases should be treated as part of the contract burn-down, not as incidental dependency maintenance.
4. **Large manual modules are accumulating.** Generated `src/generated/api.ts` is expected to be large, but manual files like `src/index.ts`, `src/resources/events.ts`, `src/core/reconnecting-websocket.ts`, and `src/core/device-code.ts` are candidates for decomposition as they evolve.
5. **Public docs are part of the contract.** `api.md` changed after adding `useCases`; `docs:check` correctly caught that it needed regeneration.

## Cross-repo follow-ups

- Publish a new SDK release containing `client.useCases`; in developer-console, first bump from the stale `0.57.0` lockfile resolution to a current SDK release, then migrate `src/lib/platform-client/use-cases.ts` from raw `platformClient` calls to `getSDKClient(...).useCases`.
- Continue burning down console raw-client wrappers by adding missing SDK methods first, then moving console wrappers one module at a time.
- Consider an automated coverage report comparing SDK resources, console wrappers, and OpenAPI paths.

## Uncertainties

- Some console raw-client modules are intentional because they need special BFF timeout/proxy behavior. Those should migrate only after the SDK has equivalent request options and the console keeps the BFF behavior.
- This audit did not validate every SDK method against a live API; it focused on generated contract coverage and local tests.
