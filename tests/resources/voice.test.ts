import { describe, expect, it } from 'vitest'
import {
  STT_PROVIDERS,
  TTS_PROVIDERS,
  VOICE_LANGUAGES,
  VOICE_SESSION_PROVIDERS,
} from '../../src/index.js'
import type { VoiceLanguage } from '../../src/index.js'

describe('voice provider constants', () => {
  it('exposes supported voice session providers', () => {
    expect(VOICE_SESSION_PROVIDERS).toEqual(['amigo', 'gpt_realtime', 'eleven_realtime'])
  })

  it('exposes supported STT providers', () => {
    expect(STT_PROVIDERS).toEqual(['deepgram', 'openai', 'cartesia'])
  })

  it('exposes supported TTS providers', () => {
    expect(TTS_PROVIDERS).toEqual(['cartesia', 'elevenlabs'])
  })

  it('exposes the languages a workspace voice can be set to', () => {
    expect(VOICE_LANGUAGES).toEqual([
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
    ])
    // @ts-expect-error a language no TTS speaks is not a VoiceLanguage
    const unsupported: VoiceLanguage = 'xx'
    expect(VOICE_LANGUAGES).not.toContain(unsupported)
  })
})
