import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8')

function step(name: string) {
  const section = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name: ')[0]
  const script = section?.split('        run: |\n')[1]
  if (!script) throw new Error(`Missing workflow step: ${name}`)
  return script.replace(/^ {10}/gm, '')
}

function run(name: string, values: Record<string, string | undefined>) {
  const directory = mkdtempSync(join(tmpdir(), 'amigo-publish-test-'))
  try {
    return spawnSync('bash', ['-e', '-c', step(name)], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, GITHUB_OUTPUT: join(directory, 'output'), ...values },
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('publish workflow recovery', () => {
  it.each([
    { EVENT_NAME: 'release', RELEASE_TAG: 'v0.108.0' },
    { EVENT_NAME: 'workflow_dispatch', REF_TYPE: 'tag', REF_NAME: 'v0.108.0' },
    { EVENT_NAME: 'workflow_dispatch', REF_TYPE: 'branch', EXPECTED_VERSION: '0.108.0' },
  ])('accepts an explicit release target: %j', (values) => {
    expect(run('Resolve release tag', values).status).toBe(0)
  })

  it.each([
    { EVENT_NAME: 'workflow_dispatch', REF_TYPE: 'branch' },
    { EVENT_NAME: 'release', RELEASE_TAG: 'v0.108.0', EXPECTED_VERSION: '0.109.0' },
    { EVENT_NAME: 'workflow_dispatch', REF_TYPE: 'branch', EXPECTED_VERSION: '../main' },
  ])('rejects a missing or inconsistent release target: %j', (values) => {
    expect(run('Resolve release tag', values).status).not.toBe(0)
  })

  it('does not let an obsolete token block the OIDC authentication path', () => {
    const result = run('Validate publish credentials', {
      NODE_AUTH_TOKEN: 'synthetic-obsolete-token',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid/oidc',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-job-token',
      PATH: '/usr/bin:/bin',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('prefer the configured GitHub OIDC publisher')
  })

  it('fails without a token or OIDC credentials', () => {
    expect(run('Validate publish credentials', {}).status).not.toBe(0)
  })
})
