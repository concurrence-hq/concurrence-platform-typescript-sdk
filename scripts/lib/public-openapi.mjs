/** The already-published workspace-copy API remains compatible with existing clients. */
export const publishedCompatibilityOperations = Object.freeze({
  'post /v1/{workspace_id}/services/{service_id}/staging-clone-preview':
    'preview-staging-service-clone',
  'post /v1/{workspace_id}/staging-clones/import': 'import-staging-service-clone',
  'get /v1/{workspace_id}/staging-clones/imports': 'list-staging-clone-imports',
  'post /v1/{workspace_id}/staging-clones/mirror': 'apply-staging-service-mirror',
  'post /v1/{workspace_id}/staging-clones/mirror-preview': 'preview-staging-service-mirror',
  'get /v1/{workspace_id}/staging-clones/pairing': 'get-staging-workspace-pairing',
  'put /v1/{workspace_id}/staging-clones/pairing': 'pair-staging-workspace',
  'post /v1/{workspace_id}/staging-clones/preview': 'preview-staging-service-import',
  'get /v1/{workspace_id}/staging-clones/source-services': 'list-staging-clone-source-services',
})

const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function visit(value, inspect) {
  if (Array.isArray(value)) {
    for (const child of value) visit(child, inspect)
  } else if (isObject(value)) {
    inspect(value)
    for (const child of Object.values(value)) visit(child, inspect)
  }
}

function pointerSegments(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined
  return decodeURIComponent(ref.slice(2))
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function references(value, schemas, inspect) {
  visit(value, (node) => {
    if (typeof node.$ref === 'string') inspect(node.$ref)
    for (const ref of Object.values(node.discriminator?.mapping ?? {})) {
      if (typeof ref !== 'string') continue
      if (Object.hasOwn(schemas, ref)) {
        inspect(`#/components/schemas/${ref.replace(/~/g, '~0').replace(/\//g, '~1')}`)
      } else if (ref.startsWith('#/')) {
        inspect(ref)
      }
    }
  })
}

function assertLocalReferences(document) {
  references(document, document.components?.schemas ?? {}, (ref) => {
    const segments = pointerSegments(ref)
    if (!segments) return // External references are preserved; projection does not fetch them.
    let target = document
    for (const segment of segments) {
      if (target === null || typeof target !== 'object' || !Object.hasOwn(target, segment)) {
        throw new Error(`Unresolved local OpenAPI reference: ${ref}`)
      }
      target = target[segment]
    }
  })
}

function schemaReferences(value, schemas) {
  const names = new Set()
  references(value, schemas, (ref) => {
    const segments = pointerSegments(ref)
    if (segments?.[0] === 'components' && segments[1] === 'schemas' && segments[2]) {
      names.add(segments[2])
    }
  })
  return names
}

function reachableSchemas(roots, schemas) {
  const pending = [...roots]
  const reached = new Set()
  while (pending.length) {
    const name = pending.pop()
    if (reached.has(name)) continue
    reached.add(name)
    pending.push(...schemaReferences(schemas[name], schemas))
  }
  return reached
}

/**
 * The committed public spec orders object keys by code unit at every depth (it
 * descends from an exporter that writes sorted keys), while a deployed API
 * serves its document in definition order. Arrays keep their order.
 */
function canonicalKeyOrder(value) {
  if (Array.isArray(value)) return value.map(canonicalKeyOrder)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((key) => [key, canonicalKeyOrder(value[key])]),
  )
}

/**
 * A Platform API serves only its public operations, so the published
 * compatibility operations it keeps internal are absent from its document.
 * Take each absent one from the committed public spec, with every schema it
 * reaches that the input does not have. A schema the input has keeps the
 * input's version.
 */
