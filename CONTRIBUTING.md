# Contributing to Amigo Platform SDK

Thank you for your interest in contributing to the Amigo Platform SDK! This guide covers development setup, testing, code generation, and the release process.

## Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm ci
   ```

## Package.json Scripts Overview

### Build & Development

- **`npm run build`** — Full build: generate types → esbuild (ESM+CJS) → tsc declarations
- **`npm run typecheck`** — Run TypeScript compiler in check mode (`tsc --noEmit`)
- **`npm run gen-types`** — Regenerate TypeScript types from the OpenAPI spec

### Testing

- **`npm test`** — Run unit tests (Vitest)
- **`npm run test:dist`** — Verify the built ESM and CJS artifacts
- **`npm run typecheck:examples`** — Typecheck the repo-local SDK examples
- **`npx vitest run`** — Run all tests including core utilities
- **`npm run test:integration`** — Run integration tests (requires API credentials)

### Code Quality

- **`npm run lint`** — ESLint with zero warnings policy
- **`npm run format`** — Check formatting with Prettier
- **`npm run format:write`** — Auto-format with Prettier

### Dependency Upgrades

When upgrading `openapi-fetch`, keep the direct `openapi-typescript-helpers` dependency aligned with the range declared by `openapi-fetch`. The SDK's published declarations import both packages directly, and `npm run test:tarball` enforces the range coupling.

## Testing

This project uses **Vitest** as the testing framework.

### Test Structure

```
tests/
├── core/           # Core utility tests (rate-limit, webhooks)
├── dist/           # Built package compatibility tests (ESM + CJS)
├── integration/    # Integration tests (require real API credentials)
└── resources/      # Per-resource unit tests
```

### Running Tests

```bash
npm test                              # Unit tests (fast)
npm run test:dist                     # Dist compatibility tests (run after build)
npm run typecheck:examples            # Validate repo-local examples
npx vitest run                        # All tests
npm run test:integration     # Integration tests (needs env vars)
npx vitest run --coverage             # With coverage report
```

### Writing Tests

- Place resource tests in `tests/resources/`
- Use mock fetch for unit tests (no MSW needed — see existing tests for pattern)
- Integration tests skip automatically when `AMIGO_TEST_API_KEY` is not set

## OpenAPI Type Generation

Public builds use this repository's committed `openapi.json` snapshot. Contributors do not need access to another repository to build or test the SDK.

### How it Works

1. `scripts/gen-types.mjs` reads the committed `openapi.json` by default; an explicit `--spec` can select another permitted file
2. Patches FastAPI's spec to add missing path parameters (`workspace_id`, etc.)
3. Runs `openapi-typescript` to generate `src/generated/api.ts`
4. These types drive all SDK resource methods with full type safety

### Regenerating Types

```bash
npm run gen-types                                      # committed repository snapshot
npm run gen-types -- --spec path/to/openapi.json       # explicit file
```

**Never manually edit** files in `src/generated/` — they will be overwritten.

## Declaration Entrypoints

The build emits one TypeScript declaration graph and then creates a CJS entrypoint at `dist/types/index.d.cts`. Keep the internal relative `.js` specifiers intact: under TypeScript `NodeNext`, `.d.cts` selects the CommonJS declaration entrypoint while `.js` specifiers still match the emitted JavaScript filenames. `npm run test:tarball` verifies both ESM and CJS declaration resolution with `skipLibCheck: false`.

## Project Structure

```
src/
├── core/           # Auth, errors, retry, rate-limit, webhooks, branded types
├── generated/      # Auto-generated OpenAPI types (DO NOT EDIT)
├── resources/      # API resource classes (one per domain)
└── index.ts        # AmigoClient entry point, public exports

tests/
├── core/           # Core utility tests
├── integration/    # Integration tests (require credentials)
└── resources/      # Per-resource unit tests

