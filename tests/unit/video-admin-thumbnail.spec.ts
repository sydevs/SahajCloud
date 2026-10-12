/**
 * Every collection that can hold a video declares `upload.adminThumbnail`.
 *
 * This guard is what the per-collection mount is traded against (#927): the
 * behaviour stays one readable line in each collection's own file, instead of a
 * transform applied to all of them the way `withUploadNotice` is (#892), and
 * nothing silently loses it. So it walks the real `collections` array — which
 * collections admit video is the thing under test, and a fixture would assume it.
 */
import type { CollectionConfig } from 'payload'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ serverEnv: {} }))

import { collections } from '@/collections'
import { serverEnv } from '@/lib/env'
import { videoAdminThumbnail } from '@/plugins/storage/adminThumbnail'

const env = serverEnv as unknown as Record<string, string | undefined>
const DELIVERY_URL = 'https://customer-test.cloudflarestream.com'

/** An absent `mimeTypes` accepts every type, `video/*` among them — so it counts. */
const acceptsVideo = (collection: CollectionConfig): boolean => {
  const { upload } = collection
  if (!upload) return false
  if (typeof upload !== 'object') return true
  return upload.mimeTypes?.some((mimeType) => mimeType.startsWith('video/')) ?? true
}

const adminThumbnailOf = (collection: CollectionConfig) =>
  typeof collection.upload === 'object' ? collection.upload.adminThumbnail : undefined

const videoCollections = collections.filter(acceptsVideo)

afterEach(() => {
  delete env.CLOUDFLARE_STREAM_DELIVERY_URL
})

describe('adminThumbnail coverage', () => {
  it('mounts the shared helper on every video-capable collection', () => {
    // arrayContaining, not toEqual: a new video collection that wired itself
    // correctly must not redden this, but dropping one of these three must.
    expect(videoCollections.map((collection) => collection.slug)).toEqual(
      expect.arrayContaining(['files', 'frames', 'videos']),
    )

    // Identity, not `typeof === 'function'`: a hand-rolled closure is the drift
    // one shared helper exists to prevent.
    expect(
      videoCollections
        .filter((collection) => adminThumbnailOf(collection) !== videoAdminThumbnail)
        .map((collection) => collection.slug),
    ).toEqual([])
  })
})

describe('videoAdminThumbnail', () => {
  it('composes the Stream still for a video', () => {
    env.CLOUDFLARE_STREAM_DELIVERY_URL = DELIVERY_URL

    expect(videoAdminThumbnail({ doc: { filename: 'abc123', mimeType: 'video/mp4' } })).toBe(
      `${DELIVERY_URL}/abc123/thumbnails/thumbnail.jpg?height=320`,
    )
  })

  // Each case configures the delivery URL, so a null is proved to come from the
  // document rather than from an unconfigured environment — the case below.
  it.each([
    ['an image', { filename: 'photo.jpg', mimeType: 'image/jpeg' }],
    ['a pdf', { filename: 'doc.pdf', mimeType: 'application/pdf' }],
    ['audio', { filename: 'track.mp3', mimeType: 'audio/mpeg' }],
    ['an unset mimeType', { filename: 'abc123' }],
    ['a missing filename', { mimeType: 'video/mp4' }],
    ['a non-string filename', { filename: 123, mimeType: 'video/mp4' }],
  ])('returns null for %s', (_label, doc) => {
    env.CLOUDFLARE_STREAM_DELIVERY_URL = DELIVERY_URL

    expect(videoAdminThumbnail({ doc })).toBeNull()
  })

  it('returns null for a video when Stream has no delivery URL', () => {
    expect(videoAdminThumbnail({ doc: { filename: 'abc123', mimeType: 'video/mp4' } })).toBeNull()
  })
})
