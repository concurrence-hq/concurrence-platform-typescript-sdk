/**
 * Refresh the committed OpenAPI snapshot at repo root.
 *
 * The input may be the full internal spec or the public spec a deployed Platform API serves.
 * Published compatibility operations the input leaves out come from the committed snapshot.
 *
 * Sources (in priority order):
 *   1. Explicit --spec path/to/spec.json within this repo or ../platform-v2
 *   2. Local sibling repo: ../platform-v2/services/platform-api/openapi.json
 */

import fs from 'node:fs'
import path from 'node:path'
import { projectPublicOpenApi } from './lib/public-openapi.mjs'
import {
  REPO_ROOT,
  assertWithinRoots,
  resolveAllowedFile,
  resolveRepoPath,
} from './lib/repo-paths.mjs'

const PLATFORM_ROOT = path.resolve(REPO_ROOT, '../platform-v2')
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
    return resolveAllowedFile(specArg, ALLOWED_SPEC_ROOTS, 'OpenAPI spec')
  }

  if (fs.existsSync(SIBLING_SPEC)) {
    return assertWithinRoots(SIBLING_SPEC, ALLOWED_SPEC_ROOTS, 'OpenAPI spec')
  }

  throw new Error(
    'No OpenAPI spec source found. Provide --spec with a file inside this repo or ../platform-v2/services/platform-api/openapi.json.',
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

const specSource = resolveSpecSource()
console.log(`Syncing OpenAPI snapshot from: ${specSource}`)

const OUT_FILE = resolveRepoPath(getArgValue('--output') ?? 'openapi.json')
const committedSpec = resolveRepoPath('openapi.json')
const committed = fs.existsSync(committedSpec)
  ? JSON.parse(fs.readFileSync(committedSpec, 'utf-8'))
  : undefined
const document = projectPublicOpenApi(await loadSpec(specSource), committed)
fs.writeFileSync(OUT_FILE, `${JSON.stringify(document, null, 2)}\n`)

console.log(`Wrote ${OUT_FILE}`)
