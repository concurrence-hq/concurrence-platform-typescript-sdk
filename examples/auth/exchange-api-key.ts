/**
 * Exchange an API key for a short-lived JWT.
 *
 * Usage:
 *   AMIGO_API_KEY=... AMIGO_WORKSPACE_ID=... \
 *     npx tsx examples/auth/exchange-api-key.ts
 *
 * The script reads the long-lived API key from the environment, calls
 * `client.tokens.exchangeApiKey()` to mint an identity-issued JWT, and then
 * uses the JWT to make a follow-up request. Useful when you want to hand a
 * narrowly scoped, time-bound token to a less privileged runtime (for
 * example a browser, a BFF proxy, or a background worker).
 */

import { AmigoClient } from '@amigo-ai/platform-sdk'

async function main() {
  const apiKey = process.env.AMIGO_API_KEY
  const workspaceId = process.env.AMIGO_WORKSPACE_ID

  if (!apiKey || !workspaceId) {
    throw new Error('AMIGO_API_KEY and AMIGO_WORKSPACE_ID must be set')
  }

  const client = new AmigoClient({
    apiKey,
    workspaceId,
    baseUrl: process.env.AMIGO_BASE_URL,
    // Set with AMIGO_BASE_URL outside US production; see README "Hosts".
    identityBaseUrl: process.env.AMIGO_IDENTITY_URL,
  })

  // Exchange the API key for a JWT. Optional `scope` requests a narrower
  // scope on the issued token — enforcement happens server-side.
  // Adjust the scope string to match your integration's least-privilege needs.
  const tokenResponse = await client.tokens.exchangeApiKey({
    apiKey,
    scope: 'entities:read agents:read',
  })

  console.log(`Issued ${tokenResponse.token_type} token`)
  console.log(`  expires_in: ${tokenResponse.expires_in}s`)
  console.log(`  scope:      ${tokenResponse.scope}`)

  // Use the JWT with a second client. JWTs are passed as `apiKey` — the SDK
  // sends them as Bearer tokens just like raw API keys.
  const scopedClient = new AmigoClient({
    apiKey: tokenResponse.access_token,
    workspaceId,
    // Reuse the same base URL so the JWT goes back to the environment that
    // issued it. Otherwise a token issued for another environment would be sent to production.
    baseUrl: process.env.AMIGO_BASE_URL,
  })

  const { items: agents } = await scopedClient.agents.list({ limit: 3 })
  console.log(`\nFound ${agents.length} agent(s) using the scoped JWT:`)
  for (const agent of agents) {
    console.log(`  - ${agent.name}`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
