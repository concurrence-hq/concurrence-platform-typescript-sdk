import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'

const workspace = '635fd22d-35b1-4ea9-9118-8eda13b4b753'
const connection = 'a265c823-0016-4d15-b708-27b5c28d896b'
const configuration = '919a5b49-8cc2-4e8a-bd1e-cf6fb81406cd'
const revision = 'ec98c8f4-d346-4802-8c3d-681805cf3e03'
const result = {
  action_id: workspace,
  connection_id: connection,
  configuration_id: configuration,
  configuration_revision: revision,
}

function setup(status = 200) {
  const requests: Request[] = []
  const client = new AmigoClient({
    workspaceId: workspace,
    apiKey: 'administrator',
    baseUrl: 'https://console.example/api/platform',
    identityBaseUrl: 'https://console.example/api/identity',
    maxRetries: 0,
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init))
      return Response.json(status === 200 ? result : { detail: 'Unavailable' }, { status })
    },
  })
  return { client, requests }
}

describe('Identity lifecycle action binding', () => {
  it('saves exact configuration revisions on the scoped Platform API and returns the action ID', async () => {
    const { client, requests } = setup()
    const body = { configuration_id: configuration, configuration_revision: revision }
    expect(await client.actions.putIdentityLifecycle(connection, body)).toEqual(result)
    expect(requests[0]?.url).toBe(
      `https://console.example/api/platform/v1/${workspace}/skills/identity-lifecycle/${connection}`,
    )
    expect(requests[0]?.method).toBe('PUT')
    expect(await requests[0]?.json()).toEqual(body)
  })

  it('reads the saved action separately from directory authority', async () => {
    const { client, requests } = setup()
    expect(await client.actions.getIdentityLifecycle(connection)).toEqual(result)
    expect(requests[0]?.url).toBe(
      `https://console.example/api/platform/v1/${workspace}/skills/identity-lifecycle/${connection}`,
    )
    expect(requests[0]?.method).toBe('GET')
  })

  it.each([403, 404, 409])(
    'retains refusal status %s rather than implying a configured schedule',
    async (status) => {
      const { client } = setup(status)
      await expect(client.actions.getIdentityLifecycle(connection)).rejects.toMatchObject({
        statusCode: status,
      })
    },
  )
})
