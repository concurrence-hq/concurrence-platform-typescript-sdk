import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { decideSyncState } from '../scripts/lib/spec-sync-pause.mjs'

const BRANCH = 'chore/sync-api-types'

function pull(
  number,
  state,
  { closedAt = null, mergedAt = null, head = BRANCH, base = 'main' } = {},
) {
  return {
    number,
    state,
    closed_at: closedAt,
    merged_at: mergedAt,
    html_url: `https://github.com/example/repo/pull/${number}`,
    head: { ref: head },
    base: { ref: base },
  }
}

// What the repository's history looked like on 2026-11-15, newest first as the REST API lists it.
const today = [
  pull(476, 'closed', { closedAt: '2026-10-18T09:00:00Z', mergedAt: '2026-10-18T09:00:00Z' }),
  pull(474, 'closed', { closedAt: '2026-10-14T09:00:00Z', mergedAt: '2026-10-14T09:00:00Z' }),
  pull(435, 'closed', { closedAt: '2026-10-10T09:00:00Z' }),
]

describe('spec sync pause rule', () => {
  it('is not paused by today history: one closed unmerged, then two merged', () => {
    expect(decideSyncState(today, BRANCH)).toEqual({ paused: false, pausedBy: null, open: null })
  })

  it('is paused when the most recently closed pull request was closed without merging', () => {
    const prs = [
      pull(480, 'closed', { closedAt: '2026-11-01T09:00:00Z' }),
      pull(476, 'closed', { closedAt: '2026-10-18T09:00:00Z', mergedAt: '2026-10-18T09:00:00Z' }),
      pull(435, 'closed', { closedAt: '2026-10-10T09:00:00Z' }),
    ]
    expect(decideSyncState(prs, BRANCH)).toEqual({
      paused: true,
      pausedBy: { number: 480, url: 'https://github.com/example/repo/pull/480' },
      open: null,
    })
  })

  it('goes by the closing time, not by the order of the list or the number', () => {
    const prs = [
      pull(500, 'closed', { closedAt: '2026-10-01T09:00:00Z' }),
      pull(300, 'closed', { closedAt: '2026-11-01T09:00:00Z', mergedAt: '2026-11-01T09:00:00Z' }),
    ]
    expect(decideSyncState(prs, BRANCH).paused).toBe(false)
  })

  it('is not paused while a pull request from the branch is open, and reports it', () => {
    const prs = [
      pull(490, 'open'),
      pull(480, 'closed', { closedAt: '2026-11-01T09:00:00Z' }),
      ...today,
    ]
    expect(decideSyncState(prs, BRANCH)).toEqual({
      paused: false,
      pausedBy: null,
      open: { number: 490, url: 'https://github.com/example/repo/pull/490' },
    })
  })

  it('is not paused when there is no pull request at all', () => {
    expect(decideSyncState([], BRANCH)).toEqual({ paused: false, pausedBy: null, open: null })
  })

  it('ignores pull requests from other branches and into other bases', () => {
    const prs = [
      pull(600, 'closed', { closedAt: '2026-11-10T09:00:00Z', head: 'chore/other' }),
      pull(601, 'closed', { closedAt: '2026-11-11T09:00:00Z', base: 'release' }),
      pull(602, 'open', { head: 'chore/other' }),
      ...today,
    ]
    expect(decideSyncState(prs, BRANCH)).toEqual({ paused: false, pausedBy: null, open: null })
  })

  it('accepts pages of pull requests and rejects anything that is not a list', () => {
    const page = [pull(480, 'closed', { closedAt: '2026-11-01T09:00:00Z' })]
    expect(decideSyncState([page, today], BRANCH).paused).toBe(true)
    expect(() => decideSyncState({ message: 'Not Found' }, BRANCH)).toThrow('array')
  })
})

describe('spec-sync-pause CLI', () => {
  const script = new URL('../scripts/spec-sync-pause.mjs', import.meta.url).pathname

  it('prints the decision as JSON for a file of pull requests', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-sync-pause-'))
    try {
      const file = path.join(dir, 'pulls.json')
      fs.writeFileSync(file, JSON.stringify([pull(490, 'open'), ...today]))
      const out = execFileSync(process.execPath, [script, file, BRANCH], { encoding: 'utf-8' })
      expect(JSON.parse(out)).toEqual({
        paused: false,
        pausedBy: null,
        open: { number: 490, url: 'https://github.com/example/repo/pull/490' },
      })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails without a file', () => {
    expect(() =>
      execFileSync(process.execPath, [script], { encoding: 'utf-8', stdio: 'pipe' }),
    ).toThrow()
  })
})
