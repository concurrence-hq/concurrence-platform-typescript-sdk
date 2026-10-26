import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import {
  ConflictError,
  NotFoundError,
  PermissionError,
  ValidationError,
} from '../../src/core/errors.js'
import {
  CREATE_SET_BODY,
  NEXT_VERSION_BODY,
  OTHER_SET_ID,
  SET_FIXTURE,
  SET_ID,
  UPDATE_SET_BODY,
  USAGE_ITEM_FIXTURE,
  VERSION_FIXTURE,
  WORKSPACE_ID,
} from '../helpers/dynamic-behavior-fixtures.js'

const BASE = `/v1/${WORKSPACE_ID}/dynamic-behavior-sets`

interface Recorded {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
}

type Responder = (request: Recorded) => Response

function recordingClient(respond: Responder) {
  const requests: Recorded[] = []
  const client = new AmigoClient({
    apiKey: 'test-api-key-abc123',
    workspaceId: WORKSPACE_ID,
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const url = new URL(request.url)
      const text = await request.clone().text()
      const recorded: Recorded = {
        method: request.method,
        path: url.pathname,
        query: url.searchParams,
        body: text ? JSON.parse(text) : undefined,
      }
      requests.push(recorded)
      return respond(recorded)
    },
  })
  return { client, requests }
}

