import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchWithTimeout } from '@/lib/utilities/fetchWithTimeout'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchWithTimeout', () => {
  it('resolves with the response and passes an AbortSignal through to fetch', async () => {
    const response = new Response('ok')
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)

    await expect(fetchWithTimeout('https://example.test', { timeoutMs: 1000 })).resolves.toBe(
      response,
    )

    const init = spy.mock.calls[0]?.[1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('forwards method/headers but strips timeoutMs before calling fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())

    await fetchWithTimeout('https://example.test', {
      method: 'POST',
      headers: { 'X-Test': '1' },
      timeoutMs: 1000,
    })

    const init = spy.mock.calls[0]?.[1] as RequestInit & { timeoutMs?: number }
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'X-Test': '1' })
    expect(init.timeoutMs).toBeUndefined()
  })

  it('aborts and throws a timeout error when the upstream hangs past timeoutMs', async () => {
    // A fetch that never resolves on its own — it only settles when its signal aborts,
    // mirroring how the platform fetch rejects on an AbortController abort.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        }),
    )

    await expect(fetchWithTimeout('https://example.test', { timeoutMs: 10 })).rejects.toThrow(
      /timed out after 10ms/,
    )
  })
})
