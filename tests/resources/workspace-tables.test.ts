import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('WorkspaceTablesResource', () => {
  it('list calls GET /tables', async () => {
    const { client, requests } = recordRoutes(200)
    await client.workspaceTables.list()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/tables`)
  })

  it('create calls POST /tables', async () => {
    const { client, requests } = recordRoutes(200)
    await client.workspaceTables.create({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/tables`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('get calls GET /tables/{table_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.workspaceTables.get('table_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/tables/table_id-1`)
  })

  it('update calls PATCH /tables/{table_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.workspaceTables.update('table_id-1', { probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('PATCH')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/tables/table_id-1`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })

  it('delete calls DELETE /tables/{table_id}', async () => {
    const { client, requests } = recordRoutes(200)
    await client.workspaceTables.delete('table_id-1')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('DELETE')
    expect(requests[0]?.pathname).toBe(`/v1/$WORKSPACE-1/tables/table_id-1`)
  })
})
