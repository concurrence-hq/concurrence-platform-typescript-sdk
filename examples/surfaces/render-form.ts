import createClient from 'openapi-fetch'
import type { paths } from '@amigo-ai/platform-sdk'
import { requireEnv } from '../shared.js'

// Surface spec shape returned by /s/{token}/spec (untyped in the OpenAPI spec)
interface SurfaceSpec {
  title: string
  description?: string
  fields: Array<{
    key: string
    label: string
    field_type: string
    required?: boolean
    options?: string[]
    condition?: Record<string, unknown>
    prefill_value?: unknown
  }>
  sections?: Array<{
    title: string
    field_keys: string[]
  }>
  branding?: {
    logo_url?: string
    primary_color?: string
    background_color?: string
    font_family?: string
  }
}

// Public token routes require no API key -- the token is the credential.
// Use openapi-fetch directly with the SDK's path types.
const publicApi = createClient<paths>({
  baseUrl: process.env.AMIGO_BASE_URL || 'https://platform.api-us.concurrence.com',
})

const token = requireEnv('AMIGO_SURFACE_TOKEN')

// Fetch the form spec (fields, sections, branding, saved values)
const { data, error } = await publicApi.GET('/s/{token}/spec', {
  params: { path: { token } },
})

if (error || !data) {
  console.error('Failed to fetch surface spec:', error)
  process.exit(1)
}

// The public spec endpoint returns an untyped response in the OpenAPI schema,
// so we cast to our local interface.
const spec = data as unknown as SurfaceSpec

console.log('Form spec:')
console.log(`  Title:       ${spec.title}`)
console.log(`  Description: ${spec.description}`)
console.log(`  Fields:      ${spec.fields?.length ?? 0}`)
console.log(`  Sections:    ${spec.sections?.length ?? 0}`)

if (spec.branding) {
  console.log(`  Branding:    ${JSON.stringify(spec.branding)}`)
}

// Display each field
console.log('\nFields:')
for (const field of spec.fields ?? []) {
  const required = field.required ? ' *' : ''
  const saved = field.prefill_value ? ` [saved: ${field.prefill_value}]` : ''
  console.log(`  [${field.field_type}] ${field.label}${required}${saved}`)

  if (field.options) {
    console.log(`    Options: ${field.options.join(', ')}`)
  }
  if (field.condition) {
    console.log(`    Condition: ${JSON.stringify(field.condition)}`)
  }
}

// Display sections (multi-page layout)
if (spec.sections?.length) {
  console.log('\nSections (pages):')
  for (const section of spec.sections) {
    console.log(`  ${section.title}`)
    console.log(`    Fields: ${section.field_keys.join(', ')}`)
  }
}

// Try the heal endpoint for a sample correction
console.log('\nTesting auto-heal:')
const { data: healData } = await publicApi.POST('/s/{token}/heal', {
  params: { path: { token } },
  body: {
    key: 'full_name',
    value: 'jne doe',
    field_type: 'text',
    label: 'Full Name',
  },
})

if (healData) {
  const healed = healData as unknown as { value: string; confidence: number }
  console.log(`  Input:      "jne doe"`)
  console.log(`  Corrected:  "${healed.value}"`)
  console.log(`  Confidence: ${healed.confidence}`)
}

// Try medication lookup
console.log('\nMedication lookup for "metfor":')
const { data: meds } = await publicApi.GET('/s/{token}/lookup/{lookup_type}', {
  params: {
    path: { token, lookup_type: 'medication' },
    query: { q: 'metfor' },
  },
})

if (meds) {
  console.log(`  Results: ${JSON.stringify(meds, null, 2)}`)
}
