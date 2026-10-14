import type { GetAdminThumbnail } from 'payload'

import { getCloudflareStreamThumbnailUrl } from './cloudflareStreamAdapter'
import { getMimeCategory } from './mimeUtils'

/** The height the edit header's Stream still asks Cloudflare to render. */
const THUMBNAIL_HEIGHT = 320

/**
 * `upload.adminThumbnail` for any collection that accepts video.
 *
 * Mount it on every one of them. Payload's own upload components draw
 * `thumbnailURL || url`, and a video's `url` is the HLS manifest, which no image
 * tag can render — so a collection declaring none shows a generic file icon, and
 * no amount of `previewUrl` wiring reaches that surface.
 *
 * Never returns the Payload file route (`/api/<slug>/file/<filename>`):
 * Cloudflare serves these bytes, not the Worker, so that URL 500s in production.
 * Null is the safe answer, and it hands a non-video document back to `url`.
 */
export const videoAdminThumbnail: GetAdminThumbnail = ({ doc }) => {
  const { filename, mimeType } = doc

  if (typeof filename !== 'string' || typeof mimeType !== 'string') return null
  if (getMimeCategory(mimeType) !== 'video') return null

  return getCloudflareStreamThumbnailUrl(filename, THUMBNAIL_HEIGHT) ?? null
}
