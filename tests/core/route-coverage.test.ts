import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import spec from '../../openapi.json'

const METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const
const RESOURCES_DIR = join(import.meta.dirname, '../../src/resources')

const resourceSource = readdirSync(RESOURCES_DIR)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => readFileSync(join(RESOURCES_DIR, file), 'utf8'))
  .join('\n')

// Patient-facing surface pages authenticate with the link token, not the API key.
const isTokenRoute = (path: string) => path.startsWith('/s/')

describe('public route coverage', () => {
  it('has a typed resource wrapper for every route in the public spec', () => {
    const uncovered: string[] = []
    for (const [path, item] of Object.entries(spec.paths)) {
      if (isTokenRoute(path)) continue
      for (const method of METHODS) {
        const operation = (item as Record<string, { deprecated?: boolean } | undefined>)[method]
        if (!operation || operation.deprecated) continue
        const call = `.${method.toUpperCase()}(`
        const wrapped = resourceSource
          .split(call)
          .slice(1)
          .some((rest) => /^\s*['"`]([^'"`]+)['"`]/.exec(rest)?.[1] === path)
        if (!wrapped) uncovered.push(`${method.toUpperCase()} ${path}`)
      }
    }
    expect(uncovered).toEqual([])
  })
})
