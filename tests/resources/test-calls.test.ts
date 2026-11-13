import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AmigoClient, ConfigurationError, testCallAuthProtocols } from '../../src/index.js'
import type { TestCallUrlParams } from '../../src/index.js'
import type { WebSocketFactory } from '../../src/core/reconnecting-websocket.js'

const WORKSPACE_ID = 'ws-00000000-0000-0000-0000-000000000001'
const TOKEN = 'header.payload.signature'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readonly url: string
  readonly protocols: string | string[] | undefined
  binaryType: 'arraybuffer' | 'blob' = 'blob'
  readyState = 0
  sent: unknown[] = []
  closeArgs: [number | undefined, string | undefined] | null = null
  private readonly listeners = new Map<string, Set<(event: never) => void>>()

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: unknown): void {
    this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    this.closeArgs = [code, reason]
    this.readyState = 3
    this.dispatch('close', { code: code ?? 1000, reason: reason ?? '', wasClean: true })
  }

  open(): void {
    this.readyState = 1
    this.dispatch('open', {})
  }

  message(data: unknown): void {
    this.dispatch('message', { data })
  }

  error(): void {
    this.dispatch('error', {})
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never)
  }
}

const factory: WebSocketFactory = (url, protocols) =>
  new FakeWebSocket(url, protocols) as unknown as WebSocket

function createClient(agentBaseUrl = 'https://voice.example.com'): AmigoClient {
  return new AmigoClient({
    apiKey: 'api-key',
    workspaceId: WORKSPACE_ID,
    baseUrl: 'https://platform.example.com',
    agentBaseUrl,
    fetch: vi.fn() as unknown as typeof fetch,
  })
}

beforeEach(() => {
  FakeWebSocket.instances = []
})

describe('TestCallsResource.url', () => {
  it('builds the agent-engine URL with SDK-managed query parameters', () => {
    const url = new URL(
      createClient().testCalls.url({
        serviceId: 'service 1',
        callerId: ' +15555550123 ',
      }),
    )

    expect(url.origin).toBe('wss://voice.example.com')
    expect(url.pathname).toBe('/agent/test-call')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      workspace_id: WORKSPACE_ID,
      service_id: 'service 1',
      encoding: 'mulaw',
      caller_id: '+15555550123',
    })
  })

  it('supports full preview URL overrides and still requests mu-law', () => {
    const url = createClient().testCalls.url({
      serviceId: 'svc-1',
      testCallUrl: 'ws://localhost:8080/custom/test-call',
    })

    expect(url).toBe(
      `ws://localhost:8080/custom/test-call?workspace_id=${WORKSPACE_ID}&service_id=svc-1&encoding=mulaw`,
    )
  })

  it('has no audio format option: untyped format inputs never reach the wire', () => {
    const untyped = {
      serviceId: 'svc-1',
      sampleRate: 24_000,
      encoding: 'pcm16',
    } as TestCallUrlParams
    const url = new URL(createClient().testCalls.url(untyped))

    expect(url.searchParams.getAll('encoding')).toEqual(['mulaw'])
    expect(url.searchParams.has('sample_rate')).toBe(false)
  })

  it('preserves the agent-engine origin when request options are scoped', () => {
    const url = createClient().testCalls.withOptions({ timeout: 1_000 }).url({ serviceId: 'svc-1' })

    expect(new URL(url).origin).toBe('wss://voice.example.com')
  })

  it('rejects missing identifiers, invalid scenarios, and unsafe overrides', () => {
    const resource = createClient().testCalls

    expect(() => resource.url({ serviceId: '' })).toThrow(ConfigurationError)
    expect(() => resource.url({ serviceId: 'svc', scenario: 'invalid' as 'inbound' })).toThrow(
      'scenario must be inbound, outbound, or silent',
    )
    expect(() =>
      resource.url({ serviceId: 'svc', testCallUrl: 'https://voice.example.com/test-call' }),
    ).toThrow('must use ws: or wss:')
    expect(() =>
      resource.url({ serviceId: 'svc', testCallUrl: 'wss://voice.example.com/test-call?token=x' }),
    ).toThrow('must not include query parameters')
  })
})

describe('testCallAuthProtocols', () => {
  it('returns the auth subprotocol pair', () => {
    expect(testCallAuthProtocols(TOKEN)).toEqual(['auth', TOKEN])
  })

  it('rejects blank and browser-unsafe bearer tokens', () => {
    expect(() => testCallAuthProtocols('')).toThrow('token is required')
    expect(() => testCallAuthProtocols('token/with/slashes')).toThrow('characters browsers reject')
  })
})

