# Build a Custom Patient Form

This guide walks through building a patient-facing intake form using the Amigo Platform SDK. By the end, you will be able to create a form, deliver it to a patient, render it in your own UI, and handle submissions.

## Concepts

**Surfaces** are workspace-scoped form specifications. Each surface defines:

- **Fields** -- the data you want to collect (name, date of birth, medications, etc.)
- **Sections** -- optional multi-page grouping of fields
- **Branding** -- logo, colors, and font family for the patient-facing page
- **Conditions** -- show/hide fields based on other field values
- **AI capabilities** -- auto-heal (LLM correction), OCR extraction, medication/allergy/pharmacy/insurance lookup

When you create a surface, the API returns a signed **token URL** (`/s/{token}`) that the patient can open without authentication. The form renders server-side from the spec, auto-saves progress, and writes submitted data as world events on the patient's entity timeline.

### Field types

| Type          | Description                          |
| ------------- | ------------------------------------ |
| `text`        | Single-line text input               |
| `textarea`    | Multi-line text                      |
| `date`        | Date picker                          |
| `phone`       | Phone number with formatting         |
| `email`       | Email address                        |
| `number`      | Numeric input                        |
| `select`      | Single-choice dropdown               |
| `multiselect` | Multi-choice dropdown                |
| `checkbox`    | Boolean checkbox (with consent text) |
| `photo`       | Photo capture / upload               |
| `signature`   | Signature pad                        |
| `file`        | File upload                          |
| `heading`     | Display-only section heading         |
| `info`        | Display-only informational text      |

### Surface lifecycle

```
created --> delivered --> opened --> partial --> completed
                                                   |
                                            pending_review --> approved / rejected
```

Surfaces can also expire (configurable, default 7 days) or be archived.

## Step 1: Create a surface

First, find or create the patient entity the form is for, then create the surface with your field definitions.

```typescript
import { AmigoClient } from '@amigo-ai/platform-sdk'
import type { components } from '@amigo-ai/platform-sdk'

const client = new AmigoClient({
  apiKey: process.env.AMIGO_API_KEY!,
  workspaceId: process.env.AMIGO_WORKSPACE_ID!,
})

// Find the patient entity
const patients = await client.world.listEntities({
  q: 'Jane Doe',
  entity_type: ['patient'],
  limit: 1,
})
const patientId = patients.entities[0]?.id
if (!patientId) throw new Error('Patient not found')

// Create an intake form
const surface = await client.POST('/v1/{workspace_id}/surfaces', {
  body: {
    entity_id: patientId,
    title: 'New Patient Intake',
    description: 'Please complete this form before your appointment.',
    channel: 'sms',
    expires_in_hours: 72,
    fields: [
      {
        key: 'full_name',
        label: 'Full Name',
        field_type: 'text',
        required: true,
        placeholder: 'First and last name',
      },
      {
        key: 'date_of_birth',
        label: 'Date of Birth',
        field_type: 'date',
        required: true,
      },
      {
        key: 'phone',
        label: 'Phone Number',
        field_type: 'phone',
        required: true,
      },
      {
        key: 'email',
        label: 'Email Address',
        field_type: 'email',
        required: false,
      },
      {
        key: 'reason_for_visit',
        label: 'Reason for Visit',
        field_type: 'select',
        required: true,
        options: ['Annual Physical', 'Follow-up', 'New Concern', 'Urgent'],
      },
      {
        key: 'symptoms',
        label: 'Describe your symptoms',
        field_type: 'textarea',
        required: false,
        // Only show when reason is "New Concern" or "Urgent"
        condition: {
          field: 'reason_for_visit',
          operator: 'in',
          value: ['New Concern', 'Urgent'],
        },
      },
      {
        key: 'current_medications',
        label: 'Current Medications',
        field_type: 'textarea',
        required: false,
        description: 'List all medications you are currently taking.',
      },
      {
        key: 'allergies',
        label: 'Known Allergies',
        field_type: 'multiselect',
        required: false,
        options: ['Penicillin', 'Sulfa', 'Latex', 'Iodine', 'None'],
      },
      {
        key: 'insurance_card',
        label: 'Insurance Card (front)',
        field_type: 'photo',
        required: false,
        description: 'Take a photo or upload an image of your insurance card.',
      },
      {
        key: 'consent',
        label: 'I consent to treatment',
        field_type: 'checkbox',
        required: true,
        consent_text:
          'I acknowledge that I have reviewed the privacy policy and consent to receive care.',
      },
      {
        key: 'signature',
        label: 'Patient Signature',
        field_type: 'signature',
        required: true,
      },
    ],
    sections: [
      {
        title: 'Personal Information',
        field_keys: ['full_name', 'date_of_birth', 'phone', 'email'],
      },
      {
        title: 'Visit Details',
        field_keys: ['reason_for_visit', 'symptoms'],
      },
      {
        title: 'Medical History',
        field_keys: ['current_medications', 'allergies', 'insurance_card'],
      },
      {
        title: 'Consent',
        field_keys: ['consent', 'signature'],
      },
    ],
    branding: {
      logo_url: 'https://your-clinic.com/logo.png',
      primary_color: '#2563EB',
      background_color: '#F8FAFC',
      font_family: 'Inter, system-ui, sans-serif',
    },
    completion_title: 'Thank you!',
    completion_message: 'Your form has been submitted. We will see you at your appointment.',
  },
})

console.log('Surface created:', surface.data.id)
console.log('Patient URL:', surface.data.url)
console.log('Token:', surface.data.token)
```

