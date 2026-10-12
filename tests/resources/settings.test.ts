import { beforeEach, describe, expect, it } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import type { SttProvider, TtsProvider } from '../../src/index.js'
import { mockFetch } from '../helpers/mock-fetch.js'

const TEST_API_KEY = 'test-api-key-abc123'
const TEST_WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
let lastVoiceUpdateBody: unknown

const VOICE_SETTINGS_FIXTURE = {
  language: 'en',
  post_call_analysis_enabled: true,
  keyterms: [],
  sensitive_topics: [],
  transcript_correction_enabled: false,
  voice_id: 'voice-abc123',
  pronunciation_dict_id: null,
  speed: null,
  stt_provider: 'cartesia',
  tone: null,
  tts_config: { voice_id: 'voice-from-config' },
  tts_provider: 'elevenlabs',
  volume: null,
}

const BRANDING_FIXTURE = {
  branding: {
    primary_color: '#0066CC',
    background_color: '#FFFFFF',
    logo_url: 'https://cdn.example.com/logo.png',
    font_family: null,
  },
}

const OUTREACH_FIXTURE = {
  rules: [{ name: 'Appointment Reminders', schedule: '0 9 * * 1-5' }],
  data_templates: [{ name: 'reminder', fields: ['patient_name', 'appointment_date'] }],
}

const RETENTION_FIXTURE = {
  call_recordings_days: 365,
  call_transcripts_days: 730,
  world_events_days: 1095,
  audit_log_days: 365,
  phi_data_days: 2555,
  legal_hold: false,
  legal_hold_reason: null,
}

const BASE = `/v1/${TEST_WORKSPACE_ID}`

const client = new AmigoClient({
  apiKey: TEST_API_KEY,
  workspaceId: TEST_WORKSPACE_ID,
  fetch: mockFetch({
    [`GET ${BASE}/settings/voice`]: () => Response.json(VOICE_SETTINGS_FIXTURE),

    [`PUT ${BASE}/settings/voice`]: ({ body }) => {
      lastVoiceUpdateBody = body
      return Response.json({ ...VOICE_SETTINGS_FIXTURE, language: 'es' })
    },

    [`GET ${BASE}/settings/branding`]: () => Response.json(BRANDING_FIXTURE),

    [`PUT ${BASE}/settings/branding`]: () =>
      Response.json({ branding: { ...BRANDING_FIXTURE.branding, primary_color: '#FF0000' } }),

    [`GET ${BASE}/settings/outreach`]: () => Response.json(OUTREACH_FIXTURE),

    [`PUT ${BASE}/settings/outreach`]: () =>
      Response.json({
        ...OUTREACH_FIXTURE,
        rules: [...OUTREACH_FIXTURE.rules, { name: 'Follow-up', schedule: '0 14 * * 1-5' }],
      }),

    [`GET ${BASE}/settings/retention`]: () => Response.json(RETENTION_FIXTURE),

    [`PUT ${BASE}/settings/retention`]: () =>
      Response.json({ ...RETENTION_FIXTURE, call_recordings_days: 180 }),

    [`GET ${BASE}/settings/gap-scanner`]: () => Response.json({ enabled: true, rules: [] }),
    [`PUT ${BASE}/settings/gap-scanner`]: () => Response.json({ enabled: false, rules: [] }),
  }),
})

describe('SettingsResource', () => {
  beforeEach(() => {
    lastVoiceUpdateBody = undefined
  })

  describe('voice', () => {
    it('gets voice settings', async () => {
      const result = await client.settings.voice.get()
      expect(result.language).toBe('en')
      expect(result.post_call_analysis_enabled).toBe(true)
      expect(result.stt_provider).toBe('cartesia')
      expect(result.tts_provider).toBe('elevenlabs')
      expect(result.tts_config).toEqual({ voice_id: 'voice-from-config' })
    })

    it('updates voice settings', async () => {
      const sttProvider = 'deepgram' satisfies SttProvider
      const ttsProvider = 'cartesia' satisfies TtsProvider
      const body = {
        language: 'es',
        stt_provider: sttProvider,
        tts_provider: ttsProvider,
      } satisfies Parameters<typeof client.settings.voice.update>[0]
      const result = await client.settings.voice.update(body)
      expect(result.language).toBe('es')
      expect(lastVoiceUpdateBody).toMatchObject(body)
    })
  })

  describe('branding', () => {
    it('gets branding settings', async () => {
      const result = await client.settings.branding.get()
      expect(result.branding.primary_color).toBe('#0066CC')
    })

    it('updates branding settings', async () => {
      const result = await client.settings.branding.update({
        branding: { primary_color: '#FF0000' },
      } as never)
      expect(result.branding.primary_color).toBe('#FF0000')
    })
  })

  describe('outreach', () => {
    it('gets outreach settings', async () => {
      const result = await client.settings.outreach.get()
      expect(result.rules).toHaveLength(1)
      expect(result.data_templates).toHaveLength(1)
    })

    it('updates outreach settings', async () => {
      const result = await client.settings.outreach.update({ rules: [] } as never)
      expect(result.rules).toHaveLength(2)
    })
  })

  describe('retention', () => {
    it('gets retention policy', async () => {
      const result = await client.settings.retention.get()
      expect(result.call_recordings_days).toBe(365)
      expect(result.call_transcripts_days).toBe(730)
    })

    it('updates retention policy', async () => {
      const result = await client.settings.retention.update({ call_recordings_days: 180 } as never)
      expect(result.call_recordings_days).toBe(180)
    })
  })

  describe('gapScanner', () => {
    it('gets and updates the rules', async () => {
      expect(await client.settings.gapScanner.get()).toMatchObject({ enabled: true })
      expect(
        await client.settings.gapScanner.update({ enabled: false } as Parameters<
          typeof client.settings.gapScanner.update
        >[0]),
      ).toMatchObject({ enabled: false })
    })
  })
})
