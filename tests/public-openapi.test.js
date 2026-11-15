import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  projectPublicOpenApi,
  publishedCompatibilityOperations,
} from '../scripts/lib/public-openapi.mjs'

const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` })
const response = (schema) => ({
  responses: { 200: { description: 'OK', content: { 'application/json': { schema } } } },
})
const firstCompatibility = Object.entries(publishedCompatibilityOperations)[0]

function fixture() {
  const paths = {}
  for (const [key, operationId] of Object.entries(publishedCompatibilityOperations)) {
    const [method, path] = key.split(' ')
    paths[path] ??= {}
    paths[path][method] = { operationId, 'x-internal': true, ...response(schemaRef('Shared')) }
  }
  paths['/public'] = {
    get: { operationId: 'public', ...response(schemaRef('Public')) },
    post: { operationId: 'private', 'x-internal': true, ...response(schemaRef('Private')) },
  }
  return {
    openapi: '3.1.0',
    paths,
    components: {
      schemas: {
        Public: {
          properties: { shared: schemaRef('Shared') },
          discriminator: { propertyName: 'kind', mapping: { alternate: 'DiscriminatorOnly' } },
        },
        Private: {
          properties: { shared: schemaRef('Shared'), nested: schemaRef('PrivateNested') },
        },
        PrivateNested: { properties: { cycle: schemaRef('Private') } },
        Shared: { properties: { self: schemaRef('Shared'), leaf: schemaRef('SharedLeaf') } },
        SharedLeaf: { type: 'string' },
        DiscriminatorOnly: { type: 'string' },
        Independent: { type: 'string' },
      },
    },
  }
}

describe('public OpenAPI projection', () => {
  it('excludes private sibling methods and exclusive recursive types while preserving shared contracts', () => {
    const input = fixture()
    const before = JSON.stringify(input)
    const output = projectPublicOpenApi(input)
    expect(output.paths['/public']).toEqual({ get: input.paths['/public'].get })
    expect(Object.keys(output.components.schemas).sort()).toEqual([
      'DiscriminatorOnly',
      'Independent',
      'Public',
      'Shared',
      'SharedLeaf',
    ])
    expect(output.components.schemas.Shared).toEqual(input.components.schemas.Shared)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('preserves exact published exceptions without admitting other methods on their paths', () => {
    const input = fixture()
    const [, path] = firstCompatibility[0].split(' ')
    input.paths[path].delete = { 'x-internal': true, ...response(schemaRef('Private')) }
    const output = projectPublicOpenApi(input)
    expect(output.paths[path].delete).toBeUndefined()
    for (const [key, operationId] of Object.entries(publishedCompatibilityOperations)) {
      const [method, operationPath] = key.split(' ')
      const expected = { ...input.paths[operationPath][method] }
      delete expected['x-internal']
      expect(output.paths[operationPath][method]).toEqual(expected)
      expect(output.paths[operationPath][method].operationId).toBe(operationId)
    }
  })

  it.each(['changed', 'missing', 'absent'])(
    'refuses a %s published compatibility operation',
    (mode) => {
      const input = fixture()
      const [method, path] = firstCompatibility[0].split(' ')
      if (mode === 'absent') delete input.paths[path][method]
      else if (mode === 'missing') delete input.paths[path][method].operationId
      else input.paths[path][method].operationId = 'replacement'
      expect(() => projectPublicOpenApi(input)).toThrow(
        'Published compatibility operation changed or is missing',
      )
    },
  )

  it('removes a future unknown internal path and its inherited parameter dependencies', () => {
    const input = fixture()
    input.paths['/future-private'] = {
      'x-internal': true,
      parameters: [{ name: 'value', in: 'query', schema: schemaRef('Private') }],
      get: { operationId: 'future-private', ...response({ type: 'string' }) },
    }
    const output = projectPublicOpenApi(input)
    expect(output.paths['/future-private']).toBeUndefined()
    expect(output.components.schemas.Private).toBeUndefined()
  })

  it('retains a dependency still referenced by an independently exported schema', () => {
    const input = fixture()
    input.components.schemas.Independent = { properties: { nested: schemaRef('PrivateNested') } }
    const output = projectPublicOpenApi(input)
    expect(output.components.schemas.PrivateNested).toEqual(input.components.schemas.PrivateNested)
    expect(output.components.schemas.Private).toEqual(input.components.schemas.Private)
  })

  it('preserves JSON-pointer escaped schema names and refuses dangling local references', () => {
    const input = fixture()
    input.components.schemas['Shared/Value'] = { type: 'string' }
    input.components.schemas.Public.properties.escaped = schemaRef('Shared~1Value')
    expect(projectPublicOpenApi(input).components.schemas['Shared/Value']).toEqual({
      type: 'string',
    })
    input.components.schemas.Public.properties.missing = schemaRef('Missing')
    expect(() => projectPublicOpenApi(input)).toThrow('Unresolved local OpenAPI reference')
  })

  it('fails closed for an internal operation in an unsupported nested surface', () => {
    const input = fixture()
    input.webhooks = {
      event: { post: { 'x-internal': true, ...response(schemaRef('Shared')) } },
    }
    expect(() => projectPublicOpenApi(input)).toThrow('unsupported internal operation surface')
  })

  it('preserves existing schema fields independently from operation publication', () => {
    const input = fixture()
    input.components.schemas.Public.properties.existing = { type: 'string', 'x-internal': true }
    expect(projectPublicOpenApi(input).components.schemas.Public).toEqual(
      input.components.schemas.Public,
    )
  })

  it('is a no-op on repeated projection and on the committed public snapshot', () => {
    const output = projectPublicOpenApi(fixture())
    expect(projectPublicOpenApi(output)).toEqual(output)
    const committed = JSON.parse(
      fs.readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'),
    )
    expect(projectPublicOpenApi(committed)).toEqual(committed)
    expect(JSON.stringify(committed.paths)).not.toContain('"x-internal":true')
  })
})

describe('public OpenAPI projection of a spec that leaves out the published compatibility operations', () => {
  const committed = JSON.parse(fs.readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'))
  const schemaNames = (value, into = new Set()) => {
    const text = JSON.stringify(value)
    for (const [, token] of text.matchAll(/"#\/components\/schemas\/([^"]+)"/g)) {
      into.add(token.replace(/~1/g, '/').replace(/~0/g, '~'))
    }
    return into
  }
  const closure = (roots, schemas) => {
    const reached = new Set()
    const pending = [...roots]
    while (pending.length) {
      const name = pending.pop()
      if (reached.has(name) || !schemas[name]) continue
      reached.add(name)
      for (const next of schemaNames(schemas[name])) pending.push(next)
    }
    return reached
  }

  // The served document: the committed one without the nine operations and the
  // schemas that only they reach (the same rule the projection prunes by).
  function servedDocument() {
    const served = JSON.parse(JSON.stringify(committed))
    const removed = {}
    for (const key of Object.keys(publishedCompatibilityOperations)) {
      const [method, path] = key.split(' ')
      removed[`${method} ${path}`] = served.paths[path][method]
      delete served.paths[path][method]
      if (Object.keys(served.paths[path]).length === 0) delete served.paths[path]
    }
    const schemas = served.components.schemas
    const reachedByRemoved = closure(schemaNames(Object.values(removed)), schemas)
    const roots = schemaNames(served.paths)
    for (const name of Object.keys(schemas)) if (!reachedByRemoved.has(name)) roots.add(name)
    const retained = closure(roots, schemas)
    const exclusive = [...reachedByRemoved].filter((name) => !retained.has(name))
    for (const name of exclusive) delete schemas[name]
    return { served, exclusive }
  }

  it('restores the nine operations and their exclusive schemas from the committed spec', () => {
    const { served, exclusive } = servedDocument()
    expect(exclusive.length).toBeGreaterThan(0)
    for (const key of Object.keys(publishedCompatibilityOperations)) {
      const [method, path] = key.split(' ')
      expect(served.paths[path]?.[method]).toBeUndefined()
    }
    const before = JSON.stringify(served)
    const output = projectPublicOpenApi(served, committed)
    expect(output).toEqual(committed)
    expect(JSON.stringify(output, null, 2)).toBe(JSON.stringify(committed, null, 2))
    expect(JSON.stringify(served)).toBe(before)
  })

  // A deployed API serves its document in definition order, not sorted. Reverse
  // every object's key order (arrays keep their order): deterministic, and never
  // the sorted order the committed file has.
  const reversedKeys = (value) => {
    if (Array.isArray(value)) return value.map(reversedKeys)
    if (value === null || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.keys(value)
        .reverse()
        .map((key) => [key, reversedKeys(value[key])]),
    )
  }

  it('gives the committed bytes for a served document in another key order, with operations restored', () => {
    const { served } = servedDocument()
    const shuffled = reversedKeys(served)
    // A path item that stays, an operation of it and a schema of it all change order.
    const stayingPath = Object.keys(served.paths)[0]
    expect(Object.keys(shuffled.paths[stayingPath])).toEqual(
      Object.keys(served.paths[stayingPath]).reverse(),
    )
    expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(served))
    const output = projectPublicOpenApi(shuffled, committed)
    expect(JSON.stringify(output, null, 2)).toBe(JSON.stringify(committed, null, 2))
  })

  it('gives the committed bytes for a document in another key order, with nothing restored', () => {
    const shuffled = reversedKeys(committed)
    expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(committed))
    const output = projectPublicOpenApi(shuffled, committed)
    expect(JSON.stringify(output, null, 2)).toBe(JSON.stringify(committed, null, 2))
  })

  it('refuses a published compatibility operation under another operationId', () => {
    const { served } = servedDocument()
    const [method, path] = firstCompatibility[0].split(' ')
    served.paths[path] ??= {}
    served.paths[path][method] = {
      operationId: 'replacement',
      responses: { 200: { description: 'OK' } },
    }
    expect(() => projectPublicOpenApi(served, committed)).toThrow(
      'Published compatibility operation changed or is missing',
    )
  })

  it('keeps the input version of a schema that both documents have', () => {
    const { served } = servedDocument()
    const [method, path] = firstCompatibility[0].split(' ')
    const shared = [...schemaNames(committed.paths[path][method])].find((name) =>
      Object.hasOwn(served.components.schemas, name),
    )
    const target = shared ?? Object.keys(served.components.schemas)[0]
    const { schemas } = served.components
    schemas[target] = { ...schemas[target], description: 'input' }
    const output = projectPublicOpenApi(served, committed)
    expect(output.components.schemas[target].description).toBe('input')
  })

  it('still refuses an absent operation when no committed spec is given', () => {
    const { served } = servedDocument()
    expect(() => projectPublicOpenApi(served)).toThrow(
      'Published compatibility operation changed or is missing',
    )
  })
})
