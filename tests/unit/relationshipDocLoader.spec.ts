/**
 * Tests for the thumbnail-cell request-batching loader (#460).
 *
 * The loader collapses the per-row N+1 — one `/api/images` request per list
 * row — into a single batched request per collection. These tests pin the
 * coalescing/dedupe/missing-id behaviour using an injected fake fetcher. The
 * real fetcher is thin Payload REST plumbing and is not worth a unit test.
 */

import { describe, expect, it, vi } from 'vitest'

import type { RelationshipDoc } from '@/components/admin/ThumbnailCell/relationshipDocLoader'
import { createRelationshipDocLoader } from '@/components/admin/ThumbnailCell/relationshipDocLoader'

const doc = (id: number, extra: Partial<RelationshipDoc> = {}): RelationshipDoc => ({
  id,
  url: `https://cdn/${id}`,
  mimeType: 'image/webp',
  filename: `${id}.webp`,
  ...extra,
})

const echoFetcher = () =>
  vi.fn(async (_relationTo: string, ids: Array<number | string>) =>
    ids.map((id) => doc(Number(id))),
  )

describe('relationshipDocLoader', () => {
  it('coalesces same-tick loads for one collection into a single fetch', async () => {
    const fetchDocs = echoFetcher()
    const loader = createRelationshipDocLoader(fetchDocs)

    const [a, b, c] = await Promise.all([
      loader.load('images', 1),
      loader.load('images', 2),
      loader.load('images', 3),
    ])

    expect(fetchDocs).toHaveBeenCalledTimes(1)
    expect(fetchDocs).toHaveBeenCalledWith('images', [1, 2, 3])
    expect(a).toEqual(doc(1))
    expect(b).toEqual(doc(2))
    expect(c).toEqual(doc(3))
  })

  it('deduplicates repeated IDs within a batch', async () => {
    const fetchDocs = echoFetcher()
    const loader = createRelationshipDocLoader(fetchDocs)

    const [a, b] = await Promise.all([loader.load('images', 7), loader.load('images', 7)])

    expect(fetchDocs).toHaveBeenCalledTimes(1)
    expect(fetchDocs).toHaveBeenCalledWith('images', [7])
    expect(a).toEqual(doc(7))
    expect(b).toEqual(doc(7))
  })

  it('resolves null for IDs the fetch does not return', async () => {
    const fetchDocs = vi.fn(async () => [doc(1)]) // id 2 deliberately missing
    const loader = createRelationshipDocLoader(fetchDocs)

    const [found, missing] = await Promise.all([loader.load('images', 1), loader.load('images', 2)])

    expect(found).toEqual(doc(1))
    expect(missing).toBeNull()
  })

  it('keeps separate collections in separate requests', async () => {
    const fetchDocs = echoFetcher()
    const loader = createRelationshipDocLoader(fetchDocs)

    await Promise.all([loader.load('images', 1), loader.load('files', 2)])

    expect(fetchDocs).toHaveBeenCalledTimes(2)
    expect(fetchDocs).toHaveBeenCalledWith('images', [1])
    expect(fetchDocs).toHaveBeenCalledWith('files', [2])
  })

  it('opens a fresh batch after the previous one flushes', async () => {
    const fetchDocs = echoFetcher()
    const loader = createRelationshipDocLoader(fetchDocs)

    await loader.load('images', 1)
    await loader.load('images', 2)

    expect(fetchDocs).toHaveBeenCalledTimes(2)
    expect(fetchDocs).toHaveBeenNthCalledWith(1, 'images', [1])
    expect(fetchDocs).toHaveBeenNthCalledWith(2, 'images', [2])
  })

  it('resolves null for every caller when the fetch rejects', async () => {
    const fetchDocs = vi.fn(async () => {
      throw new Error('network down')
    })
    const loader = createRelationshipDocLoader(fetchDocs)

    const results = await Promise.all([loader.load('images', 1), loader.load('images', 2)])

    expect(results).toEqual([null, null])
  })
})
