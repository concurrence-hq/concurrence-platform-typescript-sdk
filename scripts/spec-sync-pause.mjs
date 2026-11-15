/**
 * Print whether the spec sync is paused, and which pull request of the rolling branch is open, as
 * JSON: { "paused": boolean, "pausedBy": {number, url} | null, "open": {number, url} | null }.
 *
 * Usage: node scripts/spec-sync-pause.mjs <pulls.json> [branch]
 *
 * <pulls.json> is the REST list of the repository's pull requests for the branch
 * (`gh api "repos/<repo>/pulls?state=all&head=<owner>:<branch>&base=main&per_page=100"`).
 */

import fs from 'node:fs'
import { decideSyncState } from './lib/spec-sync-pause.mjs'

const [pullsPath, branch = 'chore/sync-api-types'] = process.argv.slice(2)
if (!pullsPath) {
  console.error('Usage: node scripts/spec-sync-pause.mjs <pulls.json> [branch]')
  process.exit(2)
}

const pullRequests = JSON.parse(fs.readFileSync(pullsPath, 'utf-8'))
console.log(JSON.stringify(decideSyncState(pullRequests, branch), null, 2))
