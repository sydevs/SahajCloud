/**
 * The one admin list read, which three components shared by copy before #986.
 *
 * Each case stubs `globalThis.fetch` and asserts what the fetcher does with a
 * real `Response`, because the three behaviours that differed between the
 * copies — the credentials, the refusal test, and what a refusal becomes — are
 * all readable only from the response.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { payloadListFetcher } from '@/components/admin/helpers/payloadListFetcher'

type Doc = { id: number }

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const answering = (response: Response) => {
  const stub = vi.fn(async () => response)
  vi.stubGlobal('fetch', stub)
  return stub
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('payloadListFetcher', () => {
  it('hands back the list a success answers', async () => {
    answering(json({ docs: [{ id: 1 }, { id: 2 }] }))

    expect(await payloadListFetcher<Doc>('/api/images')).toEqual({ docs: [{ id: 1 }, { id: 2 }] })
  })

  it('sends the admin cookie', async () => {
    const stub = answering(json({ docs: [] }))

    await payloadListFetcher<Doc>('/api/images')

    expect(stub).toHaveBeenCalledWith('/api/images', { credentials: 'include' })
  })

  it('leaves a list with no docs key alone, rather than inventing one', async () => {
    answering(json({ totalDocs: 0 }))

    expect(await payloadListFetcher<Doc>('/api/images')).toEqual({ totalDocs: 0 })
  })

  /**
   * The message is the point: a component explaining why it is empty has
   * nothing else to say, and `frameFetcher` threw a status line that named the
   * transport rather than the refusal.
   */
  it('throws the server’s own message on a refusal', async () => {
    answering(json({ errors: [{ message: 'You are not allowed to perform this action.' }] }, 403))

    await expect(payloadListFetcher<Doc>('/api/images')).rejects.toThrow(
      'You are not allowed to perform this action.',
    )
  })

  it('falls back to the status where a refusal sends no message', async () => {
    answering(json({}, 500))

    await expect(payloadListFetcher<Doc>('/api/images')).rejects.toThrow('answered 500')
  })

  it('throws on a refusal whose body is not JSON at all', async () => {
    answering(new Response('<html>502 Bad Gateway</html>', { status: 502 }))

    await expect(payloadListFetcher<Doc>('/api/images')).rejects.toThrow('answered 502')
  })

  /** A caller waiting on `docs` cannot tell "no list" from "not yet". */
  it('throws rather than resolving to nothing on an unparsable success', async () => {
    answering(new Response('not json', { status: 200 }))

    await expect(payloadListFetcher<Doc>('/api/images')).rejects.toThrow('no list')
  })
})
