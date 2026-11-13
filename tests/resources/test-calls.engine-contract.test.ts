import { describe, expect, it, vi } from 'vitest'
import { AmigoClient } from '../../src/index.js'
import type { TestCallEvent } from '../../src/index.js'
import type { WebSocketFactory } from '../../src/core/reconnecting-websocket.js'

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'
const TOKEN = 'header.payload.signature'

interface EngineClose {
  code: number
  reason: string
}

/**
 * Admission rules of the agent engine's `WS /test-call` handler that depend
 * only on the connect request, in the order the handler applies them.
 * Returns the close the engine sends, or null when the handshake proceeds.
 */
function engineAdmission(url: URL, protocols: string | string[] | undefined): EngineClose | null {
  const offered = typeof protocols === 'string' ? [protocols] : (protocols ?? [])
  if (offered.length < 2 || offered[0] !== 'auth' || !offered[1]) {
    return { code: 4001, reason: 'Missing token' }
  }
  const query = url.searchParams
  if (!query.get('service_id')) return { code: 4004, reason: 'service_id is required' }
  const scenario = query.get('scenario') ?? 'inbound'
  if (!['inbound', 'outbound', 'silent'].includes(scenario)) {
    return { code: 4005, reason: 'scenario must be inbound, outbound, or silent' }
  }
  if (scenario === 'outbound' && !query.get('outbound_task_entity_id')) {
    return { code: 4006, reason: 'outbound scenario requires outbound_task_entity_id' }
  }
  if (query.get('encoding') !== 'mulaw') return { code: 4008, reason: 'encoding must be mulaw' }
  return null
}

class EngineSocket {
  binaryType: 'arraybuffer' | 'blob' = 'blob'
  readyState = 0
  readonly refusal: EngineClose | null
  private readonly listeners = new Map<string, Set<(event: never) => void>>()

  constructor(url: string, protocols?: string | string[]) {
    this.refusal = engineAdmission(new URL(url), protocols)
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(): void {}

  close(code?: number, reason?: string): void {
    this.readyState = 3
    this.dispatch('close', { code: code ?? 1000, reason: reason ?? '', wasClean: true })
  }

  /** Complete the connect the way the engine would for this request. */
  settleHandshake(): void {
    if (this.refusal) {
      this.readyState = 3
      this.dispatch('close', { ...this.refusal, wasClean: true })
      return
    }
    this.readyState = 1
    this.dispatch('open', {})
  }

  serverFrame(payload: Record<string, unknown>): void {
    this.dispatch('message', { data: JSON.stringify(payload) })
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never)
  }
}

function connect(): {
  socket: EngineSocket
  onOpen: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
  events: TestCallEvent[]
} {
  const sockets: EngineSocket[] = []
  const factory: WebSocketFactory = (url, protocols) => {
    const socket = new EngineSocket(url, protocols)
    sockets.push(socket)
    return socket as unknown as WebSocket
  }
  const client = new AmigoClient({
    apiKey: 'api-key',
    workspaceId: WORKSPACE_ID,
    baseUrl: 'https://platform.example.com',
    agentBaseUrl: 'https://voice.example.com',
    fetch: vi.fn() as unknown as typeof fetch,
  })
  const onOpen = vi.fn()
  const onClose = vi.fn()
  const events: TestCallEvent[] = []
  client.testCalls.connect({
    serviceId: '00000000-0000-0000-0000-0000000000aa',
    token: TOKEN,
    onAudio: vi.fn(),
    onEvent: (event) => events.push(event),
    onOpen,
    onClose,
    webSocketFactory: factory,
  })
  const socket = sockets[0]
  if (!socket) throw new Error('connect() did not open a socket')
  return { socket, onOpen, onClose, events }
}

describe('TestCallsResource against the agent-engine test-call contract', () => {
  it('is admitted by the engine with default options', () => {
    const { socket, onOpen, onClose } = connect()
    socket.settleHandshake()

    expect(onClose).not.toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('delivers the output encoding the engine names on its ready frame', () => {
    const { socket, events } = connect()
    socket.readyState = 1
    socket.serverFrame({ type: 'ready', output_encoding: 'mulaw', output_sample_rate: 8000 })

    expect(events).toEqual([{ type: 'ready', output_encoding: 'mulaw', output_sample_rate: 8000 }])
  })
})