The response includes:

- `id` -- the surface ID for management operations
- `token` -- the signed token for the patient-facing URL
- `url` -- the full patient-facing URL (e.g., `https://forms.amigo.ai/s/{token}`)
- `status` -- starts as `"created"`
- `expires_at` -- when the token expires

## Step 2: Deliver the surface

Deliver the form via SMS, email, or any channel. The platform handles SMS and email delivery natively.

```typescript
const delivery = await client.POST('/v1/{workspace_id}/surfaces/{surface_id}/deliver', {
  params: { path: { surface_id: surface.data.id } },
  body: {
    channel_address: '+15551234567',
  },
})

console.log('Delivery status:', delivery.data.status)
console.log('Sent via:', delivery.data.delivery_provider)
console.log('Message ID:', delivery.data.message_id)
```

For email delivery, pass an email address instead:

```typescript
const emailDelivery = await client.POST('/v1/{workspace_id}/surfaces/{surface_id}/deliver', {
  params: { path: { surface_id: surface.data.id } },
  body: {
    channel_address: 'jane.doe@example.com',
  },
})
```

## Step 3: Render the form (custom UI)

If you are building your own form renderer instead of using the hosted forms app, fetch the spec and saved values using the public token endpoint. These endpoints require no authentication -- the token itself is the credential.

```typescript
import createClient from 'openapi-fetch'
import type { paths } from '@amigo-ai/platform-sdk'

// Create an unauthenticated client for public token routes
const publicApi = createClient<paths>({
  baseUrl: 'https://platform.api-us.concurrence.com',
})

const token = 'the-token-from-step-1'

// Fetch the form spec (fields, sections, branding, saved values)
const { data: spec } = await publicApi.GET('/s/{token}/spec', {
  params: { path: { token } },
})

console.log('Form title:', spec.title)
console.log('Fields:', spec.fields.length)
console.log('Branding:', spec.branding)

// Render each field based on its type
for (const field of spec.fields) {
  console.log(`  ${field.key}: ${field.field_type} - "${field.label}"`)
  if (field.prefill_value) {
    console.log(`    Saved value: ${field.prefill_value}`)
  }
}
```

### Auto-save individual fields

As the patient fills out the form, save each field individually so progress is not lost:

```typescript
await publicApi.PUT('/s/{token}/fields/{key}', {
  params: { path: { token, key: 'full_name' } },
  body: { value: 'Jane Doe' },
})
```

### AI auto-heal

If a patient enters a value that looks misspelled or malformatted, request an LLM-powered correction:

```typescript
const { data: healed } = await publicApi.POST('/s/{token}/heal', {
  params: { path: { token } },
  body: {
    key: 'current_medications',
    value: 'metformin 500mg, lisinoprl 10mg',
    field_type: 'textarea',
    label: 'Current Medications',
  },
})

console.log('Corrected value:', healed.value)
console.log('Confidence:', healed.confidence)
// healed.value might be: "metformin 500mg, lisinopril 10mg"
```

### OCR extraction

Extract structured data from an uploaded image (e.g., an insurance card photo):

```typescript
const formData = new FormData()
formData.append('file', insuranceCardFile)

const { data: extracted } = await publicApi.POST('/s/{token}/ocr', {
  params: { path: { token } },
  body: formData as never,
})

console.log('Extracted fields:', extracted)
// { member_id: "ABC123", group_number: "GRP456", ... }
```

### Lookups

Search for medications, allergies, pharmacies, or insurance providers:

```typescript
// Medication lookup
const { data: meds } = await publicApi.GET('/s/{token}/lookup/{lookup_type}', {
  params: {
    path: { token, lookup_type: 'medication' },
    query: { q: 'metfor' },
  },
})
console.log('Medication matches:', meds)

// Pharmacy lookup
const { data: pharmacies } = await publicApi.GET('/s/{token}/lookup/{lookup_type}', {
  params: {
    path: { token, lookup_type: 'pharmacy' },
    query: { q: '90210' },
  },
})
console.log('Nearby pharmacies:', pharmacies)
```

Available lookup types: `medication`, `allergy`, `pharmacy`, `insurance`.

### Appointment booking

If the surface is configured for appointment scheduling, fetch availability and book a slot:

```typescript
const { data: slots } = await publicApi.GET('/s/{token}/availability', {
  params: { path: { token } },
})

console.log('Available slots:', slots)

// Book the first available slot
const { data: booking } = await publicApi.POST('/s/{token}/book', {
  params: { path: { token } },
  body: {
    slot_id: slots[0].id,
    patient_name: 'Jane Doe',
  },
})

console.log('Booked:', booking)
```

## Step 4: Submit the form

