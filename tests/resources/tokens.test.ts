import { describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'

const TEST_API_KEY = 'configured-api-key'
const EXCHANGE_API_KEY = 'exchange-api-key'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const TEST_SERVICE_ID = 'svc-00000000-0000-0000-0000-000000000001'
const TEST_ENTITY_ID = 'ent-00000000-0000-0000-0000-000000000001'
const BASE_URL = 'https://platform-proxy.example'
const TOKEN_RESPONSE = {
  access_token: 'eyJhbGciOiJSUzI1NiJ9.test',
  token_type: 'Bearer',
  expires_in: 900,
  scope: 'entities:read agents:read',
  session_id: null,
  refresh_token: null,
}
const EXTERNAL_USER_TOKEN_RESPONSE = {
  access_token: 'eyJhbGciOiJSUzI1NiJ9.external-user',
  token_type: 'Bearer',
  expires_in: 1800,
  scope: 'conversations:create conversations:turns:create conversations:read',
  session_id: 'ses-00000000-0000-0000-0000-000000000001',
  refresh_token: 'rt_external_user',
  consumer_subject_id: 'sub-00000000-0000-0000-0000-000000000001',
  subject_type: 'user',
  consumer_entity_id: TEST_ENTITY_ID,
}
const REFRESH_TOKEN_RESPONSE = {
  ...TOKEN_RESPONSE,
  access_token: 'eyJhbGciOiJSUzI1NiJ9.refreshed',
  refresh_token: 'rt_new',
}

interface CapturedTokenRequest {
  href: string
  url: string
  method: string
  body: string
  contentType: string | null
  authorization: string | null
  traceId: string | null
}

function recordingFetch(captured: CapturedTokenRequest): typeof globalThis.fetch {
  return recordingFetchWithResponse(captured, TOKEN_RESPONSE)
}

function recordingFetchWithResponse(
  captured: CapturedTokenRequest,
  responseBody: unknown,
): typeof globalThis.fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)

    captured.href = request.url
    captured.url = new URL(request.url).pathname
    captured.method = request.method.toUpperCase()
    captured.body = await request.clone().text()
    captured.contentType = request.headers.get('Content-Type')
    captured.authorization = request.headers.get('Authorization')
    captured.traceId = request.headers.get('X-Trace-Id')

    return Response.json(responseBody)
  }
}

function createCapturedRequest(): CapturedTokenRequest {
  return {
    href: '',
    url: '',
    method: '',
    body: '',
    contentType: null,
    authorization: null,
    traceId: null,
  }
}

