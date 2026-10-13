import { describe, expect, it } from 'vitest'
import {
  AmigoClient,
  ConflictError,
  NotFoundError,
  type IntakeBatch,
  type IntakeBatchDetail,
  type IntakeDataset,
  type IntakeDatasetUpdateRun,
  type IntakeFile,
  type IntakeMaterialization,
  type IntakeSource,
  type RegisterIntakeSchemaRequest,
  type RegisterIntakeSourceRequest,
} from '../../src/index.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const BASE = `/v1/${TEST_WORKSPACE_ID}/intake`
const FILE_ID = '00000000-0000-0000-0000-0000000000f1'
const DOCUMENT_ID = '00000000-0000-0000-0000-0000000000d1'
const SOURCE_ID = '00000000-0000-0000-0000-0000000000a1'
const BATCH_ID = '00000000-0000-0000-0000-0000000000b1'
const RUN_ID = '00000000-0000-0000-0000-0000000000e1'

const FILE = {
  id: FILE_ID,
  dataset: 'clinical-notes',
  filename: 'visit.pdf',
  size_bytes: 1024,
  status: 'received',
  ingested_at: '2026-10-11T18:00:00Z',
  document_id: DOCUMENT_ID,
  version: 1,
  doc_metadata: { patient_id: 'p-1' },
} satisfies IntakeFile

const DATASET = {
  name: 'clinical-notes',
  schema_version: 'v1',
  field_count: 0,
  file_type: 'pdf',
  accepted_file_types: ['pdf', 'docx'],
  ingestion_mode: 'document',
  limits: { max_size_mb: 25 },
} satisfies IntakeDataset

const UPDATE_RUN = {
  run_id: RUN_ID,
  dataset: 'clinical-notes',
  status: 'checking_drive',
  source_ids: [SOURCE_ID],
  batch_ids: [],
  materialize_run_id: null,
  error: null,
  created_at: '2026-10-11T18:00:00Z',
  updated_at: '2026-10-11T18:00:00Z',
  completed_at: null,
} satisfies IntakeDatasetUpdateRun

const SOURCE = {
  id: SOURCE_ID,
  source_type: 'google_shared_drive',
  display_name: 'Clinic drive',
  drive_id: null,
  folders: [{ folder_id: 'folder-1', dataset: 'clinical-notes', contains_phi: true }],
  status: 'active',
  created_ts: '2026-10-11T18:00:00Z',
} satisfies IntakeSource

const BATCH = {
  id: BATCH_ID,
  source_id: SOURCE_ID,
  dataset: 'clinical-notes',
  status: 'ready',
  files_found: 1,
  created_ts: '2026-10-11T18:00:00Z',
} satisfies IntakeBatch

const MATERIALIZATION = {
  dataset: 'claims',
  ingestion_mode: 'snapshot',
  status: 'materialized',
  row_count: 42,
  last_materialized_at: '2026-10-11T18:00:00Z',
} satisfies IntakeMaterialization

type Route = (request: Request) => Response | Promise<Response>

function recordingClient(routes: Record<string, Route>) {
  const requests: Request[] = []
  const client = new AmigoClient({
    apiKey: TEST_API_KEY,
    workspaceId: TEST_WORKSPACE_ID,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const { pathname } = new URL(request.url)
      const route = routes[`${request.method} ${pathname}`]
      if (!route) {
        return Response.json(
          { detail: `No mock for ${request.method} ${pathname}` },
          { status: 500 },
        )
      }
      requests.push(request.clone())
      return route(request)
    },
  })
  return { client, requests }
}

function only(requests: Request[]): Request {
  expect(requests).toHaveLength(1)
  return requests[0]!
}

function page<T>(items: T[], continuationToken: number | null = null) {
  return { items, has_more: continuationToken !== null, continuation_token: continuationToken }
}

