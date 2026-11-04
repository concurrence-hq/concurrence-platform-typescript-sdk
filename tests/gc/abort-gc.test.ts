import { describe, expect, it, vi } from 'vitest'
import { createPlatformClient } from '../../src/core/openapi-client.js'

// undici's Request.clone() follows its parent signal through a weak reference,
// so a transport signal derived from a clone can lose the caller's abort after
// a garbage collection. These tests need `--expose-gc` (the gc project in vitest.config.ts).
const gc = globalThis.gc
if (!gc) throw new Error('abort-gc tests require --expose-gc')

describe.each([
  ['signal path', undefined],
  ['timeout path', 60_000],
])('caller abort survives garbage collection (%s)', (_name, timeout) => {
  it('aborts the transport signal after a GC', async () => {
    let transportSignal: AbortSignal | undefined
    let started = false
    const fetcher: typeof fetch = async (input) => {
      const request = input as Request
      // Hold the transport request strongly, as a real transport does.
      held = request
      transportSignal = request.signal
      started = true
      return new Promise<Response>((_, reject) =>
        request.signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        }),
      )
    }
    let held: Request | undefined
    const client = createPlatformClient({
      apiKey: 'token',
      baseUrl: 'https://api.example.test',
      identityBaseUrl: 'https://identity.example.test',
      fetch: fetcher,
      timeout,
      maxRetries: 0,
    })
    const controller = new AbortController()

    const pending = client.GET('/v1/audit-log/me', {
      signal: controller.signal,
      params: { query: {} },
    })
    void pending.catch(() => undefined)
    await vi.waitFor(() => expect(started).toBe(true))

    for (let i = 0; i < 5; i++) {
      gc()
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    controller.abort()

    expect(transportSignal?.aborted).toBe(true)
    await expect(pending).rejects.toBeDefined()
    expect(held).toBeDefined()
  })
})
