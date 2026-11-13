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
