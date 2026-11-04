import { describe, expect, it } from 'vitest'
import { recordRoutes, WORKSPACE } from '../helpers/record-routes.js'

describe('ApiKeysResource', () => {
  it('getPermissionCatalog calls GET /api-keys/permission-catalog', async () => {
    const { client, requests } = recordRoutes(200)
    await client.apiKeys.getPermissionCatalog()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/${WORKSPACE}/api-keys/permission-catalog`)
  })
})
