import { beforeEach, describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import type { components } from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

type CreateServiceRequest = components['schemas']['CreateServiceRequest']
type ServiceResponse = components['schemas']['ServiceResponse']

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

// The contract, held at compile time: a create may leave the graph out or send null, and a
// service always says which graph it binds, null when it binds none.
const createGraphIsOptional: Equal<
  Pick<CreateServiceRequest, 'context_graph_id'>,
  { context_graph_id?: string | null }
> = true
const serviceGraphIsNullable: Equal<ServiceResponse['context_graph_id'], string | null> = true

const WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const SERVICE_ID = 'svc-00000000-0000-0000-0000-000000000001'
const AGENT_ID = '11111111-1111-4111-8111-111111111111'
const GRAPH_ID = '22222222-2222-4222-8222-222222222222'
const BASE = `/v1/${WORKSPACE_ID}`

const STORED = {
  id: SERVICE_ID,
  workspace_id: WORKSPACE_ID,
  name: 'Front desk',
  description: '',
  channel_type: 'voice',
  agent_id: AGENT_ID,
  is_active: true,
  keyterms: [],
  tags: [],
  tool_capacity: 3,
  created_at: '2026-11-13T00:00:00Z',
  updated_at: '2026-11-13T00:00:00Z',
}

/** The graph the API stores for a create: the one the request names, none otherwise. */
function storedGraph(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'context_graph_id' in body) {
    return typeof body.context_graph_id === 'string' ? body.context_graph_id : null
  }
  return null
}

let createBody: unknown
let storedGraphId: string | null = null

const client = new AmigoClient({
  apiKey: 'test-api-key-abc123',
  workspaceId: WORKSPACE_ID,
  fetch: mockFetch({
    [`POST ${BASE}/services`]: ({ body }) => {
      createBody = body
      storedGraphId = storedGraph(body)
      return Response.json({ ...STORED, context_graph_id: storedGraphId }, { status: 201 })
    },
    [`GET ${BASE}/services/${SERVICE_ID}`]: () =>
      Response.json({ ...STORED, context_graph_id: storedGraphId }),
  }),
})

/** What a caller that links to the graph does with a service: nothing to link when it binds none. */
function graphLink(service: ServiceResponse): string | null {
  return service.context_graph_id === null ? null : `/context-graphs/${service.context_graph_id}`
}

describe('a service and the context graph it binds', () => {
  beforeEach(() => {
    createBody = undefined
    storedGraphId = null
  })

  it('holds the nullable graph contract at compile time', () => {
    expect(createGraphIsOptional).toBe(true)
    expect(serviceGraphIsNullable).toBe(true)
  })

  it('creates a direct service without naming a context graph', async () => {
    const body = { name: 'Front desk', agent_id: AGENT_ID } satisfies CreateServiceRequest

    const created = await client.services.create(body)

    expect(createBody).toEqual({ name: 'Front desk', agent_id: AGENT_ID })
    expect(createBody).not.toHaveProperty('context_graph_id')
    expect(created.context_graph_id).toBeNull()
    expect(graphLink(created)).toBeNull()
  })

  it('sends an explicit null for a service that binds no graph', async () => {
    const body = {
      name: 'Front desk',
      agent_id: AGENT_ID,
      context_graph_id: null,
    } satisfies CreateServiceRequest

    const created = await client.services.create(body)

    expect(createBody).toEqual({ name: 'Front desk', agent_id: AGENT_ID, context_graph_id: null })
    expect(created.context_graph_id).toBeNull()
  })

  it('creates a workflow service on the context graph it names', async () => {
    const body = {
      name: 'Front desk',
      agent_id: AGENT_ID,
      context_graph_id: GRAPH_ID,
      version_sets: { release: { agent_version_number: 2, context_graph_version_number: 5 } },
    } satisfies CreateServiceRequest

    const created = await client.services.create(body)

    expect(createBody).toEqual(body)
    expect(created.context_graph_id).toBe(GRAPH_ID)
    expect(graphLink(created)).toBe(`/context-graphs/${GRAPH_ID}`)
  })

  it('reads back which graph a service binds, null for a direct service', async () => {
    await client.services.create({ name: 'Front desk', agent_id: AGENT_ID })
    const direct = await client.services.get(SERVICE_ID)
    expect(direct.context_graph_id).toBeNull()

    await client.services.create({
      name: 'Front desk',
      agent_id: AGENT_ID,
      context_graph_id: GRAPH_ID,
    })
    const workflow = await client.services.get(SERVICE_ID)
    expect(workflow.context_graph_id).toBe(GRAPH_ID)
  })
})
