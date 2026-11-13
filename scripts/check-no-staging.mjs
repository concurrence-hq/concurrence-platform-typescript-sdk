/**
 * Fail when a file that ships in the npm package, or a source it is built from, names Concurrence's
 * staging environment.
 *
 * The rule (John, 2026-10-25): public surfaces do not document our staging environment, so no README line,
 * doc comment, example, API doc or generated type carries an api-staging or console-staging host, or a
 * staging label inside a concurrence.com or amigo.ai host. The SDK's staging clone resources and a
 * customer's own staging workspace are product features and stay, so only hosts are matched.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = ['README.md', 'api.md', 'assets', 'src', 'examples', 'openapi.json', 'dist']
const TEXT_FILE = /\.(?:md|ts|tsx|js|mjs|cjs|json|txt|yml|yaml|map)$/
const STAGING_HOST = /api-staging|console-staging|staging[\w.-]*\.(?:concurrence\.com|amigo\.ai)/i

/** The line number and matched text of every staging host in text. */
export function stagingHosts(text) {
  return text
    .split('\n')
    .flatMap((line, index) =>
      [...line.matchAll(new RegExp(STAGING_HOST, 'gi'))].map((match) => [index + 1, match[0]]),
    )
}

function* textFiles(target) {
  if (!fs.existsSync(target)) return
  if (fs.statSync(target).isFile()) {
    yield target
    return
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const entryPath = path.join(target, entry.name)
    if (entry.isDirectory()) yield* textFiles(entryPath)
    else if (TEXT_FILE.test(entry.name)) yield entryPath
  }
}

function main() {
  const errors = []
  let scanned = 0
  for (const target of TARGETS) {
    for (const file of textFiles(path.join(ROOT, target))) {
      scanned += 1
      for (const [line, host] of stagingHosts(fs.readFileSync(file, 'utf8'))) {
        errors.push(`${path.relative(ROOT, file)}:${line}: ${host}`)
      }
    }
  }
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    console.error(
      `${errors.length} staging host references: public surfaces do not document our staging environment. ` +
        "Remove the host (a customer's own staging workspace is fine).",
    )
    process.exit(1)
  }
  console.log(`No staging hosts in ${scanned} published or source files`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