scripts/
├── gen-types.mjs         # OpenAPI → TypeScript codegen
├── build.mjs             # esbuild bundler (ESM + CJS)
└── generate-changelog.sh # Conventional commit changelog generator
```

## Development Workflow

1. **Start**: `npm ci`
2. **Write code**: Edit `src/resources/` or `src/core/`
3. **Write tests**: Add tests in `tests/`
4. **Validate**: `npm run lint && npm run typecheck && npm run typecheck:examples && npm test && npm run build && npm run test:dist && npm run test:tarball`
5. **Submit PR**: See Pull Request Guidelines below

## Adding a New Resource

1. Ensure the platform-api endpoint exists and `openapi.json` has been regenerated
2. Check the generated types: `grep 'your-endpoint' src/generated/api.ts`
3. Create `src/resources/your-resource.ts` extending `WorkspaceScopedResource`
4. Use `this.client.GET/POST/PUT/DELETE` with typed path strings
5. Use `extractData(await this.client.METHOD(...))` for data-returning calls
6. Register in `src/index.ts` constructor
7. Add tests in `tests/resources/your-resource.test.ts`
8. Export types from `src/index.ts`

## Pull Request Guidelines

1. Ensure all tests pass: `npm test`
2. Ensure dist tests pass: `npm run test:dist`
3. Ensure examples stay valid: `npm run typecheck:examples`
4. Lint your code: `npm run lint`
5. Typecheck passes: `npm run typecheck`
6. Build succeeds: `npm run build`
7. Add tests for new functionality
8. Update README if adding new resources or features

## Release Process

Releases are handled by two GitHub Actions workflows:

1. `release.yml` verifies the latest Test workflow passed for the target commit
2. Regenerates types from the committed OpenAPI spec and fails on generated drift
3. Bumps the version (patch/minor/major)
4. Generates `CHANGELOG.md` entries from conventional commits
5. Runs the full prepublish verification suite and packs the package
6. Pushes the version commit and annotated `v*` tag
7. Creates the GitHub Release with release notes and the tarball artifact
8. The GitHub Release `published` event triggers `publish.yml` from the immutable release tag
9. `publish.yml` rebuilds from the tag and publishes to npm with provenance

### Triggering a Release

Go to **Actions → Release → Run workflow**, select the version type, and run.

### Auto-Release (Spec Sync)

The `spec-sync.yml` workflow compares the committed `openapi.json` with the public OpenAPI document of the production Platform API (`https://platform.api-us.concurrence.com/v1/openapi.json`, served without authentication). It starts:

- every day at 06:23 UTC, on a schedule (`cron: '23 6 * * *'`), which always syncs from the default URL above,
- on a manual run (**Actions → Spec Sync → Run workflow**), with an optional `spec_url` input for another HTTPS spec, and
- on a `spec-updated` repository dispatch, whose payload carries `spec_url`.

No scheduled run has happened yet: the schedule was added after a manual run (43753707636, see below) had shown the whole workflow working on the served document. The first scheduled run is the next 06:23 UTC after the pull request that adds it is merged.

A run downloads the spec and projects it with `npm run openapi:sync`. The served document is a documentation projection of the full spec and differs from the committed `openapi.json` in more than the operations it leaves out. The projection restores or normalises three things, each only when the committed spec is given. The three differences below were established by reading the Platform API's code, not by downloading the served document:

1. **Published compatibility operations.** The served spec leaves out every internal operation, including the nine the SDK keeps for existing clients. The projection takes them, and the schemas only they reach, from the committed spec.
2. **Internal fields.** The API removes every schema property marked `"x-internal": true`, takes its name out of `required` and prunes a schema that loses its last reference. The SDK keeps such fields on purpose, with the marker. Wherever the committed spec marks a property internal and the served document has the parent schema but not the property, the projection copies the property back, restores its `required` entry in the committed order and copies the schemas it reaches. The markers in the committed spec are the list. **A field the API newly marks internal never enters the SDK through this path**: it is absent from the served document and not marked in the committed spec, so it is not restored.
3. **`tags` and `servers`.** The served document appends a name-only `tags` entry for every undeclared operation tag, which the projection drops (a declared tag stays), and it puts its own URL first as a url-only `servers` entry, for which the projection uses the committed entry with the same URL, ordered as the committed list orders the URLs and followed by any URL the committed list does not have.

The projection also writes every object's keys in sorted order, the order of the committed file, whatever order the API serves.

