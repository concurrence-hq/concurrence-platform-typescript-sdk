import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ROOT = path.resolve(__dirname, '..')
const tscPath = require.resolve('typescript/bin/tsc')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amigo-sdk-tarball-'))
const npmCacheDir = path.join(tempRoot, 'npm-cache')
const execEnv = { ...process.env, npm_config_cache: npmCacheDir }

let tarballPath

try {
  assertBuildPipeline()

  const [packInfo] = JSON.parse(
    execFileSync('npm', ['pack', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: execEnv,
    }),
  )
  tarballPath = path.join(ROOT, packInfo.filename)

  const unpackDir = path.join(tempRoot, 'unpacked')
  fs.mkdirSync(unpackDir, { recursive: true })
  execFileSync('tar', ['-xzf', tarballPath, '-C', unpackDir])

  const packageDir = path.join(unpackDir, 'package')
  assertPackagedFiles(packageDir)
  const packageJson = assertPackageMetadata(packageDir)
  assertPackageExports(packageJson)
  assertDeclarationImports(packageDir)

  runFixture({
    packageDir,
    fixtureDir: path.join(tempRoot, 'esm-fixture'),
    entryFile: 'index.mjs',
    source: [
      "import * as sdk from '@amigo-ai/platform-sdk'",
      "import { AmigoClient, parseRateLimitHeaders } from '@amigo-ai/platform-sdk'",
      '',
      "const client = new AmigoClient({ apiKey: 'test-key', workspaceId: 'ws-001' })",
      '',
      "if (!client.agents || typeof parseRateLimitHeaders !== 'function') {",
      "  throw new Error('ESM smoke test failed')",
      '}',
      '',
      "if ('extractData' in sdk || 'withResponse' in sdk) {",
      "  throw new Error('Internal response helpers must not be public exports')",
      '}',
      '',
      "console.log('esm smoke ok')",
      '',
    ].join('\n'),
  })

  runFixture({
    packageDir,
    fixtureDir: path.join(tempRoot, 'cjs-fixture'),
    packageJson: { type: 'commonjs' },
    entryFile: 'index.cjs',
    source: [
      "const sdk = require('@amigo-ai/platform-sdk')",
      'const { AmigoClient, parseRateLimitHeaders } = sdk',
      '',
      "const client = new AmigoClient({ apiKey: 'test-key', workspaceId: 'ws-001' })",
      '',
      "if (!client.agents || typeof parseRateLimitHeaders !== 'function') {",
      "  throw new Error('CJS smoke test failed')",
      '}',
      '',
      "if ('extractData' in sdk || 'withResponse' in sdk) {",
      "  throw new Error('Internal response helpers must not be public exports')",
      '}',
      '',
      "console.log('cjs smoke ok')",
      '',
    ].join('\n'),
  })

  runTypeFixture({
    packageDir,
    fixtureDir: path.join(tempRoot, 'esm-types-fixture'),
    packageJson: { type: 'module' },
    source: [
      'import {',
      '  AmigoClient,',
      '  parseRateLimitHeaders,',
      '  type components,',
      '  type paths,',
      "} from '@amigo-ai/platform-sdk'",
      '',
      "const client = new AmigoClient({ apiKey: 'test-key', workspaceId: 'ws-001' })",
      "const path: keyof paths = '/v1/{workspace_id}/agents'",
      'parseRateLimitHeaders(new Headers())',
      '',
      'void client',
      'void path',
      '',
      ...legacySafeExitTypeChecks('components'),
    ].join('\n'),
  })

  runTypeFixture({
    packageDir,
    fixtureDir: path.join(tempRoot, 'cjs-types-fixture'),
    packageJson: { type: 'commonjs' },
    source: [
      "import sdk = require('@amigo-ai/platform-sdk')",
      '',
      "const client = new sdk.AmigoClient({ apiKey: 'test-key', workspaceId: 'ws-001' })",
      'const parseRateLimitHeaders: typeof sdk.parseRateLimitHeaders = sdk.parseRateLimitHeaders',
      'parseRateLimitHeaders(new Headers())',
      '',
      'void client',
      '',
      ...legacySafeExitTypeChecks('sdk.components'),
    ].join('\n'),
  })

  console.log('tarball smoke tests passed')
} finally {
  if (tarballPath && fs.existsSync(tarballPath)) {
    fs.rmSync(tarballPath, { force: true })
  }

  fs.rmSync(tempRoot, { recursive: true, force: true })
}