describe('TestCallsResource.connect', () => {
  it('opens an authenticated duplex socket and dispatches typed frames', async () => {
    const onAudio = vi.fn()
    const onEvent = vi.fn()
    const onOpen = vi.fn()
    const onClose = vi.fn()
    const handle = createClient().testCalls.connect({
      serviceId: 'svc-1',
      token: TOKEN,
      onAudio,
      onEvent,
      onOpen,
      onClose,
      webSocketFactory: factory,
    })
    const socket = FakeWebSocket.instances[0]!

    expect(socket.protocols).toEqual(['auth', TOKEN])
    expect(socket.binaryType).toBe('arraybuffer')
    socket.open()
    expect(handle.readyState).toBe(1)
    expect(onOpen).toHaveBeenCalledOnce()

    const audio = new ArrayBuffer(4)
    socket.message(audio)
    socket.message(JSON.stringify({ type: 'session_started', call_sid: 'CA123' }))
    socket.message(JSON.stringify({ type: 'call_progress', phase: 'initializing' }))
    socket.message(JSON.stringify({ type: 'call_progress', phase: 'ready' }))
    socket.message(JSON.stringify({ type: 'interruption' }))
    socket.message(
      JSON.stringify({ type: 'ready', output_encoding: 'mulaw', output_sample_rate: 8000 }),
    )
    socket.message(JSON.stringify({ type: 'agent_transcript', text: 'Hello' }))
    socket.message(JSON.stringify({ type: 'future_event', value: true }))
    socket.message('not-json')
    socket.message(JSON.stringify({ type: 'conversation_complete', reason: 'terminal_state' }))

    expect(onAudio).toHaveBeenCalledWith(audio)
    expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'session_started', call_sid: 'CA123' },
      { type: 'call_progress', phase: 'initializing' },
      { type: 'call_progress', phase: 'ready' },
      { type: 'interruption' },
      { type: 'ready', output_encoding: 'mulaw', output_sample_rate: 8000 },
      { type: 'agent_transcript', text: 'Hello' },
      { type: 'conversation_complete', reason: 'terminal_state' },
    ])

    const microphoneFrame = new ArrayBuffer(8)
    handle.sendAudio(microphoneFrame)
    handle.injectEvent(' Appointment changed ', 'Scheduler')
    handle.injectGuidance('Offer Tuesday')
    handle.refreshContext()
    handle.stop()
    await handle.done

    expect(socket.sent).toEqual([
      microphoneFrame,
      JSON.stringify({
        type: 'inject_event',
        message: 'Appointment changed',
        sender: 'Scheduler',
      }),
      JSON.stringify({ type: 'inject_guidance', message: 'Offer Tuesday' }),
      JSON.stringify({ type: 'refresh_context' }),
      JSON.stringify({ type: 'stop' }),
    ])
    expect(socket.closeArgs).toEqual([1000, 'User ended test call'])
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('passes mu-law bytes through unchanged in both directions', () => {
    const received: ArrayBuffer[] = []
    const handle = createClient().testCalls.connect({
      serviceId: 'svc-1',
      token: TOKEN,
      onAudio: (audio) => received.push(audio),
      webSocketFactory: factory,
    })
    const socket = FakeWebSocket.instances[0]!
    socket.open()

    // 0xff is mu-law silence; 0x00 and 0x80 are the two full-scale samples.
    const fromEngine = Uint8Array.from([0xff, 0x7f, 0x00, 0x80]).buffer
    socket.message(fromEngine)
    const microphone = Uint8Array.from([0x80, 0x00, 0x7f, 0xff, 0xd5])
    handle.sendAudio(microphone)

    expect(received).toHaveLength(1)
    expect(received[0]).toBe(fromEngine)
    expect([...new Uint8Array(received[0]!)]).toEqual([0xff, 0x7f, 0x00, 0x80])
    expect(socket.sent).toHaveLength(1)
    expect(socket.sent[0]).toBe(microphone)
    expect([...microphone]).toEqual([0x80, 0x00, 0x7f, 0xff, 0xd5])
  })

  it('does not deliver a ready frame that names a format outside the mu-law contract', () => {
    const onEvent = vi.fn()
    createClient().testCalls.connect({
      serviceId: 'svc-1',
      token: TOKEN,
      onAudio: vi.fn(),
      onEvent,
      webSocketFactory: factory,
    })
    const socket = FakeWebSocket.instances[0]!
    socket.open()

    socket.message(
      JSON.stringify({ type: 'ready', output_encoding: 'pcm16', output_sample_rate: 24000 }),
    )
    socket.message(JSON.stringify({ type: 'ready', output_sample_rate: 8000 }))
    socket.message(JSON.stringify({ type: 'ready', output_encoding: 'mulaw' }))
    socket.message(JSON.stringify({ type: 'conversation_complete' }))
    expect(onEvent).not.toHaveBeenCalled()

    socket.message(
      JSON.stringify({ type: 'ready', output_encoding: 'mulaw', output_sample_rate: 8000 }),
    )
    expect(onEvent.mock.calls).toEqual([
      [{ type: 'ready', output_encoding: 'mulaw', output_sample_rate: 8000 }],
    ])
  })

  it('surfaces socket errors and supports aborting a call', async () => {
    const controller = new AbortController()
    const onError = vi.fn()
    const handle = createClient().testCalls.connect({
      serviceId: 'svc-1',
      token: TOKEN,
      onAudio: vi.fn(),
      onError,
      signal: controller.signal,
      webSocketFactory: factory,
    })
    const socket = FakeWebSocket.instances[0]!

    socket.error()
    expect(onError).toHaveBeenCalledOnce()
    controller.abort()
    await handle.done
    expect(socket.closeArgs).toEqual([1000, 'Aborted'])
  })

  it('rejects audio writes before the socket opens', () => {
    const handle = createClient().testCalls.connect({
      serviceId: 'svc-1',
      token: TOKEN,
      onAudio: vi.fn(),
      webSocketFactory: factory,
    })

    expect(() => handle.sendAudio(new ArrayBuffer(2))).toThrow('WebSocket is not open')
  })

  it('validates outbound scenarios and emits their query parameters', () => {
    const resource = createClient().testCalls
    expect(() => resource.url({ serviceId: 'svc', scenario: 'outbound' })).toThrow(
      'outboundTaskEntityId is required',
    )

    const url = new URL(
      resource.url({
        serviceId: 'svc',
        scenario: 'outbound',
        outboundTaskEntityId: 'task-entity',
        versionSet: 'candidate',
        systemPrompt: 'Be concise',
      }),
    )
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      scenario: 'outbound',
      outbound_task_entity_id: 'task-entity',
      version_set: 'candidate',
      system_prompt: 'Be concise',
    })
  })
})