When the patient completes all required fields, submit the form:

```typescript
const { data: result } = await publicApi.POST('/s/{token}/submit', {
  params: { path: { token } },
  body: {
    full_name: 'Jane Doe',
    date_of_birth: '1985-03-15',
    phone: '+15551234567',
    email: 'jane.doe@example.com',
    reason_for_visit: 'Annual Physical',
    consent: true,
    // signature is captured by the form renderer
  },
})

console.log('Submission result:', result)
```

After submission, the surface status moves to `completed` (or `pending_review` if clinician review is required). Submitted data flows as world events onto the patient's entity timeline.

## Step 5: Review queue

Surfaces that require clinician review appear in the review queue:

```typescript
// List surfaces pending review
const { data: pending } = await client.GET('/v1/{workspace_id}/surfaces/review', {})

for (const surface of pending.data.items) {
  console.log(`${surface.id}: ${surface.title} (${surface.status})`)
}

// Approve a reviewed surface
await client.POST('/v1/{workspace_id}/surfaces/{surface_id}/approve', {
  params: { path: { surface_id: 'surface-id' } },
})

// Or reject with a reason
await client.POST('/v1/{workspace_id}/surfaces/{surface_id}/reject', {
  params: { path: { surface_id: 'surface-id' } },
  body: { reason: 'Insurance card image is unreadable' },
})
```

## Step 6: Analytics

Track form completion rates and identify drop-off points:

```typescript
// Completion rates by surface
const { data: completionRates } = await client.GET(
  '/v1/{workspace_id}/analytics/surfaces/completion-rates',
  {},
)
console.log('Completion rates:', completionRates)

// Field-level abandonment
const { data: abandonment } = await client.GET(
  '/v1/{workspace_id}/analytics/surfaces/field-abandonment',
  {},
)
console.log('Drop-off fields:', abandonment)

// Channel effectiveness (SMS vs email vs web)
const { data: channels } = await client.GET(
  '/v1/{workspace_id}/analytics/surfaces/channel-effectiveness',
  {},
)
console.log('Channel stats:', channels)

// Surface history for a specific patient
const { data: history } = await client.GET(
  '/v1/{workspace_id}/analytics/surfaces/entity/{entity_id}',
  {
    params: { path: { entity_id: patientId } },
  },
)
console.log('Patient surface history:', history)
```

## Step 7: Manage surfaces

```typescript
// List all surfaces
const { data: surfaces } = await client.GET('/v1/{workspace_id}/surfaces', {
  params: { query: { limit: 20 } },
})

// Get a specific surface
const { data: detail } = await client.GET('/v1/{workspace_id}/surfaces/{surface_id}', {
  params: { path: { surface_id: 'surface-id' } },
})

// Update a surface spec (before delivery)
await client.PATCH('/v1/{workspace_id}/surfaces/{surface_id}', {
  params: { path: { surface_id: 'surface-id' } },
  body: {
    title: 'Updated Intake Form',
  },
})

// Check field-level completion progress
const { data: progress } = await client.GET('/v1/{workspace_id}/surfaces/{surface_id}/progress', {
  params: { path: { surface_id: 'surface-id' } },
})
console.log('Progress:', progress)

// Reshape: create a new surface with only the unfilled fields
const { data: reshaped } = await client.POST('/v1/{workspace_id}/surfaces/{surface_id}/reshape', {
  params: { path: { surface_id: 'surface-id' } },
})
console.log('Reshaped surface:', reshaped.id)

// Archive a surface
await client.DELETE('/v1/{workspace_id}/surfaces/{surface_id}', {
  params: { path: { surface_id: 'surface-id' } },
})
```

## Conditional fields

Fields can be shown or hidden based on other field values using the `condition` property:

```typescript
{
  key: 'other_reason',
  label: 'Please describe',
  field_type: 'textarea',
  required: true,
  condition: {
    field: 'reason_for_visit',
    operator: 'eq',
    value: 'Other',
  },
}
```

Supported operators: `eq`, `neq`, `in`, `not_in`, `contains`.

## Public token routes reference

These endpoints use the surface token for authentication (no API key needed):

| Method | Path                              | Description                                     |
| ------ | --------------------------------- | ----------------------------------------------- |
| GET    | `/s/{token}/spec`                 | Fetch form spec + saved values                  |
| POST   | `/s/{token}/submit`               | Submit completed form                           |
| POST   | `/s/{token}/heal`                 | LLM auto-correction for a field value           |
| POST   | `/s/{token}/ocr`                  | Extract structured data from an image           |
| GET    | `/s/{token}/availability`         | Appointment slots                               |
| POST   | `/s/{token}/book`                 | Book an appointment                             |
| PUT    | `/s/{token}/fields/{key}`         | Auto-save a single field                        |
| GET    | `/s/{token}/lookup/{lookup_type}` | Medication, allergy, pharmacy, insurance search |

## Next steps

- [API Reference](https://docs.amigo.ai/api-reference) -- full endpoint documentation
- [api.md](../../api.md) -- generated SDK surface reference
- [examples/surfaces/](../../examples/surfaces/) -- runnable code examples
