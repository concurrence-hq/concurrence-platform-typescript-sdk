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
4. **Validate**: `npm run lint && npm run typecheck && npm run typecheck:examples && npm test && npm run build && npm run test:dist`
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

When the platform API spec changes on `main`, the `spec-sync.yml` workflow:

1. Detects spec differences
2. Opens a PR with regenerated types
3. After that PR is merged, `spec-auto-release.yml` waits for the Test workflow on `main` to pass
4. Dispatches a minor release automatically

### Repository Secrets

Maintainers: configure npm trusted publishing for `publish.yml` where possible. Keep `NPM_TOKEN` only as a temporary fallback and configure `RELEASE_PUSH_TOKEN` only when branch protection prevents the default `GITHUB_TOKEN` from pushing release commits and tags. For recovery after a failed publish, dispatch `publish.yml` from `main` with `expected_version` set to the existing release version. The workflow still checks out and validates the immutable tag; do not move the tag or rerun version creation to recover a publish.
