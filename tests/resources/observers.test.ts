import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigurationError } from '../../src/core/errors.js'
import {
  ObserversResource,
  observerAuthProtocols,
  type ObserverSSEEvent,
} from '../../src/resources/observers.js'
import { type WebSocketFactory } from '../../src/core/reconnecting-websocket.js'
import { type PlatformFetch } from '../../src/core/openapi-client.js'

const VALID_CALL_SID = 'CA1234567890abcdef1234567890abcdef'
const FAKE_TOKEN = 'tok-abcDEF123' // matches WebSocket subprotocol grammar

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readonly url: string
  readonly protocols: string | string[] | undefined
  readyState = 0
  sent: unknown[] = []
  private listeners = new Map<string, Set<(ev: unknown) => void>>()

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.dispatch('open', {})
    })
  }

  addEventListener(t: string, fn: (e: unknown) => void): void {
    let b = this.listeners.get(t)
    if (!b) this.listeners.set(t, (b = new Set()))
    b.add(fn)
  }
  removeEventListener(t: string, fn: (e: unknown) => void): void {
    this.listeners.get(t)?.delete(fn)
  }
  send(d: unknown): void {
    if (this.readyState !== 1) throw new Error('not open')
    this.sent.push(d)
  }
  close(code?: number, reason?: string): void {
    if (this.readyState >= 2) return
    this.readyState = 3
    this.dispatch('close', { code: code ?? 1000, reason: reason ?? '' })
  }
  emit(data: string): void {
    this.dispatch('message', { data })
  }
  serverClose(code: number, reason = ''): void {
    if (this.readyState >= 2) return
    this.readyState = 3
    this.dispatch('close', { code, reason })
  }
  private dispatch(t: string, ev: Record<string, unknown>): void {
    for (const fn of [...(this.listeners.get(t) ?? [])]) {
      try {
        fn(ev)
      } catch {
        // ignore
      }
    }
  }
}

const fakeFactory: WebSocketFactory = (u, p) => new FakeWebSocket(u, p) as unknown as WebSocket

const stubClient = {} as PlatformFetch

