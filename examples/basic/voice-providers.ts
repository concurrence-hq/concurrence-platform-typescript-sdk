import type { SttProvider, TtsProvider, VoiceSessionProvider } from '@amigo-ai/platform-sdk'

export const defaultVoiceRuntime = 'concurrence' satisfies VoiceSessionProvider
export const defaultSttProvider = 'deepgram' satisfies SttProvider
export const defaultTtsProvider = 'cartesia' satisfies TtsProvider

export const agentVoiceConfig = {
  voice_id: 'voice-abc123',
  session_provider: defaultVoiceRuntime,
}

export const serviceVoiceConfig = {
  session_provider: defaultVoiceRuntime,
}

export const workspaceVoiceSettings = {
  stt_provider: defaultSttProvider,
  tts_provider: defaultTtsProvider,
}
