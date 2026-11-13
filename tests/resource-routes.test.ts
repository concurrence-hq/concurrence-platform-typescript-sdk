import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Typecheck only catches a removed route when the wrapper passes its path to
// the typed client. A wrapper that goes through `path as never`, a private
// `this.get<T>(path)` helper or an untyped client cast keeps compiling after
// platform-api deletes the route, and then 404s on every call. This scans the
// `/v1/...` literals in src/resources and requires openapi.json to serve each.

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])

type SpecPaths = Record<string, Record<string, unknown>>

interface RouteLiteral {
  location: string
  method: string | undefined
  route: string
}

// The method of `client.GET('/v1/...')`, `this.post<T>('/v1/...' as never)`
// and the like. Any other use, such as `paths['/v1/...']`, only needs the
// path to exist.
function httpMethod(literal: ts.StringLiteralLike): string | undefined {
  let argument: ts.Node = literal
  while (
    ts.isAsExpression(argument.parent) ||
    ts.isSatisfiesExpression(argument.parent) ||
    ts.isParenthesizedExpression(argument.parent)
  ) {
    argument = argument.parent
  }
  const call = argument.parent
  if (!ts.isCallExpression(call) || call.arguments[0] !== argument) return undefined
  const callee = call.expression
  const name = ts.isPropertyAccessExpression(callee)
    ? callee.name.text
    : ts.isIdentifier(callee)
      ? callee.text
      : ''
  return HTTP_METHODS.has(name.toLowerCase()) ? name.toLowerCase() : undefined
}

function routeLiterals(fileName: string, text: string): RouteLiteral[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
  const found: RouteLiteral[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) && node.text.startsWith('/v1/')) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
      found.push({
        location: `${fileName}:${line + 1}`,
        method: httpMethod(node),
        route: node.text,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function unserved(literals: RouteLiteral[], paths: SpecPaths): string[] {
  return literals
    .filter(({ method, route }) => {
      const operations = paths[route]
      return operations === undefined || (method !== undefined && !(method in operations))
    })
    .map(({ location, method, route }) => `${location} ${method?.toUpperCase() ?? '*'} ${route}`)
}

function resourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return resourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

describe('resource routes', () => {
  it('flags routes behind casts, untyped clients and private helpers', () => {
    const paths: SpecPaths = { '/v1/{workspace_id}/settings/voice': { get: {}, put: {} } }
    const fixture = [
      "this.client.GET('/v1/{workspace_id}/settings/voice', init)",
      "this.client.GET('/v1/{workspace_id}/tasks/{task_id}' as never, init)",
      "untypedClient(this.client).POST<T>('/v1/{workspace_id}/desktop-sessions', init)",
      "this.post<T>('/v1/{workspace_id}/lakebase/query', init)",
      "this.client.DELETE('/v1/{workspace_id}/settings/voice', init)",
      "type Params = Q<'/v1/{workspace_id}/query-tools'>",
    ].join('\n')

    expect(unserved(routeLiterals('fixture.ts', fixture), paths)).toEqual([
      'fixture.ts:2 GET /v1/{workspace_id}/tasks/{task_id}',
      'fixture.ts:3 POST /v1/{workspace_id}/desktop-sessions',
      'fixture.ts:4 POST /v1/{workspace_id}/lakebase/query',
      'fixture.ts:5 DELETE /v1/{workspace_id}/settings/voice',
      'fixture.ts:6 * /v1/{workspace_id}/query-tools',
    ])
  })

  it('every /v1 literal in src/resources has a matching route in openapi.json', () => {
    const spec = JSON.parse(readFileSync(join(ROOT, 'openapi.json'), 'utf8')) as {
      paths: SpecPaths
    }
    const literals = resourceFiles(join(ROOT, 'src', 'resources')).flatMap((file) =>
      routeLiterals(relative(ROOT, file), readFileSync(file, 'utf8')),
    )

    expect(literals.filter(({ method }) => method !== undefined).length).toBeGreaterThan(0)
    expect(unserved(literals, spec.paths)).toEqual([])
  })
})
