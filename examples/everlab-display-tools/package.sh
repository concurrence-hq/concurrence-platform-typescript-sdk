#!/bin/bash
# Package the Everlab display tools demo for sharing.
# Scrubs API keys and creates a minimal zip.

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="/tmp/everlab-demo"
rm -rf "$OUT"
mkdir -p "$OUT"

# Copy demo file
cp "$DIR/demo.ts" "$OUT/demo.ts"

# Scrub any hardcoded keys from the demo (should be none, but belt-and-suspenders)
sed -i '' 's/75eff1[a-f0-9]*/YOUR_API_KEY/g' "$OUT/demo.ts" 2>/dev/null || true

# Create minimal package.json
cat > "$OUT/package.json" << 'PKGJSON'
{
  "name": "everlab-display-tools-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "demo": "tsx demo.ts"
  },
  "dependencies": {
    "@amigo-ai/platform-sdk": "latest",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.0"
  }
}
PKGJSON

# Create tsconfig
cat > "$OUT/tsconfig.json" << 'TSCONF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["*.ts"]
}
TSCONF

# Create README
cat > "$OUT/README.md" << 'README'
# Everlab Display Tools Demo

Interactive demo showing `show_observation_cards`, `show_options`, and `show_alert` SSE events from the Everlab Chat Service.

## Setup

```bash
npm install
```

## Run

```bash
AMIGO_API_KEY=<your-key> \
AMIGO_WORKSPACE_ID=a8ccfbc8-8511-4d1f-8dc9-873be38ca1f0 \
AMIGO_SERVICE_ID=3d08b370-c6ad-4f0a-ad4d-31c88e569816 \
npm run demo
```

## SSE Events

The streaming endpoint (`POST /v1/{ws}/conversations/{id}/turns/stream`) emits:

| Event | When | Payload |
|---|---|---|
| `tool_call_started` | Tool begins | `tool_name`, `input` (JSON) |
| `tool_call_completed` | Tool finishes | `tool_name`, `result` (JSON), `succeeded`, `duration_ms` |
| `message` | Agent response | `text` |
| `done` | Turn complete | `conversation_id`, `turn_count` |

Display tools (`show_observation_cards`, `show_options`, `show_alert`) appear as `tool_call_completed` events. The `result` field contains the JSON payload your frontend renders.

## Example prompts

- `My MRN is patient_054. What blood work do I have?` → world tools + show_options
- `Show me my ferritin result` → show_observation_cards
- `I have crushing chest pain` → show_alert (urgent)
README

# Create standalone demo.ts that doesn't need ../shared.ts
cat > "$OUT/demo.ts" << 'DEMO'
/**
 * Everlab display tools demo — show_observation_cards, show_options, show_alert.
 *
 * Usage:
 *   AMIGO_API_KEY=<key> AMIGO_WORKSPACE_ID=<ws> AMIGO_SERVICE_ID=<svc> npm run demo
 */

import { AmigoClient } from '@amigo-ai/platform-sdk'
import * as readline from 'readline'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

const apiKey = requireEnv('AMIGO_API_KEY')
const workspaceId = requireEnv('AMIGO_WORKSPACE_ID')
const serviceId = requireEnv('AMIGO_SERVICE_ID')

const client = new AmigoClient({
  apiKey,
  workspaceId,
  baseUrl: process.env.AMIGO_BASE_URL ?? 'https://platform.api-us.concurrence.com',
})

const DISPLAY_TOOLS = new Set(['show_observation_cards', 'show_options', 'show_alert', 'escalate_to_clinician'])

const TOOL_LABELS: Record<string, string> = {
  world_patient_lookup: 'Patient Lookup',
  world_observations_lookup: 'Observations',
  world_conditions_lookup: 'Conditions',
  world_medication_statements_lookup: 'Medications',
  world_allergies_lookup: 'Allergies',
  world_family_history_lookup: 'Family History',
  world_clinical_notes_lookup: 'Clinical Notes',
  show_observation_cards: '📊 Observation Cards',
  show_options: '📋 Options',
  show_alert: '🚨 Alert',
  escalate_to_clinician: '🏥 Escalate',
}