function legacySafeExitTypeChecks(componentsType) {
  const schema = (name) => `${componentsType}['schemas']['${name}']`

  return [
    `type SafeExit = ${schema('SafeExit')}`,
    `type ReaderSafeExit = ${schema('src__services__safe_exit_reader__SafeExit')}`,
    `type EvidenceSafeExit = ${schema('platform_lib__calls__evidence__CallEvidence__SafeExit')}`,
    'type Equal<A, B> =',
    '  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false',
    '',
    'const safeExit: SafeExit = {',
    '  disclosure_heard: true,',
    "  lines_played: ['disclosure', 'transfer', 'end', 'fallback_missed', 'hearing_failure'],",
    "  outcome: 'mrc_transferred',",
    "  trigger: 'stt_fatal',",
    "  trigger_description: 'Speech recognition failed',",
    '}',
    "const outcomes: SafeExit['outcome'][] = ['mrc_transferred', 'mrc_ended', 'mrc_failed']",
    'const disclosureHeard: boolean = safeExit.disclosure_heard',
    'const triggerDescription: string = safeExit.trigger_description',
    'const safeExitIsReaderResponse: Equal<SafeExit, ReaderSafeExit> = true',
    'const safeExitIsNotCallEvidence: Equal<SafeExit, EvidenceSafeExit> = false',
    '// @ts-expect-error call evidence has no lines_played or trigger_description',
    'const evidenceAsSafeExit: SafeExit = {} as EvidenceSafeExit',
    '',
    'void outcomes',
    'void disclosureHeard',
    'void triggerDescription',
    'void safeExitIsReaderResponse',
    'void safeExitIsNotCallEvidence',
    'void evidenceAsSafeExit',
    '',
  ]
}

function assertBuildPipeline() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

  if (!packageJson.scripts?.build?.includes('scripts/prepare-cjs-types.mjs')) {
    throw new Error('build script must generate the CJS declaration entrypoint')
  }

  if (!packageJson.scripts?.prepublishOnly?.includes('npm run test:tarball')) {
    throw new Error('prepublishOnly must run the tarball smoke test before publish')
  }
}