describe('DynamicBehaviorSetsResource', () => {
  describe('list', () => {
    it('lists sets with no query by default', async () => {
      const { client, requests } = recordingClient(() =>
        Response.json({ items: [SET_FIXTURE], has_more: false, continuation_token: null }),
      )

      const page = await client.dynamicBehaviorSets.list()

      expect(page.items).toEqual([SET_FIXTURE])
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({ method: 'GET', path: BASE })
      expect(requests[0]?.query.toString()).toBe('')
    })

    it('sends every filter, repeated sort keys and the page token', async () => {
      const { client, requests } = recordingClient(() =>
        Response.json({ items: [], has_more: false, continuation_token: null }),
      )

      await client.dynamicBehaviorSets.list({
        q: 'bill',
        tag: 'billing',
        archived: true,
        service_id: OTHER_SET_ID,
        sort_by: ['+name', '-updated_at'],
        limit: 20,
        continuation_token: 40,
      })

      const query = requests[0]!.query
      expect(query.get('q')).toBe('bill')
      expect(query.get('tag')).toBe('billing')
      expect(query.get('archived')).toBe('true')
      expect(query.get('service_id')).toBe(OTHER_SET_ID)
      expect(query.getAll('sort_by')).toEqual(['+name', '-updated_at'])
      expect(query.get('limit')).toBe('20')
      expect(query.get('continuation_token')).toBe('40')
      // The plus sign has to reach the server as %2B or it reads as a space.
      expect(requests[0]!.query.toString()).toContain('sort_by=%2Bname')
    })

    it('returns an empty page as it is, with no next page', async () => {
      const { client } = recordingClient(() =>
        Response.json({ items: [], has_more: false, continuation_token: null }),
      )

      const page = await client.dynamicBehaviorSets.list()

      expect(page).toMatchObject({ items: [], has_more: false, continuation_token: null })
    })

    it('stops listAutoPaging at the last page, in two requests and no more', async () => {
      const { client, requests } = recordingClient(({ query }) =>
        query.get('continuation_token') === '1'
          ? Response.json({ items: [SET_FIXTURE], has_more: false, continuation_token: null })
          : Response.json({ items: [SET_FIXTURE], has_more: true, continuation_token: 1 }),
      )

      const ids: string[] = []
      for await (const set of client.dynamicBehaviorSets.listAutoPaging()) {
        ids.push(set.id)
        // A pager that dropped its token would see the same first page forever.
        if (ids.length > 4) break
      }
      const seen = ids.length

      expect(seen).toBe(2)
      expect(requests).toHaveLength(2)
    })

    it('follows continuation tokens across pages with listAutoPaging', async () => {
      const second = { ...SET_FIXTURE, id: OTHER_SET_ID, name: 'Scheduling' }
      const { client, requests } = recordingClient(({ query }) =>
        query.get('continuation_token') === '1'
          ? Response.json({ items: [second], has_more: false, continuation_token: null })
          : Response.json({ items: [SET_FIXTURE], has_more: true, continuation_token: 1 }),
      )

      const seen: string[] = []
      for await (const set of client.dynamicBehaviorSets.listAutoPaging({ limit: 1, tag: 'x' })) {
        seen.push(set.id)
      }

      expect(seen).toEqual([SET_ID, OTHER_SET_ID])
      expect(requests.map(({ query }) => query.get('continuation_token'))).toEqual([null, '1'])
      expect(requests.map(({ query }) => query.get('tag'))).toEqual(['x', 'x'])
      expect(requests.map(({ query }) => query.get('limit'))).toEqual(['1', '1'])
    })

    it('throws ValidationError with the API body on a 422', async () => {
      const body = {
        detail: [{ loc: ['query', 'sort_by'], msg: 'Unsupported sort_by', type: 'value_error' }],
      }
      const { client } = recordingClient(() => Response.json(body, { status: 422 }))

      const error = await client.dynamicBehaviorSets.list({ sort_by: ['name'] }).catch((e) => e)

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.statusCode).toBe(422)
      expect(error.errorBody).toEqual(body)
    })
  })

  describe('create', () => {
    it('posts the set with its first version and returns the set', async () => {
      const { client, requests } = recordingClient(() =>
        Response.json(SET_FIXTURE, { status: 201 }),
      )

      const created = await client.dynamicBehaviorSets.create(CREATE_SET_BODY)

      expect(created).toMatchObject(SET_FIXTURE)
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({ method: 'POST', path: BASE, body: CREATE_SET_BODY })
    })

    it('throws ConflictError with the API body when the name is taken', async () => {
      const body = {
        detail: "A dynamic behavior set named 'Billing questions' already exists in this workspace",
      }
      const { client } = recordingClient(() => Response.json(body, { status: 409 }))

      const error = await client.dynamicBehaviorSets.create(CREATE_SET_BODY).catch((e) => e)

      expect(error).toBeInstanceOf(ConflictError)
      expect(error.statusCode).toBe(409)
      expect(error.errorBody).toEqual(body)
    })

    it('throws PermissionError when a workspace key sets the id', async () => {
      const body = { detail: "Setting a dynamic behavior set's id requires platform:admin scope" }
      const { client } = recordingClient(() => Response.json(body, { status: 403 }))

      const error = await client.dynamicBehaviorSets
        .create({ ...CREATE_SET_BODY, id: OTHER_SET_ID })
        .catch((e) => e)

      expect(error).toBeInstanceOf(PermissionError)
      expect(error.errorBody).toEqual(body)
    })

    it('throws ValidationError with the API body on a 422', async () => {
      const body = {
        detail: [{ loc: ['body', 'name'], msg: 'String should have at least 1 character' }],
      }
      const { client } = recordingClient(() => Response.json(body, { status: 422 }))

      const error = await client.dynamicBehaviorSets
        .create({ ...CREATE_SET_BODY, name: '' })
        .catch((e) => e)

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.errorBody).toEqual(body)
    })
  })

  describe('get', () => {
    it('gets a set by id', async () => {
      const { client, requests } = recordingClient(() => Response.json(SET_FIXTURE))

      const set = await client.dynamicBehaviorSets.get(SET_ID)

      expect(set).toMatchObject(SET_FIXTURE)
      expect(requests[0]).toMatchObject({ method: 'GET', path: `${BASE}/${SET_ID}` })
    })
  })

  describe('not found', () => {
    const body = { detail: 'Dynamic behavior set not found' }

    it('throws NotFoundError with the API body from get, getVersion and usage', async () => {
      const { client } = recordingClient(() => Response.json(body, { status: 404 }))

      for (const call of [
        () => client.dynamicBehaviorSets.get(SET_ID),
        () => client.dynamicBehaviorSets.getVersion(SET_ID, 9),
        () => client.dynamicBehaviorSets.usage(SET_ID),
      ]) {
        const error = await call().catch((e) => e)
        expect(error).toBeInstanceOf(NotFoundError)
        expect(error.statusCode).toBe(404)
        expect(error.errorBody).toEqual(body)
      }
    })
  })

  describe('update', () => {
    it('patches the name and tags', async () => {
      const { client, requests } = recordingClient(() =>
        Response.json({ ...SET_FIXTURE, ...UPDATE_SET_BODY }),
      )

      const updated = await client.dynamicBehaviorSets.update(SET_ID, UPDATE_SET_BODY)

      expect(updated.name).toBe('Billing and payments')
      expect(requests[0]).toMatchObject({
        method: 'PATCH',
        path: `${BASE}/${SET_ID}`,
        body: UPDATE_SET_BODY,
      })
    })

    it('archives and restores through the archived flag', async () => {
      const archivedAt = '2026-10-26T15:00:00Z'
      const { client, requests } = recordingClient(({ body }) =>
        Response.json({
          ...SET_FIXTURE,
          archived_at: (body as { archived: boolean }).archived ? archivedAt : null,
        }),
      )

      const archived = await client.dynamicBehaviorSets.update(SET_ID, { archived: true })
      const restored = await client.dynamicBehaviorSets.update(SET_ID, { archived: false })

      expect(archived.archived_at).toBe(archivedAt)
      expect(restored.archived_at).toBeNull()
      expect(requests.map(({ body }) => body)).toEqual([{ archived: true }, { archived: false }])
    })

    it('throws ConflictError with the API body when a version set still pins the set', async () => {
      const body = {
        detail:
          'Cannot archive a dynamic behavior set that version sets pin. Unpin it from: Front Desk Line (release)',
      }
      const { client } = recordingClient(() => Response.json(body, { status: 409 }))

      const error = await client.dynamicBehaviorSets
        .update(SET_ID, { archived: true })
        .catch((e) => e)

      expect(error).toBeInstanceOf(ConflictError)
      expect(error.errorBody).toEqual(body)
    })

    it('throws ValidationError on a 422', async () => {
      const { client } = recordingClient(() =>
        Response.json({ detail: [{ loc: ['body', 'tags'], msg: 'too long' }] }, { status: 422 }),
      )

      await expect(client.dynamicBehaviorSets.update(SET_ID, { tags: [] })).rejects.toBeInstanceOf(
        ValidationError,
      )
    })
  })

  describe('createVersion', () => {
    it('posts the version with expected_latest_version in the query', async () => {
      const { client, requests } = recordingClient(() =>
        Response.json(VERSION_FIXTURE, { status: 201 }),
      )

      const version = await client.dynamicBehaviorSets.createVersion(SET_ID, NEXT_VERSION_BODY, {
        expectedLatestVersion: 1,
      })

      expect(version).toMatchObject(VERSION_FIXTURE)
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({
        method: 'POST',
        path: `${BASE}/${SET_ID}/versions`,
        body: NEXT_VERSION_BODY,
      })
      expect(requests[0]!.query.toString()).toBe('expected_latest_version=1')
    })

    it('throws ConflictError with the API body intact on a lost race', async () => {
      const body = {
        detail:
          'Dynamic behavior set is at version 3; this write expected 2. Reload and apply the change to version 3.',
      }
      const { client, requests } = recordingClient(() => Response.json(body, { status: 409 }))

      const error = await client.dynamicBehaviorSets
        .createVersion(SET_ID, NEXT_VERSION_BODY, { expectedLatestVersion: 2 })
        .catch((e) => e)

      expect(error).toBeInstanceOf(ConflictError)
      expect(error.statusCode).toBe(409)
      expect(error.errorBody).toEqual(body)
      expect(error.rawBody).toBe(JSON.stringify(body))
      // The SDK does not retry a lost race: the caller has to re-read and decide.
      expect(requests).toHaveLength(1)
    })

    it('throws ValidationError with the API body on a 422', async () => {
      const body = {
        detail: [{ loc: ['body', 'instruction'], msg: 'replace mode needs an instruction' }],
      }
      const { client } = recordingClient(() => Response.json(body, { status: 422 }))

      const error = await client.dynamicBehaviorSets
        .createVersion(SET_ID, { condition: 'x', mode: 'replace' }, { expectedLatestVersion: 1 })
        .catch((e) => e)

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.errorBody).toEqual(body)
    })

    it('throws PermissionError for a replace-mode version without platform:admin', async () => {
      const body = {
        detail: 'Authoring a replace-mode dynamic behavior requires platform:admin scope',
      }
      const { client } = recordingClient(() => Response.json(body, { status: 403 }))

      const error = await client.dynamicBehaviorSets
        .createVersion(
          SET_ID,
          { condition: 'x', mode: 'replace', instruction: 'y' },
          { expectedLatestVersion: 1 },
        )
        .catch((e) => e)

      expect(error).toBeInstanceOf(PermissionError)
      expect(error.errorBody).toEqual(body)
    })
  })

  describe('versions', () => {
    it('lists versions newest first and passes the page query', async () => {
      const { client, requests } = recordingClient(() =>
        Response.json({ items: [VERSION_FIXTURE], has_more: false, continuation_token: null }),
      )

      const page = await client.dynamicBehaviorSets.listVersions(SET_ID, {
        limit: 1,
        continuation_token: 1,
      })

      expect(page.items).toEqual([VERSION_FIXTURE])
      expect(requests[0]).toMatchObject({ method: 'GET', path: `${BASE}/${SET_ID}/versions` })
      expect(requests[0]!.query.get('limit')).toBe('1')
      expect(requests[0]!.query.get('continuation_token')).toBe('1')
    })

    it('follows continuation tokens with listVersionsAutoPaging', async () => {
      const { client, requests } = recordingClient(({ query }) =>
        query.get('continuation_token') === '1'
          ? Response.json({
              items: [{ ...VERSION_FIXTURE, version: 1 }],
              has_more: false,
              continuation_token: null,
            })
          : Response.json({ items: [VERSION_FIXTURE], has_more: true, continuation_token: 1 }),
      )

      const versions: number[] = []
      for await (const version of client.dynamicBehaviorSets.listVersionsAutoPaging(SET_ID, {
        limit: 1,
      })) {
        versions.push(version.version)
      }

      expect(versions).toEqual([2, 1])
      expect(requests.map(({ path }) => path)).toEqual([
        `${BASE}/${SET_ID}/versions`,
        `${BASE}/${SET_ID}/versions`,
      ])
    })

    it('returns an empty versions page as it is', async () => {
      const { client } = recordingClient(() =>
        Response.json({ items: [], has_more: false, continuation_token: null }),
      )

      const page = await client.dynamicBehaviorSets.listVersions(SET_ID)

      expect(page).toMatchObject({ items: [], has_more: false, continuation_token: null })
    })

    it('gets one version by number', async () => {
      const { client, requests } = recordingClient(() => Response.json(VERSION_FIXTURE))

      const version = await client.dynamicBehaviorSets.getVersion(SET_ID, 2)

      expect(version).toMatchObject(VERSION_FIXTURE)
      expect(requests[0]).toMatchObject({
        method: 'GET',
        path: `${BASE}/${SET_ID}/versions/2`,
      })
    })
  })

  describe('usage', () => {
    it('lists the services whose version sets pin the set', async () => {
      const { client, requests } = recordingClient(() =>
        Response.json({ items: [USAGE_ITEM_FIXTURE], has_more: false, continuation_token: null }),
      )

      const page = await client.dynamicBehaviorSets.usage(SET_ID, { limit: 10 })

      expect(page.items).toEqual([USAGE_ITEM_FIXTURE])
      expect(requests[0]).toMatchObject({ method: 'GET', path: `${BASE}/${SET_ID}/usage` })
      expect(requests[0]!.query.get('limit')).toBe('10')
    })

    it('returns an empty usage page as it is, and usageAutoPaging yields nothing', async () => {
      const { client, requests } = recordingClient(() =>
        Response.json({ items: [], has_more: false, continuation_token: null }),
      )

      const page = await client.dynamicBehaviorSets.usage(SET_ID)
      const names: string[] = []
      for await (const service of client.dynamicBehaviorSets.usageAutoPaging(SET_ID)) {
        names.push(service.name)
      }

      expect(page.items).toEqual([])
      expect(names).toEqual([])
      expect(requests).toHaveLength(2)
    })

    it('follows continuation tokens with usageAutoPaging', async () => {
      const second = { ...USAGE_ITEM_FIXTURE, id: OTHER_SET_ID, name: 'Scheduling Line' }
      const { client, requests } = recordingClient(({ query }) =>
        query.get('continuation_token') === '1'
          ? Response.json({ items: [second], has_more: false, continuation_token: null })
          : Response.json({ items: [USAGE_ITEM_FIXTURE], has_more: true, continuation_token: 1 }),
      )

      const names: string[] = []
      for await (const service of client.dynamicBehaviorSets.usageAutoPaging(SET_ID, {
        limit: 1,
      })) {
        names.push(service.name)
      }

      expect(names).toEqual(['Front Desk Line', 'Scheduling Line'])
      expect(requests.map(({ query }) => query.get('continuation_token'))).toEqual([null, '1'])
    })
  })

  it('keeps scoped request options through withOptions', async () => {
    const seen: (string | null)[] = []
    const client = new AmigoClient({
      apiKey: 'test-api-key-abc123',
      workspaceId: WORKSPACE_ID,
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init)
        seen.push(request.headers.get('x-trace'))
        return Response.json(SET_FIXTURE)
      },
    })

    await client.dynamicBehaviorSets.withOptions({ headers: { 'x-trace': 'abc' } }).get(SET_ID)

    expect(seen).toEqual(['abc'])
  })
})
