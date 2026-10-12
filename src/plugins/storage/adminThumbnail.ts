import type { GetAdminThumbnail } from 'payload'

import { getCloudflareStreamThumbnailUrl } from './cloudflareStreamAdapter'
import { getMimeCategory } from './mimeUtils'

/** Matches `previewUrlField`'s default, so both surfaces request one Stream render. */
const THUMBNAIL_HEIGHT = 320

/**
 * `upload.adminThumbnail` for any collection that accepts video.
 *
 * Mount it on every one of them: Payload's own components (the edit header,
 * upload-field cards, the bulk-upload sidebar, the default file cell) draw
 * `thumbnailURL || url`, and for a video `url` is the HLS manifest, which an
 * image tag cannot render.
 *
 * Returns null for anything but a video, so an image falls back to `url` as
 * before. Never returns the Payload file route (`/api/<slug>/file/<filename>`):
 * Cloudflare serves these bytes, not the Worker, so that URL 500s in production.
 */
export const videoAdminThumbnail: GetAdminThumbnail = ({ doc }) => {
  const { filename, mimeType } = doc

  if (typeof filename !== 'string') return null
  if (getMimeCategory(typeof mimeType === 'string' ? mimeType : undefined) !== 'video') return null

  return getCloudflareStreamThumbnailUrl(filename, THUMBNAIL_HEIGHT) ?? null
}