function assertPackagedFiles(packageDir) {
  const required = [
    'dist/index.mjs',
    'dist/index.cjs',
    'dist/types/index.d.ts',
    'dist/types/index.d.cts',
    'README.md',
    'api.md',
    'package.json',
  ]

  for (const relativePath of required) {
    const absolutePath = path.join(packageDir, relativePath)
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Packed artifact is missing ${relativePath}`)
    }
  }
}

function assertPackageMetadata(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  if (packageJson.optionalDependencies) {
    throw new Error('Packed package must not declare optionalDependencies')
  }

  if (packageJson.publishConfig?.provenance !== true) {
    throw new Error('Packed package must request npm provenance')
  }

  if (packageJson.dependencies?.['openapi-fetch'] === undefined) {
    throw new Error('Packed package must declare openapi-fetch as a runtime dependency')
  }

  if (packageJson.dependencies?.['openapi-typescript-helpers'] === undefined) {
    throw new Error(
      'Packed package must declare openapi-typescript-helpers because public declarations import it',
    )
  }

  assertOpenApiHelperRange(packageJson)

  return packageJson
}

function assertOpenApiHelperRange(packageJson) {
  const openapiFetchPackage = JSON.parse(
    fs.readFileSync(require.resolve('openapi-fetch/package.json'), 'utf8'),
  )
  const expectedRange =
    openapiFetchPackage.peerDependencies?.['openapi-typescript-helpers'] ??
    openapiFetchPackage.dependencies?.['openapi-typescript-helpers']
  const actualRange = packageJson.dependencies?.['openapi-typescript-helpers']

  if (!expectedRange) {
    throw new Error('openapi-fetch package metadata no longer declares openapi-typescript-helpers')
  }

  assertEqual(
    actualRange,
    expectedRange,
    'openapi-typescript-helpers range must match openapi-fetch metadata',
  )
}

function assertDeclarationImports(packageDir) {
  const declaration = fs.readFileSync(path.join(packageDir, 'dist/types/index.d.ts'), 'utf8')
  const cjsDeclaration = fs.readFileSync(path.join(packageDir, 'dist/types/index.d.cts'), 'utf8')

  if (!declaration.includes("from 'openapi-typescript-helpers'")) {
    throw new Error(
      'Public declarations must import openapi-typescript-helpers when it is a runtime dependency',
    )
  }

  if (/from ['"][^'"]+\.d\.ts['"]/.test(cjsDeclaration)) {
    throw new Error('CJS declarations must not import .d.ts specifiers')
  }
}

function assertPackageExports(packageJson) {
  const rootExport = packageJson.exports?.['.']

  assertEqual(
    rootExport?.types,
    './dist/types/index.d.ts',
    'Root export must provide a legacy TypeScript types fallback',
  )
  assertEqual(
    rootExport?.import?.types,
    './dist/types/index.d.ts',
    'ESM export must point TypeScript at index.d.ts',
  )
  assertEqual(
    rootExport?.import?.default,
    './dist/index.mjs',
    'ESM export must point Node at index.mjs',
  )
  assertEqual(
    rootExport?.require?.types,
    './dist/types/index.d.cts',
    'CJS export must point TypeScript at index.d.cts',
  )
  assertEqual(
    rootExport?.require?.default,
    './dist/index.cjs',
    'CJS export must point Node at index.cjs',
  )
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual ?? 'undefined'}`)
  }
}

function runFixture({ packageDir, fixtureDir, packageJson = {}, entryFile, source }) {
  setupFixturePackage({ packageDir, fixtureDir, packageJson })
  fs.writeFileSync(path.join(fixtureDir, entryFile), source)

  execFileSync(process.execPath, [entryFile], {
    cwd: fixtureDir,
    stdio: 'inherit',
  })
}

function runTypeFixture({ packageDir, fixtureDir, packageJson, source }) {
  setupFixturePackage({ packageDir, fixtureDir, packageJson })
  fs.writeFileSync(path.join(fixtureDir, 'index.ts'), source)
  fs.writeFileSync(
    path.join(fixtureDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          lib: ['ES2022', 'DOM'],
        },
        include: ['index.ts'],
      },
      null,
      2,
    ),
  )

  execFileSync(process.execPath, [tscPath, '--project', fixtureDir], {
    cwd: fixtureDir,
    stdio: 'inherit',
  })
}

function setupFixturePackage({ packageDir, fixtureDir, packageJson }) {
  const sdkDir = path.join(fixtureDir, 'node_modules/@amigo-ai/platform-sdk')
  const nodeModulesDir = path.join(fixtureDir, 'node_modules')

  fs.mkdirSync(path.dirname(sdkDir), { recursive: true })
  fs.mkdirSync(nodeModulesDir, { recursive: true })
  fs.cpSync(packageDir, sdkDir, { recursive: true })
  linkRuntimeDependency(nodeModulesDir, 'openapi-fetch')
  linkRuntimeDependency(nodeModulesDir, 'openapi-typescript-helpers')

  fs.writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify(packageJson, null, 2))
}

function linkRuntimeDependency(nodeModulesDir, packageName) {
  const sourceDir = path.join(ROOT, 'node_modules', packageName)
  const targetDir = path.join(nodeModulesDir, packageName)

  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.symlinkSync(sourceDir, targetDir, 'dir')
}
