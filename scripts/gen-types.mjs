/**
 * Generate TypeScript types from the platform OpenAPI spec.
 *
 * Sources (in priority order):
 *   1. Explicit --spec path/to/spec.json within this repo or ../platform
 *   2. Committed repo snapshot: openapi.json
 *   3. Local sibling repo: ../platform/services/platform-api/openapi.json
 *
 * The default path is intentionally deterministic for public builds: if
 * `openapi.json` is committed in this repo, builds do not depend on local
 * sibling checkouts or live network state.
 */

import fs from 'node:fs'
import path from 'node:path'
import openapiTS, { astToString } from 'openapi-typescript'
import ts from 'typescript'
import { projectPublicOpenApi } from './lib/public-openapi.mjs'
import {
  REPO_ROOT,
  assertWithinRoots,
  resolveAllowedFile,
  resolveRepoPath,
} from './lib/repo-paths.mjs'

const OUT_FILE = resolveRepoPath('src/generated/api.ts')
const REPO_SPEC = resolveRepoPath('openapi.json')
const PLATFORM_ROOT = path.resolve(REPO_ROOT, '../platform')
const SIBLING_SPEC = path.resolve(PLATFORM_ROOT, 'services/platform-api/openapi.json')
const ALLOWED_SPEC_ROOTS = [REPO_ROOT, PLATFORM_ROOT]

const args = process.argv.slice(2)

function getArgValue(name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function resolveSpecSource() {
  const specArg = getArgValue('--spec')

  if (specArg) {
    const resolvedPath = resolveAllowedFile(specArg, ALLOWED_SPEC_ROOTS, 'OpenAPI spec')
    console.log(`Using explicit spec: ${resolvedPath}`)
    return resolvedPath
  }

  if (fs.existsSync(REPO_SPEC)) {
    console.log(`Using committed spec snapshot: ${REPO_SPEC}`)
    return REPO_SPEC
  }

  if (fs.existsSync(SIBLING_SPEC)) {
    const resolvedPath = assertWithinRoots(SIBLING_SPEC, ALLOWED_SPEC_ROOTS, 'OpenAPI spec')
    console.log(`Committed spec not found, using sibling repo spec: ${resolvedPath}`)
    return resolvedPath
  }

  throw new Error(
    'No OpenAPI spec source found. Commit openapi.json or provide --spec within this repo or ../platform.',
  )
}

async function loadSpec(specSource) {
  const raw = fs.readFileSync(specSource, 'utf-8')
  const document = JSON.parse(raw)

  if (!document || typeof document !== 'object' || typeof document.openapi !== 'string') {
    throw new Error(`Invalid OpenAPI document: ${specSource}`)
  }

  return document
}

function patchOpenApiDocument(input) {
  const existingSchemas = new Set(Object.keys(input.components?.schemas ?? {}))

  function fixDiscriminatorMappings(obj) {
    if (!obj || typeof obj !== 'object') return

    if (obj.discriminator?.mapping) {
      for (const [key, ref] of Object.entries(obj.discriminator.mapping)) {
        if (!existingSchemas.has(ref.replace('#/components/schemas/', ''))) {
          delete obj.discriminator.mapping[key]
        }
      }
    }

    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        value.forEach(fixDiscriminatorMappings)
      } else if (typeof value === 'object' && value !== null) {
        fixDiscriminatorMappings(value)
      }
    }
  }

  fixDiscriminatorMappings(input)

  const seenOperationIds = new Map()
  for (const [, pathItem] of Object.entries(input.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (typeof operation !== 'object' || !operation.operationId) continue

      const { operationId } = operation
      if (seenOperationIds.has(operationId)) {
        operation.operationId = `${operationId}-${method}`
      } else {
        seenOperationIds.set(operationId, true)
      }
    }
  }

  for (const [pathKey, pathItem] of Object.entries(input.paths ?? {})) {
    const templateParams = [...pathKey.matchAll(/\{(\w+)\}/g)].map((match) => match[1])
    if (templateParams.length === 0) continue

    for (const [, operation] of Object.entries(pathItem)) {
      if (typeof operation !== 'object' || !operation.responses) continue

      if (!operation.parameters) {
        operation.parameters = []
      }

      for (const paramName of templateParams) {
        const exists = operation.parameters.some(
          (param) => param.name === paramName && param.in === 'path',
        )

        if (!exists) {
          operation.parameters.push({
            name: paramName,
            in: 'path',
            required: true,
            schema: { type: 'string' },
          })
        }
      }
    }
  }

  return input
}

const specSource = resolveSpecSource()
console.log(`Generating types from: ${specSource}`)

const input = patchOpenApiDocument(projectPublicOpenApi(await loadSpec(specSource)))

// Recursive "arbitrary JSON" schemas (a union whose array/object members
// `$ref` the schema itself) are emitted by openapi-typescript as a member that
// references itself through an indexed-access type —
// `components["schemas"]["JsonValue"]`. TypeScript resolves indexed-access
// types eagerly, so a member whose own definition references itself this way
// fails to compile with `TS2502: 'JsonValue' is referenced directly or
// indirectly in its own type annotation`. Named type aliases are resolved
// lazily, so we break the cycle at the codegen layer (NOT by hand-patching the
// generated file, which the next sync would clobber): for each such schema we
// (a) `inject` a standalone recursive alias and (b) point the schema's emitted
// type at that alias via the `transform` hook. External
// `components["schemas"]["JsonValue"]` references resolve to the now cycle-free
// member and stay valid. Because this lives in the generate step, every run
// (local, CI `gen-types` verify, sdk-sync) reproduces it byte-for-byte.
const RECURSIVE_JSON_SCHEMAS = ['JsonValue']
const injectedRecursiveJsonSchemas = RECURSIVE_JSON_SCHEMAS.filter(
  (name) => input.components?.schemas?.[name],
)
const recursiveJsonAliases = injectedRecursiveJsonSchemas
  .map(
    (name) =>
      `type ${name} = boolean | number | string | ${name}[] | { [key: string]: ${name} } | null;`,
  )
  .join('\n')

const ast = await openapiTS(input, {
  defaultNonNullable: false,
  ...(recursiveJsonAliases && { inject: recursiveJsonAliases }),
  transform(_schemaObject, options) {
    for (const name of injectedRecursiveJsonSchemas) {
      if (options.path === `#/components/schemas/${name}`) {
        return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier(name), undefined)
      }
    }
    return undefined
  },
})
const code = astToString(ast)

const outDir = path.dirname(OUT_FILE)
if (!fs.existsSync(outDir)) {
  assertWithinRoots(outDir, [REPO_ROOT], 'generated types directory')
  fs.mkdirSync(outDir, { recursive: true })
}

fs.writeFileSync(OUT_FILE, code)

const pathCount = Object.keys(input.paths ?? {}).length
const schemaCount = Object.keys(input.components?.schemas ?? {}).length
console.log(`Generated ${OUT_FILE}: ${pathCount} paths, ${schemaCount} schemas`)
