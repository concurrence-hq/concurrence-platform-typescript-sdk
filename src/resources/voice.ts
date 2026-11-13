import type { components, operations } from '../generated/api.js'
import { WorkspaceScopedResource, extractData } from './base.js'

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

// Voice MODEL FAMILIES: concurrence = Concurrence's own pipeline (the default), gpt_realtime = OpenAI's
// GPT-Realtime family, eleven_realtime = ElevenLabs' Eleven Realtime family, gpt_live = OpenAI's
// GPT-Live front end with the platform's reasoning engine as its backend (US workspaces without
// regional data residency), grok_voice = xAI's Grok Voice family (workspaces without regional data
// residency), gemini_live = Google's Gemini Live family, phonic = Phonic's family. A workspace in a
// regional deployment is refused eleven_realtime, gpt_live and grok_voice. Families name models; runtimes are platform-internal. Discover each family's models,
// voices and options with GET /v1/{workspace_id}/voice-families rather than baking them in.
const voiceSessionProviders = [
  'concurrence',
  'gpt_realtime',
  'eleven_realtime',
  'gpt_live',
  'grok_voice',
  'gemini_live',
  'phonic',
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

export type VoiceFamily = operations['list-family-voices']['parameters']['path']['family']
export type VoiceFamilyListResponse = components['schemas']['VoiceFamilyListResponse']
export type VoiceListResponse = components['schemas']['VoiceListResponse']
export type ListFamilyVoicesParams = NonNullable<
  operations['list-family-voices']['parameters']['query']
>

/**
 * Voice families: each family's models, voices and options, read from the platform instead of
 * baked into the client.
 */
export class VoiceFamiliesResource extends WorkspaceScopedResource {
  /** List the voice families and what each offers this workspace. */
  async list() {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/voice-families', {
        params: { path: { workspace_id: this.workspaceId } },
      }),
    )
  }

  /**
   * Page the voices of one family, even when this workspace cannot use the family. Reuse the
   * returned `next_cursor` with the same filters. Static voices carry no language metadata, so a
   * nonempty `language` filter matches none of them.
   */
  async listVoices(family: VoiceFamily, params?: ListFamilyVoicesParams) {
    return extractData(
      await this.client.GET('/v1/{workspace_id}/voice-families/{family}/voices', {
        params: { path: { workspace_id: this.workspaceId, family }, query: params },
      }),
    )
  }
}
