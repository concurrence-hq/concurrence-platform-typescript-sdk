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

const clone = (value) => JSON.parse(JSON.stringify(value))

/** Copy each named schema, and every schema it reaches, that the document lacks. */
function copyCommittedSchemas(document, committed, pending) {
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
    schemas[name] = clone(committedSchemas[name])
    pending.push(...schemaReferences(schemas[name], committedSchemas))
  }
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
  const committedSchemas = committed.components?.schemas ?? {}
  for (const [key, operationId] of Object.entries(publishedCompatibilityOperations)) {
    const [method, path] = key.split(' ')
    if (isObject(document.paths[path]?.[method])) continue
    const source = committed.paths?.[path]
    // Not restorable: the compatibility check below reports it as missing.
    if (!isObject(source?.[method]) || source[method].operationId !== operationId) continue
    const copy = clone(source)
    if (!isObject(document.paths[path])) {
      document.paths[path] = Object.fromEntries(
        Object.entries(copy).filter(([name]) => !methods.has(name)),
      )
    }
    document.paths[path][method] = copy[method]
    pending.push(...schemaReferences(copy[method], committedSchemas))
    pending.push(...schemaReferences(copy.parameters, committedSchemas))
  }
  copyCommittedSchemas(document, committed, pending)
}

/**
 * A Platform API removes every schema property marked `x-internal`, its name
 * from the schema's `required`, and a schema that loses its last reference. The
 * SDK keeps such fields, with their marker. Walk the committed schemas and the
 * input's in parallel and, wherever the input has the parent but not a property
 * the committed parent marks internal, copy the property back, put its name back
 * into `required` where the committed parent requires it (in the committed
 * order), and copy every schema it reaches that the input lacks. A parent the
 * input does not have stays absent. The committed spec's markers are the list: a
 * property the API newly marks internal is never added through this path.
 */
function restoreInternalFields(document, committed) {
  const committedSchemas = committed.components?.schemas ?? {}
  const schemas = document.components?.schemas
  if (!isObject(schemas)) return
  const pending = []

  function restoreProperties(from, into) {
    if (!isObject(from.properties)) return
    if (Object.hasOwn(into, 'properties') && !isObject(into.properties)) return
    const restored = new Set()
    for (const [name, property] of Object.entries(from.properties)) {
      if (!isObject(property) || property['x-internal'] !== true) continue
      if (isObject(into.properties) && Object.hasOwn(into.properties, name)) continue
      into.properties ??= {}
      into.properties[name] = clone(property)
      restored.add(name)
      pending.push(...schemaReferences(property, committedSchemas))
    }
    if (!Array.isArray(from.required)) return
    const wanted = from.required.filter((name) => restored.has(name))
    if (wanted.length === 0) return
    const present = Array.isArray(into.required) ? into.required : []
    into.required = [
      ...from.required.filter((name) => restored.has(name) || present.includes(name)),
      ...present.filter((name) => !from.required.includes(name)),
    ]
  }

  function walk(from, into) {
    if (Array.isArray(from) && Array.isArray(into)) {
      from.forEach((item, index) => {
        if (index < into.length) walk(item, into[index])
      })
    } else if (isObject(from) && isObject(into)) {
      restoreProperties(from, into)
      for (const key of Object.keys(from)) {
        if (!Object.hasOwn(into, key)) continue
        if (key === 'properties' && isObject(from.properties) && isObject(into.properties)) {
          // A map of schemas: walk each one, not the map as if it were a schema.
          for (const name of Object.keys(from.properties)) {
            if (!Object.hasOwn(into.properties, name)) continue
            walk(from.properties[name], into.properties[name])
          }
        } else {
          walk(from[key], into[key])
        }
      }
    }
  }

  for (const name of Object.keys(committedSchemas)) {
    if (Object.hasOwn(schemas, name)) walk(committedSchemas[name], schemas[name])
  }
  copyCommittedSchemas(document, committed, pending)
}

/**
 * A Platform API appends a tag holding only a `name` for every operation tag the
 * spec does not declare. Those entries carry nothing the SDK keeps: drop them.
 * A declared tag (any other key) stays.
 */
function dropUndeclaredTags(document) {
  if (!Array.isArray(document.tags)) return
  const declared = document.tags.filter(
    (tag) => !isObject(tag) || Object.keys(tag).some((key) => key !== 'name'),
  )
  if (declared.length === document.tags.length) return
  if (declared.length === 0) delete document.tags
  else document.tags = declared
}

/**
 * A Platform API puts its own URL first as an entry holding only a `url`, and
 * drops the declared entry with that URL. Use the committed entry with the same
 * URL for such an entry. Order the result as the committed list orders the URLs
 * both have, then the input's other entries in the input's order. A URL the input
 * no longer lists goes.
 */
function restoreServers(document, committed) {
  if (!Array.isArray(document.servers) || !Array.isArray(committed.servers)) return
  const committedEntries = committed.servers.filter(
    (server) => isObject(server) && typeof server.url === 'string',
  )
  const committedUrls = committedEntries.map((server) => server.url)
  const resolved = document.servers.map((server) => {
    if (!isObject(server) || typeof server.url !== 'string') return server
    if (Object.keys(server).length !== 1) return server
    const declared = committedEntries.find((entry) => entry.url === server.url)
    return declared ? clone(declared) : server
  })
  const urlOf = (server) => (isObject(server) ? server.url : undefined)
  const inInput = new Set(resolved.map(urlOf))
  const shared = committedUrls.filter((url) => inInput.has(url))
  const ordered = []
  for (const url of shared) {
    const entry = resolved.find((server) => urlOf(server) === url)
    if (!ordered.includes(entry)) ordered.push(entry)
  }
  document.servers = [...ordered, ...resolved.filter((server) => !ordered.includes(server))]
}

/**
 * Derive the publishable contract without modifying the canonical input.
 * Retain independently exported schemas; prune only dependencies exclusive to
 * excluded operations. A shared or recursive schema must never become dangling.
 * `committed` is the SDK's public spec. Given it, the projection also accepts the
 * document a deployed Platform API serves, which differs from the full spec in
 * more than the operations it leaves out: it restores the published compatibility
 * operations, the schema properties the committed spec marks `x-internal`, and the
 * declared `servers` entries, and drops the name-only `tags` entries.
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
    restoreInternalFields(document, committed)
    dropUndeclaredTags(document)
    restoreServers(document, committed)
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