describe('TokensResource', () => {
  it('exchanges an API key for a JWT through POST /token', async () => {
    const captured = createCapturedRequest()
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      baseUrl: BASE_URL,
      fetch: recordingFetch(captured),
    })

    const result = await client.tokens.exchangeApiKey({
      apiKey: EXCHANGE_API_KEY,
      scope: 'entities:read agents:read',
    })

    expect(captured.href).toBe(`${BASE_URL}/token`)
    expect(captured.url).toBe('/token')
    expect(captured.url).not.toContain(TEST_WORKSPACE_ID)
    expect(captured.method).toBe('POST')
    expect(captured.contentType).toContain('application/x-www-form-urlencoded')
    expect(captured.authorization).toBeNull()

    const form = new URLSearchParams(captured.body)
    expect(form.get('grant_type')).toBe('api_key')
    expect(form.get('api_key')).toBe(EXCHANGE_API_KEY)
    expect(form.get('scope')).toBe('entities:read agents:read')
    expect(result).toMatchObject(TOKEN_RESPONSE)
  })

  it('preserves scoped request headers on token exchange', async () => {
    const captured = createCapturedRequest()
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: recordingFetch(captured),
    })

    await client.tokens
      .withOptions({ headers: { 'X-Trace-Id': 'trace-token-exchange' } })
      .exchangeApiKey({ apiKey: EXCHANGE_API_KEY })

    expect(captured.traceId).toBe('trace-token-exchange')
  })

  it('sends POST /token to the identity host by default, and REST calls to the platform host', async () => {
    const urls: string[] = []
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      fetch: async (input, init) => {
        const url = (input instanceof Request ? input : new Request(input, init)).url
        urls.push(url)
        return url.endsWith('/token')
          ? Response.json(TOKEN_RESPONSE)
          : Response.json({ items: [], has_more: false, continuation_token: null })
      },
    })

    await client.tokens.exchangeApiKey({ apiKey: EXCHANGE_API_KEY })
    await client.agents.list()

    expect(urls).toEqual([
      'https://identity.api-us.concurrence.com/token',
      `https://platform.api-us.concurrence.com/v1/${TEST_WORKSPACE_ID}/agents`,
    ])
  })

  it('sends POST /token to identityBaseUrl over baseUrl', async () => {
    const captured = createCapturedRequest()
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      baseUrl: 'https://platform.api-eu.concurrence.com',
      identityBaseUrl: 'https://identity.api-eu.concurrence.com/',
      fetch: recordingFetchWithResponse(captured, REFRESH_TOKEN_RESPONSE),
    })

    await client.tokens.refresh({ refreshToken: 'rt_old' })

    expect(captured.href).toBe('https://identity.api-eu.concurrence.com/token')
  })

  it('keeps identityBaseUrl through client and resource withOptions', async () => {
    const captured = createCapturedRequest()
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      baseUrl: BASE_URL,
      identityBaseUrl: 'https://identity.example',
      fetch: recordingFetch(captured),
    })

    await client
      .withOptions({ headers: { 'X-Trace-Id': 'client-scope' } })
      .tokens.exchangeApiKey({ apiKey: EXCHANGE_API_KEY })
    expect(captured.href).toBe('https://identity.example/token')
    expect(captured.traceId).toBe('client-scope')

    await client.tokens
      .withOptions({ headers: { 'X-Trace-Id': 'resource-scope' } })
      .exchangeApiKey({ apiKey: EXCHANGE_API_KEY })
    expect(captured.href).toBe('https://identity.example/token')
    expect(captured.traceId).toBe('resource-scope')
  })

  it('exchanges client credentials without forwarding configured Authorization', async () => {
    const captured = createCapturedRequest()
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      baseUrl: BASE_URL,
      fetch: recordingFetch(captured),
    })

    await client.tokens.exchangeClientCredentials({
      clientId: 'ext-client-id',
      clientSecret: 'ext-client-secret',
      scope: 'external_user_sessions:create',
    })

    expect(captured.href).toBe(`${BASE_URL}/token`)
    expect(captured.authorization).toBeNull()

    const form = new URLSearchParams(captured.body)
    expect(form.get('grant_type')).toBe('client_credentials')
    expect(form.get('client_id')).toBe('ext-client-id')
    expect(form.get('client_secret')).toBe('ext-client-secret')
    expect(form.get('scope')).toBe('external_user_sessions:create')
  })

  it('mints an external-user session with parent bearer auth and workspace binding', async () => {
    const captured = createCapturedRequest()
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      baseUrl: BASE_URL,
      fetch: recordingFetchWithResponse(captured, EXTERNAL_USER_TOKEN_RESPONSE),
    })

    const result = await client.tokens.createExternalUserSession({
      parentAccessToken: 'parent-jwt',
      externalSubjectKey: 'customer-user-123',
      subjectType: 'user',
      serviceId: TEST_SERVICE_ID,
      consumerEntityId: TEST_ENTITY_ID,
      ttlSeconds: 1800,
      scope: 'conversations:create conversations:turns:create',
    })

    expect(captured.href).toBe(`${BASE_URL}/token`)
    expect(captured.authorization).toBe('Bearer parent-jwt')

    const form = new URLSearchParams(captured.body)
    expect(form.get('grant_type')).toBe('external_user_session')
    expect(form.get('workspace_id')).toBe(TEST_WORKSPACE_ID)
    expect(form.get('external_subject_key')).toBe('customer-user-123')
    expect(form.get('subject_type')).toBe('user')
    expect(form.get('service_id')).toBe(TEST_SERVICE_ID)
    expect(form.get('consumer_entity_id')).toBe(TEST_ENTITY_ID)
    expect(form.get('ttl_seconds')).toBe('1800')
    expect(form.get('scope')).toBe('conversations:create conversations:turns:create')
    expect(result.access_token).toBe(EXTERNAL_USER_TOKEN_RESPONSE.access_token)
    expect(result.session_id).toBe(EXTERNAL_USER_TOKEN_RESPONSE.session_id)
    expect(result.refresh_token).toBe(EXTERNAL_USER_TOKEN_RESPONSE.refresh_token)
    expect(result.consumer_subject_id).toBe(EXTERNAL_USER_TOKEN_RESPONSE.consumer_subject_id)
  })

  it('uses the configured bearer token when no parentAccessToken override is provided', async () => {
    const captured = createCapturedRequest()
    const client = new AmigoClient({
      apiKey: 'configured-parent-jwt',
      workspaceId: TEST_WORKSPACE_ID,
      baseUrl: BASE_URL,
      fetch: recordingFetchWithResponse(captured, EXTERNAL_USER_TOKEN_RESPONSE),
    })

    await client.tokens.createExternalUserSession({
      externalSubjectKey: 'anonymous-browser-session',
      subjectType: 'anonymous',
      serviceId: TEST_SERVICE_ID,
    })

    expect(captured.authorization).toBe('Bearer configured-parent-jwt')
  })

  it('rotates refresh tokens through POST /token without configured Authorization', async () => {
    const captured = createCapturedRequest()
    const client = new AmigoClient({
      apiKey: TEST_API_KEY,
      workspaceId: TEST_WORKSPACE_ID,
      baseUrl: BASE_URL,
      fetch: recordingFetchWithResponse(captured, REFRESH_TOKEN_RESPONSE),
    })

    const result = await client.tokens.refresh({
      refreshToken: 'rt_old',
      workspaceId: TEST_WORKSPACE_ID,
      scope: 'conversations:create',
    })

    expect(captured.authorization).toBeNull()

    const form = new URLSearchParams(captured.body)
    expect(form.get('grant_type')).toBe('refresh_token')
    expect(form.get('refresh_token')).toBe('rt_old')
    expect(form.get('workspace_id')).toBe(TEST_WORKSPACE_ID)
    expect(form.get('scope')).toBe('conversations:create')
    expect(result.access_token).toBe(REFRESH_TOKEN_RESPONSE.access_token)
    expect(result.refresh_token).toBe(REFRESH_TOKEN_RESPONSE.refresh_token)
  })
})
