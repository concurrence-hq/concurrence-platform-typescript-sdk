import { describe, expect, it } from 'vitest'
import { recordRoutes } from '../helpers/record-routes.js'

describe('WorkspacesResource', () => {
  it('getTestCredentialIds calls GET /v1/workspaces/{workspace_id}/test-credential-ids', async () => {
    const { client, requests } = recordRoutes(200)
    await client.workspaces.getTestCredentialIds()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.pathname).toBe(`/v1/workspaces/$WORKSPACE-1/test-credential-ids`)
  })

  it('updateTestCredentialIds calls PUT /v1/workspaces/{workspace_id}/test-credential-ids', async () => {
    const { client, requests } = recordRoutes(200)
    await client.workspaces.updateTestCredentialIds({ probe: 'body' } as never)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.pathname).toBe(`/v1/workspaces/$WORKSPACE-1/test-credential-ids`)
    expect(requests[0]?.body).toEqual({ probe: 'body' })
  })
})
