/**
 * Everlab display tools demo — show_observation_cards, show_options, show_alert.
 *
 * Uses the HTTP streaming API (POST /turns/stream) to send messages and
 * receive tool call events. When the LLM emits a display tool call, the
 * demo pretty-prints the payload so you can see what the frontend renders.
 *
 * Usage:
 *   AMIGO_API_KEY=<key> AMIGO_WORKSPACE_ID=a8ccfbc8-8511-4d1f-8dc9-873be38ca1f0 \
 *     AMIGO_SERVICE_ID=3d08b370-c6ad-4f0a-ad4d-31c88e569816 \
 *     npx tsx examples/everlab-display-tools/demo.ts
 *
 * Try these prompts:
 *   - "What blood work do I have on file?"     → observations + show_options
 *   - "Show me my iron levels"                 → show_observation_cards
 *   - "I have crushing chest pain right now"   → show_alert (urgent)
 */

import { AmigoClient } from '@amigo-ai/platform-sdk'
import * as readline from 'readline'
import { requireEnv } from '../shared.js'

const apiKey = requireEnv('AMIGO_API_KEY')
const workspaceId = requireEnv('AMIGO_WORKSPACE_ID')
const serviceId = requireEnv('AMIGO_SERVICE_ID')

const client = new AmigoClient({
  apiKey,
  workspaceId,
  baseUrl: process.env.AMIGO_BASE_URL ?? 'https://platform.api-us.concurrence.com',
})

const DISPLAY_TOOLS = new Set([
  'show_observation_cards',
  'show_options',
  'show_alert',
  'escalate_to_clinician',
])

const TOOL_LABELS: Record<string, string> = {
  world_patient_lookup: 'Patient Lookup',
  world_observations_lookup: 'Observations',
  world_conditions_lookup: 'Conditions',
  world_medication_statements_lookup: 'Medications',
  world_allergies_lookup: 'Allergies',
  world_family_history_lookup: 'Family History',
  world_clinical_notes_lookup: 'Clinical Notes',
  show_observation_cards: 'UI: Observation Cards',
  show_options: 'UI: Options',
  show_alert: 'UI: Alert',
  escalate_to_clinician: 'Action: Escalate',
}

function formatDisplayTool(toolName: string, result: string): string {
  try {
    const data = JSON.parse(result)

    if (toolName === 'show_observation_cards') {
      const ids = data?.input?.observationDefinitionIds ?? data?.observationDefinitionIds ?? []
      return (
        `\n  ┌─ OBSERVATION CARDS ─────────────────────────\n` +
        `  │ IDs: ${JSON.stringify(ids)}\n` +
        `  │ Frontend renders interactive lab result cards\n` +
        `  └──────────────────────────────────────────────\n`
      )
    }

    if (toolName === 'show_options') {
      const options = data?.input?.options ?? data?.options ?? []
      const inputType = data?.input?.inputType ?? data?.inputType ?? 'radio'
      let out = `\n  ┌─ OPTIONS (${inputType}) ──────────────────────────\n`
      for (const opt of options) {
        out += `  │  ○ ${opt.label ?? opt.value ?? JSON.stringify(opt)}\n`
      }
      out += `  └──────────────────────────────────────────────\n`
      return out
    }

    if (toolName === 'show_alert') {
      const level = data?.input?.level ?? data?.level ?? 'info'
      const text = data?.input?.text ?? data?.text ?? ''
      const icon = level === 'urgent' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️'
      return (
        `\n  ┌─ ALERT [${level.toUpperCase()}] ${icon} ─────────────────────\n` +
        `  │ ${text.slice(0, 200)}\n` +
        `  └──────────────────────────────────────────────\n`
      )
    }

    if (toolName === 'escalate_to_clinician') {
      const queue = data?.input?.queue ?? data?.queue ?? '?'
      const priority = data?.input?.priority ?? data?.priority ?? '?'
      const trigger = data?.input?.triggerSource ?? data?.triggerSource ?? '?'
      return (
        `\n  ┌─ ESCALATION ──────────────────────────────────\n` +
        `  │ Queue: ${queue} | Priority: ${priority}\n` +
        `  │ Trigger: ${trigger}\n` +
        `  └──────────────────────────────────────────────\n`
      )
    }

    return `  [display] ${JSON.stringify(data).slice(0, 200)}`
  } catch {
    return `  [display] ${result.slice(0, 200)}`
  }
}

// --- Main ---

console.log('Everlab Display Tools Demo')
console.log('─'.repeat(50))
console.log(`Workspace: ${workspaceId}`)
console.log(`Service:   ${serviceId}`)

async function main() {
  // Create conversation
  console.log('Creating conversation...\n')
  const conv = await client.conversations.create({ service_id: serviceId })
  const conversationId = conv.id
  console.log(`Conversation: ${conversationId}\n`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  const ask = (): Promise<string> =>
    new Promise((resolve) => rl.question('\nYou: ', (text) => resolve(text.trim())))

  while (true) {
    const text = await ask()
    if (!text) continue
    if (text === '/quit') break

    console.log()
    let fullMessage = ''

    try {
      for await (const event of client.conversations.streamTurn(
        conversationId,
        { message: text },
        { includeToolCalls: true },
      )) {
        switch (event.event) {
          case 'token':
            process.stdout.write(event.text)
            fullMessage += event.text
            break

          case 'tool_call_started': {
            const label = TOOL_LABELS[event.tool_name] ?? event.tool_name
            const input = event.input ? event.input.slice(0, 150) : ''
            console.log(`  ▶ ${label}  ${input}`)
            break
          }

          case 'tool_call_completed': {
            const label = TOOL_LABELS[event.tool_name] ?? event.tool_name

            if (DISPLAY_TOOLS.has(event.tool_name)) {
              console.log(formatDisplayTool(event.tool_name, event.result))
            } else if (event.succeeded) {
              try {
                const data = JSON.parse(event.result)
                const count = data.count ?? data.patients?.length ?? '?'
                console.log(`  ✓ ${label}: ${count} results`)
              } catch {
                console.log(`  ✓ ${label}: ${event.result.slice(0, 100)}`)
              }
            } else {
              console.log(`  ✗ ${label}: FAILED — ${event.result.slice(0, 100)}`)
            }
            break
          }

          case 'message':
            if (!fullMessage) console.log(`\nAgent: ${event.text}`)
            break

          case 'done':
            console.log('\n--- Turn complete ---')
            break

          case 'error':
            console.error(`\nError: ${JSON.stringify(event)}`)
            break
        }
      }
    } catch (err) {
      console.error(`\nStream error: ${err}`)
    }
  }

  rl.close()
  console.log('Bye!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