What has been shown so far: a test on a fixture built from the committed spec by applying what a deployed API does (`tests/public-openapi.test.js`) projects back to the committed bytes. A manual run on the served document (run 43751715977) reported exactly the three differences that were expected, three description strings of the promotions operation, regenerated the types and passed typecheck, build and tests; its last step then failed, which is what the branch preparation described below replaces. A later manual run (43753707636) went through the whole workflow on the served document: it found exactly the three expected differences, regenerated and checked the types, found no pause and no open pull request, pushed the branch `chore/sync-api-types` with one commit holding `openapi.json` and `src/generated/api.ts`, wrote the summary with the compare link and the title, and ended red as designed. While a pull request from that branch is open and the API does not change again, a run ends green with "already carries this spec".

When the projection differs from the committed file, the workflow prints where (the JSON pointers that differ, at most 200, names only, also in the run's summary), regenerates `src/generated/api.ts`, runs typecheck, build and tests, and then prepares the branch. **The workflow does not open a pull request**: this repository does not let workflows create them, and a pull request opened by the workflow token would get no checks. It reads the pull requests whose head is the rolling branch `chore/sync-api-types` and whose base is `main`, pushes the branch, and reports what a maintainer does next.

The branch holds one commit on top of `main` with `openapi.json` and `src/generated/api.ts`. A run pushes it (with `--force-with-lease`) only when the remote branch does not already hold the same two files, so an open pull request keeps its checks while the spec does not change.

What a run ends with (a scheduled run ends the same way as a manual one):

- **Green, in step**: the spec is unchanged ("Spec unchanged"), nothing else happens.
- **Green, already carried**: the spec changed, and an open pull request from the branch already holds the same content. The summary names the pull request; there is nothing to do but review and merge it.
- **Red, a person must act**: the run's summary and its error say what to do.
  - Spec changed and no pull request from the branch is open: the error says the SDK is behind the public API, and the summary gives the link `https://github.com/<repo>/compare/main...chore/sync-api-types?expand=1` and the title to use.
  - Spec changed and an open pull request holds an older spec: the branch is updated, and the run ends red, because a push made with the workflow token starts no checks on the pull request and a maintainer has to get them to run on the new head before merging.
  - The sync is paused (see Pause below), or a step failed (download, validation, types, build, tests, push).

A failed scheduled run is how this repository tells its maintainers that the SDK is behind the public API: it is the only signal the repository can send without a secret. Maintainers watch the failed runs of Spec Sync.

What a maintainer does after a red run:

1. Open the pull request from `chore/sync-api-types` into `main` with the title `chore: sync API types from platform (<id>)` (the id is in the prepared commit's subject; the release automation reads the subject `chore: sync API types from platform`, so keep that prefix).
2. Read the printed pointers and the generated type diff for breaking changes. A pull request opened by a person gets its checks normally.
3. Merge it. **The merge publishes a minor release**: `spec-auto-release.yml` waits for the Test workflow on `main` to pass and then dispatches the release. Nothing is released while the API is unchanged.

**Pause.** The sync is paused when the most recently closed pull request from the branch (head `chore/sync-api-types`, base `main`) was closed without merging and no pull request from the branch is open. A paused run pushes nothing and ends red naming that pull request. A pull request from the branch that is open, or one merged after it, ends the pause: closed-and-unmerged history older than a merged pull request does not count. The pause ends when a pull request from `chore/sync-api-types` is open or one is merged after it. Reopening the closed one may not be possible once its branch is deleted; in that case a maintainer pushes the branch by hand and opens a pull request from it. The rule is `scripts/lib/spec-sync-pause.mjs`, tested in `tests/spec-sync-pause.test.js`.

To check the setup, run the workflow once by hand. The expected result depends on what has changed since the committed spec was last synced: if nothing public changed it must end with "Spec unchanged"; if something did, it must report exactly the pointers of that change, pass "Verify types compile", push the branch and end red with the link to open the pull request. Any pointer under `/tags`, `/servers` or a schema property you did not expect means the projection does not yet reproduce the served document. Do not merge that pull request; fix the projection instead.

### Repository Secrets

Maintainers: configure npm trusted publishing for `publish.yml` where possible. Keep `NPM_TOKEN` only as a temporary fallback and configure `RELEASE_PUSH_TOKEN` only when branch protection prevents the default `GITHUB_TOKEN` from pushing release commits and tags. For recovery after a failed publish, dispatch `publish.yml` from `main` with `expected_version` set to the existing release version. The workflow still checks out and validates the immutable tag; do not move the tag or rerun version creation to recover a publish.