function restorePublishedOperations(document, committed) {
  const pending = []
  for (const [key, operationId] of Object.entries(publishedCompatibilityOperations)) {
    const [method, path] = key.split(' ')
    if (isObject(document.paths[path]?.[method])) continue
    const source = committed.paths?.[path]
    // Not restorable: the compatibility check below reports it as missing.
    if (!isObject(source?.[method]) || source[method].operationId !== operationId) continue
    const clone = JSON.parse(JSON.stringify(source))
    if (!isObject(document.paths[path])) {
      document.paths[path] = Object.fromEntries(
        Object.entries(clone).filter(([name]) => !methods.has(name)),
      )
    }
    document.paths[path][method] = clone[method]
    pending.push(...schemaReferences(clone[method], committed.components?.schemas ?? {}))
    pending.push(...schemaReferences(clone.parameters, committed.components?.schemas ?? {}))
  }
  if (pending.length === 0) return
  const committedSchemas = committed.components?.schemas ?? {}
  document.components ??= {}
  document.components.schemas ??= {}
  const schemas = document.components.schemas
  while (pending.length) {
    const name = pending.pop()
    if (Object.hasOwn(schemas, name)) continue
    if (!Object.hasOwn(committedSchemas, name)) {
      throw new Error(`Unresolved local OpenAPI reference: #/components/schemas/${name}`)
    }
    schemas[name] = JSON.parse(JSON.stringify(committedSchemas[name]))
    pending.push(...schemaReferences(schemas[name], committedSchemas))
  }
}

/**
 * Derive the publishable contract without modifying the canonical input.
 * Retain independently exported schemas; prune only dependencies exclusive to
 * excluded operations. A shared or recursive schema must never become dangling.
 * `committed` is the SDK's public spec: it supplies the published compatibility
 * operations that an input already limited to public operations leaves out.
 * The result's keys are in canonical order, so an unchanged API serializes to
 * the committed file's bytes.
 */
export function projectPublicOpenApi(input, committed) {
  if (!isObject(input) || typeof input.openapi !== 'string' || !isObject(input.paths)) {
    throw new Error('An OpenAPI document with paths is required')
  }
  const document = JSON.parse(JSON.stringify(input))
  assertLocalReferences(document)
  if (isObject(committed) && isObject(committed.paths)) {
    restorePublishedOperations(document, committed)
  }
  for (const [key, operationId] of Object.entries(publishedCompatibilityOperations)) {
    const [method, path] = key.split(' ')
    if (document.paths[path]?.[method]?.operationId !== operationId) {
      throw new Error(`Published compatibility operation changed or is missing: ${key}`)
    }
  }

  const excluded = []
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of methods) {
      const operation = item[method]
      if (!isObject(operation)) continue
      if (item['x-internal'] !== true && operation['x-internal'] !== true) continue
      const key = `${method} ${path}`
      if (
        Object.hasOwn(publishedCompatibilityOperations, key) &&
        publishedCompatibilityOperations[key] === operation.operationId
      ) {
        delete operation['x-internal']
      } else {
        excluded.push(operation)
        delete item[method]
      }
    }
    if (![...methods].some((method) => isObject(item[method]))) {
      excluded.push(item)
      delete document.paths[path]
    } else {
      delete item['x-internal']
    }
  }

  const schemas = document.components?.schemas ?? {}
  const exclusiveCandidates = reachableSchemas(schemaReferences(excluded, schemas), schemas)
  const publicRoots = { ...document, components: { ...document.components } }
  delete publicRoots.components.schemas
  const retainedRoots = schemaReferences(publicRoots, schemas)
  // Unreferenced types may already be part of the exported components interface.
  for (const name of Object.keys(schemas)) {
    if (!exclusiveCandidates.has(name)) retainedRoots.add(name)
  }
  const retained = reachableSchemas(retainedRoots, schemas)
  for (const name of exclusiveCandidates) {
    if (!retained.has(name)) delete schemas[name]
  }
  assertLocalReferences(document)
  // Schema fields are a separate publication contract; existing fields are not
  // removed merely because their source annotations differ from operation policy.
  visit(publicRoots, (node) => {
    if (node['x-internal'] === true) {
      throw new Error('An unsupported internal operation surface remains in the public contract')
    }
  })
  return canonicalKeyOrder(document)
}
