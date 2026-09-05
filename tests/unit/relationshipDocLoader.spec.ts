/**
 * Tests for the thumbnail-cell request-batching loader (#460).
 *
 * The loader collapses the per-row N+1 — one `/api/images` request per list
 * row — into a single batched request per collection. These tests pin the
 * coalescing/dedupe/missing-id behaviour using an injected fake fetcher. The
 * The real fetcher IS covered here, against a stubbed `globalThis.fetch`. It
 * used to be dismissed as "thin Payload REST plumbing", and #701 lived exactly
 * there: it sent no `?locale=`, so the collection read gate resolved the
 * manager's roles at the default locale and returned 403 for anyone whose
 * roles live only elsewhere. Thin is not the same as uninteresting.
 */

import { describe, expect, it, vi } from 'vitest'

import type { RelationshipDoc } from '@/components/admin/ThumbnailCell/relationshipDocLoader'
import {
  createRelationshipDocLoader,
  fetchRelationshipDocs,
} from '@/components/admin/ThumbnailCell/relationshipDocLoader'

const doc = (id: number, extra: Partial<RelationshipDoc> = {}): RelationshipDoc => ({
  id,
  url: `https://cdn/${id}`,
  mimeType: 'image/webp',
  filename: `${id}.webp`,
  ...extra,
})

const echoFetcher = () =>
  vi.fn(async (_relationTo: string, ids: Array<number | string>, _locale: string) =>
    ids.map((id) => doc(Number(id))),
  )

describe('relationshipDocLoader', () => {
  it('coalesces same-tick loads for one collection into a single fetch', async () => {
    const fetchDocs = echoFetcher()
    const loader = createRelationshipDocLoader(fetchDocs)

    const [a, b, c] = await Promise.all([
      loader.load('images', 1, 'en'),
      loader.load('images', 2, 'en'),
      loader.load('images', 3, 'en'),
    ])

    expect(fetchDocs).toHaveBeenCalledTimes(1)
    expect(fetchDocs).toHaveBeenCalledWith('images', [1, 2, 3], 'en')
    expect(a).toEqual(doc(1))
    expect(b).toEqual(doc(2))
    expect(c).toEqual(doc(3))
  })

  it('deduplicates repeated IDs within a batch', async () => {
    const fetchDocs = echoFetcher()
    const loader = createRelationshipDocLoader(fetchDocs)

    const [a, b] = await Promise.all([loader.load('images', 7, 'en'), loader.load('images', 7, 'en')])

    expect(fetchDocs).toHaveBeenCalledTimes(1)
    expect(fetchDocs).toHaveBeenCalledWith('images', [7], 'en')
    expect(a).toEqual(doc(7))
    expect(b).toEqual(doc(7))
  })

  it('resolves null for IDs the fetch does not return', async () => {
    const fetchDocs = vi.fn(async () => [doc(1)]) // id 2 deliberately missing
    const loader = createRelationshipDocLoader(fetchDocs)

    const [found, missing] = await Promise.all([loader.load('images', 1, 'en'), loader.load('images', 2, 'en')])

    expect(found).toEqual(doc(1))
    expect(missing).toBeNull()
  })

  it('keeps separate collections in separate requests', async () => {
    const fetchDocs = echoFetcher()
    const loader = createRelationshipDocLoader(fetchDocs)

    await Promise.all([loader.load('images', 1, 'en'), loader.load('files', 2, 'en')])

    expect(fetchDocs).toHaveBeenCalledTimes(2)
    expect(fetchDocs).toHaveBeenCalledWith('images', [1], 'en')
    expect(fetchDocs).toHaveBeenCalledWith('files', [2], 'en')
  })

  it('opens a fresh batch after the previous one flushes', async () => {
    const fetchDocs = echoFetcher()
    const loader = createRelationshipDocLoader(fetchDocs)

    await loader.load('images', 1, 'en')
    await loader.load('images', 2, 'en')

    expect(fetchDocs).toHaveBeenCalledTimes(2)
    expect(fetchDocs).toHaveBeenNthCalledWith(1, 'images', [1], 'en')
    expect(fetchDocs).toHaveBeenNthCalledWith(2, 'images', [2], 'en')
  })

  it('resolves null for every caller when the fetch rejects', async () => {
    const fetchDocs = vi.fn(async () => {
      throw new Error('network down')
    })
    const loader = createRelationshipDocLoader(fetchDocs)

    const results = await Promise.all([loader.load('images', 1, 'en'), loader.load('images', 2, 'en')])

    expect(results).toEqual([null, null])
  })

  it('forwards the locale it was given to the fetcher', async () => {
    const fetchDocs = echoFetcher()
    const loader = createRelationshipDocLoader(fetchDocs)

    await loader.load('images', 1, 'fr')

    expect(fetchDocs).toHaveBeenCalledWith('images', [1], 'fr')
  })

  it('keeps two locales in separate batches', async () => {
    // The response is gated per locale, so a shared batch would answer the
    // French cells from the English request (#701).
    const fetchDocs = echoFetcher()
    const loader = createRelationshipDocLoader(fetchDocs)

    await Promise.all([loader.load('images', 1, 'en'), loader.load('images', 2, 'fr')])

    expect(fetchDocs).toHaveBeenCalledTimes(2)
    expect(fetchDocs).toHaveBeenCalledWith('images', [1], 'en')
    expect(fetchDocs).toHaveBeenCalledWith('images', [2], 'fr')
  })
})

describe('fetchRelationshipDocs', () => {
  it('puts the locale in the request URL', async () => {
    // The defect in #701 was here, in the code a comment called "not worth a
    // unit test": the request carried no locale at all.
    const calls: string[] = []
    const stub = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response(JSON.stringify({ docs: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', stub)

    try {
      await fetchRelationshipDocs('images', [1, 2], 'fr')
    } finally {
      vi.unstubAllGlobals()
    }

    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/api/images')
    expect(calls[0]).toContain('locale=fr')
  })
})
