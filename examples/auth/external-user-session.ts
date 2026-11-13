/**
 * Mint an external-user token and use it for a text conversation.
 *
 * Usage:
 *   AMIGO_API_KEY=... AMIGO_WORKSPACE_ID=... \
 *   AMIGO_EXTERNAL_INTEGRATION_CLIENT_ID=... \
 *   AMIGO_EXTERNAL_INTEGRATION_CLIENT_SECRET=... \
 *   AMIGO_SERVICE_ID=... AMIGO_EXTERNAL_SUBJECT_KEY=customer-user-123 \
 *     npx tsx examples/auth/external-user-session.ts
 */

import { AmigoClient, EXTERNAL_USER_SESSION_CREATE_SCOPE } from '@amigo-ai/platform-sdk'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function renderOutput(output: { text?: string | null }[]): string {
  return output
    .map((message) => message.text)
    .filter((text): text is string => Boolean(text))
    .join('\n')
}

async function main() {
  const workspaceId = requireEnv('AMIGO_WORKSPACE_ID')
  const serviceId = requireEnv('AMIGO_SERVICE_ID')
  const baseUrl = process.env.AMIGO_BASE_URL

  const backendClient = new AmigoClient({
    apiKey: requireEnv('AMIGO_API_KEY'),
    workspaceId,
    baseUrl,
    // Set with AMIGO_BASE_URL outside US production; see README "Hosts".
    identityBaseUrl: process.env.AMIGO_IDENTITY_URL,
  })

  const parent = await backendClient.tokens.exchangeClientCredentials({
    clientId: requireEnv('AMIGO_EXTERNAL_INTEGRATION_CLIENT_ID'),
    clientSecret: requireEnv('AMIGO_EXTERNAL_INTEGRATION_CLIENT_SECRET'),
    scope: EXTERNAL_USER_SESSION_CREATE_SCOPE,
  })

  const externalSession = await backendClient.tokens.createExternalUserSession({
    parentAccessToken: parent.access_token,
    externalSubjectKey: requireEnv('AMIGO_EXTERNAL_SUBJECT_KEY'),
    subjectType: 'user',
    serviceId,
    consumerEntityId: process.env.AMIGO_CONSUMER_ENTITY_ID,
    ttlSeconds: 1800,
  })

  const externalClient = new AmigoClient({
    apiKey: externalSession.access_token,
    workspaceId,
    baseUrl,
  })

  const conversation = await externalClient.conversations.create({
    service_id: serviceId,
  })

  const firstTurn = await externalClient.conversations.createTurn(conversation.id, {
    message: 'Hello, I need help scheduling an appointment.',
  })
  console.log(renderOutput(firstTurn.output))

  if (!externalSession.refresh_token) {
    throw new Error('external-user session did not include a refresh token')
  }
  const refreshed = await backendClient.tokens.refresh({
    refreshToken: externalSession.refresh_token,
    workspaceId,
  })

  const refreshedExternalClient = new AmigoClient({
    apiKey: refreshed.access_token,
    workspaceId,
    baseUrl,
  })

  const secondTurn = await refreshedExternalClient.conversations.createTurn(conversation.id, {
    message: 'Tuesday morning works.',
  })
  console.log(renderOutput(secondTurn.output))
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