function formatDisplayTool(toolName: string, result: string): string {
  try {
    const data = JSON.parse(result)
    if (toolName === 'show_observation_cards') {
      const ids = data?.input?.observationDefinitionIds ?? data?.observationDefinitionIds ?? []
      return [
        '',
        '  ┌─ OBSERVATION CARDS ─────────────────────────',
        `  │ IDs: ${JSON.stringify(ids)}`,
        '  │ → Frontend renders interactive lab result cards',
        '  └──────────────────────────────────────────────',
      ].join('\n')
    }
    if (toolName === 'show_options') {
      const options = data?.input?.options ?? data?.options ?? []
      const inputType = data?.input?.inputType ?? data?.inputType ?? 'radio'
      const lines = ['', `  ┌─ OPTIONS (${inputType}) ──────────────────────────`]
      for (const opt of options) lines.push(`  │  ○ ${opt.label ?? opt.value ?? JSON.stringify(opt)}`)
      lines.push('  └──────────────────────────────────────────────')
      return lines.join('\n')
    }
    if (toolName === 'show_alert') {
      const level = data?.input?.level ?? data?.level ?? 'info'
      const text = data?.input?.text ?? data?.text ?? ''
      const icon = level === 'urgent' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️'
      return [
        '',
        `  ┌─ ALERT [${level.toUpperCase()}] ${icon} ─────────────────────`,
        `  │ ${text.slice(0, 200)}`,
        '  └──────────────────────────────────────────────',
      ].join('\n')
    }
    if (toolName === 'escalate_to_clinician') {
      return [
        '',
        '  ┌─ ESCALATION ──────────────────────────────────',
        `  │ Queue: ${data?.input?.queue ?? data?.queue ?? '?'} | Priority: ${data?.input?.priority ?? data?.priority ?? '?'}`,
        `  │ Trigger: ${data?.input?.triggerSource ?? data?.triggerSource ?? '?'}`,
        '  └──────────────────────────────────────────────',
      ].join('\n')
    }
    return `  [display] ${JSON.stringify(data).slice(0, 200)}`
  } catch {
    return `  [display] ${result.slice(0, 200)}`
  }
}

async function main() {
  console.log('Everlab Display Tools Demo')
  console.log('─'.repeat(50))
  console.log(`Workspace: ${workspaceId}`)
  console.log(`Service:   ${serviceId}`)
  console.log('Creating conversation...\n')

  const conv = await client.conversations.create({ service_id: serviceId })
  console.log(`Conversation: ${conv.id}\n`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (): Promise<string> =>
    new Promise((resolve) => rl.question('\nYou: ', (text) => resolve(text.trim())))

  while (true) {
    const text = await ask()
    if (!text) continue
    if (text === '/quit') break
    console.log()

    try {
      for await (const event of client.conversations.streamTurn(
        conv.id,
        { message: text },
        { includeToolCalls: true },
      )) {
        switch (event.event) {
          case 'token':
            process.stdout.write(event.text)
            break
          case 'tool_call_started': {
            const label = TOOL_LABELS[event.tool_name] ?? event.tool_name
            console.log(`  ▶ ${label}  ${(event.input || '').slice(0, 120)}`)
            break
          }
          case 'tool_call_completed': {
            const label = TOOL_LABELS[event.tool_name] ?? event.tool_name
            if (DISPLAY_TOOLS.has(event.tool_name)) {
              console.log(formatDisplayTool(event.tool_name, event.result))
            } else if (event.succeeded) {
              try {
                const d = JSON.parse(event.result)
                console.log(`  ✓ ${label}: ${d.count ?? d.patients?.length ?? '?'} results`)
              } catch {
                console.log(`  ✓ ${label}`)
              }
            } else {
              console.log(`  ✗ ${label}: FAILED`)
            }
            break
          }
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
}

main().catch((err) => { console.error(err); process.exit(1) })
DEMO

# Zip it
cd /tmp
rm -f everlab-demo.zip
zip -r everlab-demo.zip everlab-demo/
echo ""
echo "✓ Packaged: /tmp/everlab-demo.zip"
echo "  Contents: demo.ts, package.json, tsconfig.json, README.md"
echo "  Size: $(du -h /tmp/everlab-demo.zip | cut -f1)"
