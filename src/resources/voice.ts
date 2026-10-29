import type { components } from '../generated/api.js'

/** Provider constants derived from OpenAPI voice control-plane enums. */

export type VoiceSessionProvider = NonNullable<
  components['schemas']['ServiceVoiceConfig-Input']['session_provider']
>
export type SttProvider = NonNullable<components['schemas']['VoiceSettingsRequest']['stt_provider']>
export type TtsProvider = NonNullable<components['schemas']['VoiceSettingsRequest']['tts_provider']>
export type VoiceLanguage = NonNullable<components['schemas']['VoiceSettingsRequest']['language']>

export type ServiceVoiceConfigInput = components['schemas']['ServiceVoiceConfig-Input']
export type ServiceVoiceConfigOutput = components['schemas']['ServiceVoiceConfig-Output']
export type AgentVoiceConfig = components['schemas']['VoiceConfig']
export type VoiceSettingsRequest = components['schemas']['VoiceSettingsRequest']
export type VoiceSettingsResponse = components['schemas']['VoiceSettingsResponse']

// Force constant arrays to list every OpenAPI enum member after a spec refresh.
type ExhaustiveProviderList<Union extends string, Values extends readonly Union[]> =
  Exclude<Union, Values[number]> extends never ? Values : never

// Voice MODEL FAMILIES: amigo = Amigo's own pipeline (the default), gpt_realtime = OpenAI's
// GPT-Realtime family (served by the raw-WebSocket bridge), eleven_realtime = ElevenLabs' Eleven
// Realtime family (app voice sessions; a workspace in a regional deployment is refused). Families name models; runtimes are
// platform-internal. The gpt_live family + the Atlas SDK runtime were retired in the 2026-07-19
// engine consolidation; legacy values (inhouse/atlas/openai_realtime) are rejected server-side
// and never appear here.
const voiceSessionProviders = [
  'amigo',
  'gpt_realtime',
  'eleven_realtime',
] as const satisfies readonly VoiceSessionProvider[]
export const VOICE_SESSION_PROVIDERS = voiceSessionProviders satisfies ExhaustiveProviderList<
  VoiceSessionProvider,
  typeof voiceSessionProviders
>

const sttProviders = ['deepgram', 'openai', 'cartesia'] as const satisfies readonly SttProvider[]
/**
 * Supported STT provider ids from the platform schema.
 *
 * Provider availability can still be workspace- or environment-gated at runtime
 * (for example Cartesia ink-2), so treat this as the contract enum, not an
 * entitlement check for a specific workspace.
 */
export const STT_PROVIDERS = sttProviders satisfies ExhaustiveProviderList<
  SttProvider,
  typeof sttProviders
>

const ttsProviders = ['cartesia', 'elevenlabs'] as const satisfies readonly TtsProvider[]
export const TTS_PROVIDERS = ttsProviders satisfies ExhaustiveProviderList<
  TtsProvider,
  typeof ttsProviders
>

const voiceLanguages = [
  'en',
  'es',
  'ar',
  'fr',
  'de',
  'pt',
  'zh',
  'ja',
  'ko',
  'multilingual',
] as const satisfies readonly VoiceLanguage[]
/**
 * The languages a workspace's calls can be spoken in when the caller's record
 * names none. `multilingual` starts each call in English and follows the
 * language the caller speaks. Any other value is a 422.
 */
export const VOICE_LANGUAGES = voiceLanguages satisfies ExhaustiveProviderList<
  VoiceLanguage,
  typeof voiceLanguages
>
