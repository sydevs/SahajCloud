/**
 * Storage module barrel export
 *
 * Provides Cloudflare-native storage adapters and URL field factories
 * for PayloadCMS upload collections.
 */

// Storage plugin (default export)
export { storagePlugin } from './storagePlugin'
export { storagePlugin as default } from './storagePlugin'

// Storage adapters
export { cloudflareImagesAdapter, getCloudflareImagesUrl } from './cloudflareImagesAdapter'
export { cloudflareStreamAdapter, getCloudflareStreamMp4Url, getCloudflareStreamThumbnailUrl } from './cloudflareStreamAdapter'
export { r2NativeAdapter, getR2Url, sanitizeFilename } from './r2NativeAdapter'
export { mixedMediaAdapter } from './mixedMediaAdapter'

// MIME type utilities
export { getMimeCategory } from './mimeUtils'
export type { MimeCategory } from './mimeUtils'

// URL field factories
export {
  virtualUrlField,
  previewUrlField,
  mixedMediaUrlField,
} from './urlFields'
