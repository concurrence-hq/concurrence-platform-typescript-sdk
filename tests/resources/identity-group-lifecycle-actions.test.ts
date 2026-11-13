import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'

const workspace = '635fd22d-35b1-4ea9-9118-8eda13b4b753'
const connection = 'a265c823-0016-4d15-b708-27b5c28d896b'
const configuration = '919a5b49-8cc2-4e8a-bd1e-cf6fb81406cd'
const revision = 'ec98c8f4-d346-4802-8c3d-681805cf3e03'
const mapping = '606d8dda-8009-418c-af66-8bf195206fd4'
const body = {
  connection_id: connection,
  connection_revision: revision,
  configuration_id: configuration,
  configuration_revision: revision,
  mapping_revision: revision,
}
const result = {
  ...body,
  action_id: workspace,
  mapping_id: mapping,
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

describe('Identity group lifecycle action binding', () => {
  it('saves exact group and source revisions on the scoped Platform API and returns the action ID', async () => {
    const { client, requests } = setup()
    expect(await client.actions.putIdentityGroupLifecycle(mapping, body)).toEqual(result)
    expect(requests[0]?.url).toBe(
      `https://console.example/api/platform/v1/${workspace}/skills/identity-lifecycle/groups/${mapping}`,
    )
    expect(requests[0]?.method).toBe('PUT')
    expect(await requests[0]?.json()).toEqual(body)
  })

  it('reads the saved action separately from directory authority', async () => {
    const { client, requests } = setup()
    expect(await client.actions.getIdentityGroupLifecycle(mapping)).toEqual(result)
    expect(requests[0]?.url).toBe(
      `https://console.example/api/platform/v1/${workspace}/skills/identity-lifecycle/groups/${mapping}`,
    )
    expect(requests[0]?.method).toBe('GET')
  })

  it.each([
    { status: 403, operation: 'get' },
    { status: 404, operation: 'get' },
    { status: 409, operation: 'put' },
  ])('retains $operation refusal status $status', async ({ status, operation }) => {
    const { client } = setup(status)
    const request =
      operation === 'put'
        ? client.actions.putIdentityGroupLifecycle(mapping, body)
        : client.actions.getIdentityGroupLifecycle(mapping)
    await expect(request).rejects.toMatchObject({
      statusCode: status,
    })
  })
})
