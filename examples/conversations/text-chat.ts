/**
 * Interactive text chat — streaming responses with tool call events.
 *
 * Creates a conversation and starts an interactive REPL over
 * `conversations.streamTurn` (`POST /turns/stream`, server-sent events).
 * Type messages, see tool calls and agent responses stream in real-time.
 *
 * Usage:
 *   AMIGO_API_KEY=... AMIGO_WORKSPACE_ID=... AMIGO_SERVICE_ID=... \
 *     npx tsx examples/conversations/text-chat.ts
 */

import * as readline from 'readline/promises'
import { createClient, requireEnv } from '../shared.js'

const serviceId = requireEnv('AMIGO_SERVICE_ID')
const client = createClient()

const conversation = await client.conversations.create({ service_id: serviceId })
console.log(`Conversation: ${conversation.id}\n`)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

try {
  while (true) {
    const text = (await rl.question('You: ')).trim()
    if (!text) continue
    if (text === '/quit') break

    for await (const event of client.conversations.streamTurn(
      conversation.id,
      { message: text },
      { includeToolCalls: true },
    )) {
      switch (event.event) {
        case 'token':
          process.stdout.write(event.text)
          break
        case 'tool_call_started':
          console.log(`\n  [tool] ${event.tool_name}(${event.input.slice(0, 120)})`)
          break
        case 'tool_call_completed':
          console.log(
            `  [tool] ${event.tool_name} → ${event.succeeded ? event.result.slice(0, 200) : 'FAILED: ' + event.result}`,
          )
          break
        case 'error':
          console.error(`\nError: ${event.message}`)
          break
        case 'done':
          console.log('\n')
          break
      }
    }
  }
} finally {
  await client.conversations.close(conversation.id)
  rl.close()
}
