/**
 * A video needs `upload.adminThumbnail`, on every collection that accepts one.
 *
 * Payload's own edit header draws `thumbnailURL || url`, and for a video `url`
 * is the HLS manifest — unrenderable in an image tag, so the panel falls back
 * to a generic file icon (#927). `thumbnailURL` comes from `adminThumbnail`
 * alone, so a collection that declares none shows the icon however well its
 * `previewUrl` field is wired.
 *
 * The guard runs over the **real** `collections` array rather than a fixture:
 * which collections admit `video/*` is the very thing under test, so a fixture
 * would assume it. It is also why the check is not applied automatically to
 * every upload collection the way `withUploadNotice` is (#892) — one visible
 * line per collection keeps the behaviour readable in the collection's own
 * file, and this spec supplies the "cannot be missed".
 */
import type { CollectionConfig } from 'payload'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ serverEnv: {} }))

import { collections } from '@/collections'
import { serverEnv } from '@/lib/env'
import { videoAdminThumbnail } from '@/plugins/storage/adminThumbnail'

const env = serverEnv as unknown as Record<string, string | undefined>
const DELIVERY_URL = 'https://customer-test.cloudflarestream.com'

const uploadOf = (collection: CollectionConfig) =>
  typeof collection.upload === 'object' ? collection.upload : undefined

const videoCollections = (collections as CollectionConfig[]).filter((collection) =>
  (uploadOf(collection)?.mimeTypes ?? []).some((mimeType) => mimeType.startsWith('video/')),
)

afterEach(() => {
  delete env.CLOUDFLARE_STREAM_DELIVERY_URL
})

describe('adminThumbnail coverage', () => {
  it('finds the collections that accept video', () => {
    expect(videoCollections.map((collection) => collection.slug).sort()).toEqual([
      'files',
      'frames',
      'videos',
    ])
  })

  it('declares an adminThumbnail function on each of them', () => {
    expect(
      videoCollections
        .filter((collection) => typeof uploadOf(collection)?.adminThumbnail !== 'function')
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

  /**
   * Null hands the surface back to `url`, which is correct for an image and the
   * only safe answer for a video with nowhere to point: the Payload file route
   * 500s in production, since Cloudflare serves these bytes and not the Worker.
   */
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

  it('returns null for a video when no delivery URL is configured', () => {
    expect(videoAdminThumbnail({ doc: { filename: 'abc123', mimeType: 'video/mp4' } })).toBeNull()
  })
})
