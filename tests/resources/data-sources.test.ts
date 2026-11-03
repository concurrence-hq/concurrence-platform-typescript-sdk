import { describe, expect, expectTypeOf, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import type { operations } from '../../src/generated/api.js'
import type { ListDataSourcesParams } from '../../src/resources/data-sources.js'

const WORKSPACE_ID = 'ws-test'

function recordingClient() {
  const queries: URLSearchParams[] = []
  const client = new AmigoClient({
    apiKey: 'test-api-key-abc123',
    workspaceId: WORKSPACE_ID,
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      queries.push(new URL(request.url).searchParams)
      return Response.json({ items: [], has_more: false, continuation_token: null })
    },
  })
  return { client, queries }
}

describe('DataSourcesResource.list', () => {
  it('types its params from the generated list-data-sources query', () => {
    expectTypeOf<ListDataSourcesParams>().toEqualTypeOf<
      NonNullable<operations['list-data-sources']['parameters']['query']>
    >()
  })

  it('sends source_type, is_active, search and paging as the API expects', async () => {
    const { client, queries } = recordingClient()

    await client.dataSources.list({
      source_type: ['ehr', 'snowflake'],
      is_active: false,
      search: 'chart',
      limit: 5,
    })

    const query = queries[0]
    expect(query?.getAll('source_type')).toEqual(['ehr', 'snowflake'])
    expect(query?.get('is_active')).toBe('false')
    expect(query?.get('search')).toBe('chart')
    expect(query?.get('limit')).toBe('5')
  })

  it('rejects the retired type and status params at compile time', () => {
    // @ts-expect-error `type` is not a list-data-sources query param
    const withType: ListDataSourcesParams = { type: 'ehr' }
    // @ts-expect-error `status` is not a list-data-sources query param
    const withStatus: ListDataSourcesParams = { status: 'active' }
    expect([withType, withStatus]).toHaveLength(2)
  })
})