beforeEach(() => {
  FakeWebSocket.instances = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('observerAuthProtocols', () => {
  it('returns ["auth", token] for a valid token', () => {
    expect(observerAuthProtocols(FAKE_TOKEN)).toEqual(['auth', FAKE_TOKEN])
  })

  it('throws on empty token', () => {
    expect(() => observerAuthProtocols('')).toThrow(ConfigurationError)
  })

  it('throws on token with subprotocol-illegal characters', () => {
    expect(() => observerAuthProtocols('has space')).toThrow(/subprotocol/i)
    expect(() => observerAuthProtocols('eyJ:colon=here')).toThrow(/subprotocol/i)
  })

  it('throws on tokens longer than 4096 chars', () => {
    const huge = 'a'.repeat(4097)
    expect(() => observerAuthProtocols(huge)).toThrow(/4096/)
  })
})

describe('ObserversResource.subscribe — URL building', () => {
  it('throws ConfigurationError on a malformed callSid', () => {
    const r = new ObserversResource(stubClient, 'ws-1', 'https://api.example.com')
    expect(() =>
      r.subscribe({
        callSid: 'not-a-call-sid',
        token: FAKE_TOKEN,
        onEvent: () => {},
        webSocketFactory: fakeFactory,
      }),
    ).toThrow(/CA SID format/)
  })

  it('derives wss URL from agentBaseUrl with https', () => {
    const r = new ObserversResource(stubClient, 'ws-uuid', 'https://api.example.com')
    r.subscribe({
      callSid: VALID_CALL_SID,
      token: FAKE_TOKEN,
      onEvent: () => {},
      webSocketFactory: fakeFactory,
    })
    expect(FakeWebSocket.instances[0]!.url).toBe(
      `wss://api.example.com/agent/observe/${VALID_CALL_SID}`,
    )
  })

  it('derives ws URL from agentBaseUrl with http (local dev)', () => {
    const r = new ObserversResource(stubClient, 'ws-uuid', 'http://localhost:8080')
    r.subscribe({
      callSid: VALID_CALL_SID,
      token: FAKE_TOKEN,
      onEvent: () => {},
      webSocketFactory: fakeFactory,
    })
    expect(FakeWebSocket.instances[0]!.url).toBe(
      `ws://localhost:8080/agent/observe/${VALID_CALL_SID}`,
    )
  })

  it('honors observerUrl override', () => {
    const r = new ObserversResource(stubClient, 'ws-uuid', 'https://api.example.com')
    r.subscribe({
      callSid: VALID_CALL_SID,
      token: FAKE_TOKEN,
      observerUrl: `wss://custom-gateway.example.test/observers/${VALID_CALL_SID}`,
      onEvent: () => {},
      webSocketFactory: fakeFactory,
    })
    expect(FakeWebSocket.instances[0]!.url).toBe(
      `wss://custom-gateway.example.test/observers/${VALID_CALL_SID}`,
    )
  })

  it('rejects observerUrl override with query params', () => {
    const r = new ObserversResource(stubClient, 'ws-uuid', 'https://api.example.com')
    expect(() =>
      r.subscribe({
        callSid: VALID_CALL_SID,
        token: FAKE_TOKEN,
        observerUrl: `wss://gw.example.test/observers/${VALID_CALL_SID}?x=1`,
        onEvent: () => {},
        webSocketFactory: fakeFactory,
      }),
    ).toThrow(/query parameters or fragments/i)
  })

  it('rejects observerUrl override with non-ws scheme', () => {
    const r = new ObserversResource(stubClient, 'ws-uuid', 'https://api.example.com')
    expect(() =>
      r.subscribe({
        callSid: VALID_CALL_SID,
        token: FAKE_TOKEN,
        observerUrl: `https://gw.example.test/observers/${VALID_CALL_SID}`,
        onEvent: () => {},
        webSocketFactory: fakeFactory,
      }),
    ).toThrow(/ws: or wss:/i)
  })
})

describe('ObserversResource.subscribe — frame parsing', () => {
  it('parses well-formed JSON frames into typed events', async () => {
    const events: ObserverSSEEvent[] = []
    const r = new ObserversResource(stubClient, 'ws-uuid', 'https://api.example.com')
    const handle = r.subscribe({
      callSid: VALID_CALL_SID,
      token: FAKE_TOKEN,
      onEvent: (e) => events.push(e),
      webSocketFactory: fakeFactory,
    })

    await Promise.resolve()
    await Promise.resolve()
    FakeWebSocket.instances[0]!.emit(
      JSON.stringify({ type: 'agent_transcript_delta', text: 'hi', call_sid: 'CA1' }),
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('agent_transcript_delta')

    handle.close()
    await handle.done
  })

  it('drops non-JSON and missing-discriminator frames silently', async () => {
    const events: ObserverSSEEvent[] = []
    const r = new ObserversResource(stubClient, 'ws-uuid', 'https://api.example.com')
    const handle = r.subscribe({
      callSid: VALID_CALL_SID,
      token: FAKE_TOKEN,
      onEvent: (e) => events.push(e),
      webSocketFactory: fakeFactory,
    })
    await Promise.resolve()
    await Promise.resolve()
    FakeWebSocket.instances[0]!.emit('not json')
    FakeWebSocket.instances[0]!.emit(JSON.stringify({ no_discriminator: true }))
    FakeWebSocket.instances[0]!.emit(JSON.stringify(['array', 'payload']))
    FakeWebSocket.instances[0]!.emit(JSON.stringify({ type: 42 })) // wrong discriminator type

    expect(events).toHaveLength(0)
    handle.close()
    await handle.done
  })
})

describe('ObserversResource.subscribe — auth subprotocol wiring', () => {
  it('passes ["auth", token] subprotocol pair to the WebSocket', async () => {
    const r = new ObserversResource(stubClient, 'ws-uuid', 'https://api.example.com')
    const handle = r.subscribe({
      callSid: VALID_CALL_SID,
      token: FAKE_TOKEN,
      onEvent: () => {},
      webSocketFactory: fakeFactory,
    })
    expect(FakeWebSocket.instances[0]!.protocols).toEqual(['auth', FAKE_TOKEN])
    handle.close()
    await handle.done
  })

  it('throws synchronously for tokens that violate subprotocol grammar', () => {
    const r = new ObserversResource(stubClient, 'ws-uuid', 'https://api.example.com')
    expect(() =>
      r.subscribe({
        callSid: VALID_CALL_SID,
        token: 'has:colons',
        onEvent: () => {},
        webSocketFactory: fakeFactory,
      }),
    ).toThrow(ConfigurationError)
  })
})

describe('ObserversResource.subscribe — terminal close codes', () => {
  it('reports onError with reason=auth on 4403 close', async () => {
    const r = new ObserversResource(stubClient, 'ws-uuid', 'https://api.example.com')
    const errorSpy = vi.fn()
    const handle = r.subscribe({
      callSid: VALID_CALL_SID,
      token: FAKE_TOKEN,
      onEvent: () => {},
      onError: errorSpy,
      webSocketFactory: fakeFactory,
    })

    await Promise.resolve()
    await Promise.resolve()
    FakeWebSocket.instances[0]!.serverClose(4403, 'forbidden')
    await handle.done
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0]![0].reason).toBe('auth')
    expect(errorSpy.mock.calls[0]![0].closeCode).toBe(4403)
  })
})