describe('IntakeResource files', () => {
  it('lists files with every filter and the continuation token', async () => {
    const { client, requests } = recordingClient({
      [`GET ${BASE}/files`]: () => Response.json(page([FILE], 50)),
    })

    const result = await client.intake.files.list({
      limit: 50,
      continuation_token: 50,
      sort_by: '-ingested_at',
      status: 'received',
      search: 'visit',
      include_withdrawn: true,
    })
    const query = new URL(only(requests).url).searchParams

    expect(Object.fromEntries(query)).toEqual({
      limit: '50',
      continuation_token: '50',
      sort_by: '-ingested_at',
      status: 'received',
      search: 'visit',
      include_withdrawn: 'true',
    })
    expect(result.items[0]?.filename).toBe('visit.pdf')
    expect(result.continuation_token).toBe(50)
  })

  it('auto-pages files by round-tripping continuation_token', async () => {
    const second = { ...FILE, id: '00000000-0000-0000-0000-0000000000f2', filename: 'labs.pdf' }
    const { client, requests } = recordingClient({
      [`GET ${BASE}/files`]: (request) =>
        new URL(request.url).searchParams.get('continuation_token') === '1'
          ? Response.json(page([second]))
          : Response.json(page([FILE], 1)),
    })

    const names: string[] = []
    for await (const file of client.intake.files.listAutoPaging({ limit: 1, status: 'received' })) {
      names.push(file.filename)
    }

    expect(names).toEqual(['visit.pdf', 'labs.pdf'])
    expect(requests.map((r) => new URL(r.url).search)).toEqual([
      '?limit=1&status=received',
      '?limit=1&status=received&continuation_token=1',
    ])
  })

  it('uploads a File as multipart form data with its own name and JSON-encoded tags', async () => {
    const { client, requests } = recordingClient({
      [`POST ${BASE}/files`]: () => Response.json(FILE, { status: 201 }),
    })

    const result = await client.intake.files.upload({
      dataset: 'clinical-notes',
      file: new File(['%PDF-1.7 visit'], 'visit.pdf', { type: 'application/pdf' }),
      doc_metadata: { patient_id: 'p-1' },
    })
    const request = only(requests)
    const form = await request.formData()
    const file = form.get('file')

    expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/)
    expect(form.get('dataset')).toBe('clinical-notes')
    expect(file).toBeInstanceOf(File)
    expect((file as File).name).toBe('visit.pdf')
    expect((file as File).type).toBe('application/pdf')
    expect(await (file as File).text()).toBe('%PDF-1.7 visit')
    expect(form.get('doc_metadata')).toBe('{"patient_id":"p-1"}')
    expect(form.has('document_id')).toBe(false)
    expect(result.id).toBe(FILE_ID)
  })

  it('uploads a Blob under the given filename as a new version of a document', async () => {
    const { client, requests } = recordingClient({
      [`POST ${BASE}/files`]: () => Response.json({ ...FILE, version: 2 }, { status: 201 }),
    })

    const result = await client.intake.files.upload({
      dataset: 'clinical-notes',
      file: new Blob(['second version'], { type: 'application/pdf' }),
      filename: 'visit-v2.pdf',
      document_id: DOCUMENT_ID,
    })
    const form = await only(requests).formData()

    expect((form.get('file') as File).name).toBe('visit-v2.pdf')
    expect(form.get('document_id')).toBe(DOCUMENT_ID)
    expect(form.has('doc_metadata')).toBe(false)
    expect(result.version).toBe(2)
  })

  it('downloads a file as a Blob with its content type', async () => {
    const { client } = recordingClient({
      [`GET ${BASE}/files/${FILE_ID}/download`]: () =>
        new Response('%PDF-1.7 visit', {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="visit.pdf"',
          },
        }),
    })

    const blob = await client.intake.files.download(FILE_ID)

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
    expect(await blob.text()).toBe('%PDF-1.7 visit')
  })

  it('throws NotFoundError when a download names a missing file', async () => {
    const { client } = recordingClient({
      [`GET ${BASE}/files/${FILE_ID}/download`]: () =>
        Response.json({ detail: 'File not found' }, { status: 404 }),
    })

    await expect(client.intake.files.download(FILE_ID)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('IntakeResource datasets', () => {
  it('lists datasets with search and sort', async () => {
    const { client, requests } = recordingClient({
      [`GET ${BASE}/datasets`]: () => Response.json(page([DATASET])),
    })

    const result = await client.intake.datasets.list({ search: 'notes', sort_by: '-name' })

    expect(Object.fromEntries(new URL(only(requests).url).searchParams)).toEqual({
      search: 'notes',
      sort_by: '-name',
    })
    expect(result.items[0]?.accepted_file_types).toEqual(['pdf', 'docx'])
  })

  it('registers a schema and throws ConflictError for a taken name', async () => {
    const body = {
      name: 'clinical-notes',
      file_type: 'pdf',
      accepted_file_types: ['pdf', 'docx'],
    } satisfies RegisterIntakeSchemaRequest
    const { client, requests } = recordingClient({
      [`POST ${BASE}/schema/register`]: async (request) => {
        const sent = (await request.json()) as RegisterIntakeSchemaRequest
        return sent.name === 'clinical-notes'
          ? Response.json(DATASET, { status: 201 })
          : Response.json({ detail: "A schema named 'claims' already exists" }, { status: 409 })
      },
    })

    const dataset = await client.intake.datasets.registerSchema(body)

    expect(await only(requests).json()).toEqual(body)
    expect(dataset.name).toBe('clinical-notes')
    await expect(
      client.intake.datasets.registerSchema({ name: 'claims', file_type: 'csv' }),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('starts a dataset update and reads the run back', async () => {
    const { client, requests } = recordingClient({
      [`POST ${BASE}/datasets/clinical-notes/update`]: () =>
        Response.json(UPDATE_RUN, { status: 202 }),
      [`GET ${BASE}/update-runs/${RUN_ID}`]: () =>
        Response.json({ ...UPDATE_RUN, status: 'completed', completed_at: '2026-10-11T18:05:00Z' }),
    })

    const started = await client.intake.datasets.startUpdate('clinical-notes')
    const finished = await client.intake.datasets.getUpdateRun(started.run_id)

    expect(started.status).toBe('checking_drive')
    expect(finished.status).toBe('completed')
    expect(requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      `POST ${BASE}/datasets/clinical-notes/update`,
      `GET ${BASE}/update-runs/${RUN_ID}`,
    ])
    expect(requests[0]?.body).toBeNull()
  })
})

describe('IntakeResource sources', () => {
  it('lists, registers, syncs and deletes a source', async () => {
    const body = {
      display_name: 'Clinic drive',
      folders: [{ folder_id: 'folder-1', dataset: 'clinical-notes' }],
      impersonate_subject: 'ops@clinic.example',
    } satisfies RegisterIntakeSourceRequest
    const { client, requests } = recordingClient({
      [`GET ${BASE}/sources`]: () => Response.json(page([SOURCE])),
      [`POST ${BASE}/sources`]: () => Response.json(SOURCE, { status: 201 }),
      [`POST ${BASE}/sources/${SOURCE_ID}/sync`]: () =>
        Response.json(
          {
            batches: [
              { batch_id: BATCH_ID, dataset: 'clinical-notes', files_found: 1, status: 'ready' },
            ],
          },
          { status: 201 },
        ),
      [`DELETE ${BASE}/sources/${SOURCE_ID}`]: () => new Response(null, { status: 204 }),
    })

    const listed = await client.intake.sources.list({ limit: 10, sort_by: '-created_ts' })
    const registered = await client.intake.sources.register(body)
    const synced = await client.intake.sources.sync(SOURCE_ID)
    const deleted = await client.intake.sources.delete(SOURCE_ID)

    expect(listed.items[0]?.display_name).toBe('Clinic drive')
    expect(new URL(requests[0]!.url).search).toBe('?limit=10&sort_by=-created_ts')
    expect(await requests[1]?.json()).toEqual(body)
    expect(registered.id).toBe(SOURCE_ID)
    expect(synced.batches[0]?.batch_id).toBe(BATCH_ID)
    expect(requests[2]?.body).toBeNull()
    expect(deleted).toBeUndefined()
    expect(requests.map((r) => r.method)).toEqual(['GET', 'POST', 'POST', 'DELETE'])
  })

  it('throws ConflictError when deleting a source with a sync in progress', async () => {
    const { client } = recordingClient({
      [`DELETE ${BASE}/sources/${SOURCE_ID}`]: () =>
        Response.json({ detail: 'Source operation in progress' }, { status: 409 }),
    })

    await expect(client.intake.sources.delete(SOURCE_ID)).rejects.toBeInstanceOf(ConflictError)
  })
})

describe('IntakeResource batches', () => {
  it("lists one source's batches, gets a batch with its files, and processes it", async () => {
    const detail = { ...BATCH, files: [FILE] } satisfies IntakeBatchDetail
    const { client, requests } = recordingClient({
      [`GET ${BASE}/batches`]: () => Response.json(page([BATCH])),
      [`GET ${BASE}/batches/${BATCH_ID}`]: () => Response.json(detail),
      [`POST ${BASE}/batches/${BATCH_ID}/process`]: () =>
        Response.json({ ...BATCH, status: 'processing' }, { status: 202 }),
    })

    const listed = await client.intake.batches.list({ source_id: SOURCE_ID })
    const fetched = await client.intake.batches.get(BATCH_ID)
    const processed = await client.intake.batches.process(BATCH_ID)

    expect(new URL(requests[0]!.url).searchParams.get('source_id')).toBe(SOURCE_ID)
    expect(listed.items[0]?.files_found).toBe(1)
    expect(fetched.files?.[0]?.id).toBe(FILE_ID)
    expect(processed.status).toBe('processing')
    expect(requests[2]?.body).toBeNull()
  })

  it('throws ConflictError when processing a finished batch', async () => {
    const { client } = recordingClient({
      [`POST ${BASE}/batches/${BATCH_ID}/process`]: () =>
        Response.json({ detail: 'Batch is not processable (status=completed)' }, { status: 409 }),
    })

    await expect(client.intake.batches.process(BATCH_ID)).rejects.toBeInstanceOf(ConflictError)
  })
})

describe('IntakeResource materialization', () => {
  it('lists destination status and auto-pages it', async () => {
    const second = { ...MATERIALIZATION, dataset: 'members', status: 'not_materialized' as const }
    const { client } = recordingClient({
      [`GET ${BASE}/materializations`]: (request) =>
        new URL(request.url).searchParams.get('continuation_token') === '1'
          ? Response.json(page([second]))
          : Response.json(page([MATERIALIZATION], 1)),
    })

    const first = await client.intake.materializations.list({ limit: 1 })
    const all: string[] = []
    for await (const row of client.intake.materializations.listAutoPaging({ limit: 1 })) {
      all.push(`${row.dataset}:${row.status}`)
    }

    expect(first.items[0]?.row_count).toBe(42)
    expect(all).toEqual(['claims:materialized', 'members:not_materialized'])
  })

  it('materializes one dataset, or every dataset when called without a body', async () => {
    const { client, requests } = recordingClient({
      [`POST ${BASE}/materialize`]: () => Response.json({ run_id: 12345 }, { status: 202 }),
    })

    const scoped = await client.intake.materialize({ dataset: 'claims' })
    const everything = await client.intake.materialize()

    expect(await requests[0]?.json()).toEqual({ dataset: 'claims' })
    expect(requests[1]?.body).toBeNull()
    expect(scoped.run_id).toBe(12345)
    expect(everything.run_id).toBe(12345)
  })
})

describe('IntakeResource auto-pagers', () => {
  function twoPages<T>(first: T, second: T): Route {
    return (request) =>
      new URL(request.url).searchParams.get('continuation_token') === '1'
        ? Response.json(page([second]))
        : Response.json(page([first], 1))
  }

  it('walks every page of datasets, sources and batches from their own routes', async () => {
    const { client, requests } = recordingClient({
      [`GET ${BASE}/datasets`]: twoPages(DATASET, { ...DATASET, name: 'claims' }),
      [`GET ${BASE}/sources`]: twoPages(SOURCE, { ...SOURCE, display_name: 'Billing drive' }),
      [`GET ${BASE}/batches`]: twoPages(BATCH, { ...BATCH, dataset: 'claims' }),
    })

    const datasets: string[] = []
    for await (const dataset of client.intake.datasets.listAutoPaging()) datasets.push(dataset.name)
    const sources: string[] = []
    for await (const source of client.intake.sources.listAutoPaging()) {
      sources.push(source.display_name)
    }
    const batches: string[] = []
    for await (const batch of client.intake.batches.listAutoPaging({ source_id: SOURCE_ID })) {
      batches.push(batch.dataset)
    }

    expect(datasets).toEqual(['clinical-notes', 'claims'])
    expect(sources).toEqual(['Clinic drive', 'Billing drive'])
    expect(batches).toEqual(['clinical-notes', 'claims'])
    expect(requests.map((r) => `${new URL(r.url).pathname}${new URL(r.url).search}`)).toEqual([
      `${BASE}/datasets`,
      `${BASE}/datasets?continuation_token=1`,
      `${BASE}/sources`,
      `${BASE}/sources?continuation_token=1`,
      `${BASE}/batches?source_id=${SOURCE_ID}`,
      `${BASE}/batches?source_id=${SOURCE_ID}&continuation_token=1`,
    ])
  })
})
