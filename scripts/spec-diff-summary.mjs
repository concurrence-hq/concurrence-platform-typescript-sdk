/**
 * Print where two OpenAPI documents differ, as JSON pointers (at most 200, names only, no values).
 *
 * Usage: node scripts/spec-diff-summary.mjs <committed.json> <projected.json>
 */

import fs from 'node:fs'
import { diffPointers, formatDiffSummary } from './lib/spec-diff.mjs'

const [beforePath, afterPath] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('Usage: node scripts/spec-diff-summary.mjs <committed.json> <projected.json>')
  process.exit(2)
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'))
console.log(formatDiffSummary(diffPointers(read(beforePath), read(afterPath))))
