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
export { routerAdapter } from './routerAdapter'

// URL field factories
export {
  virtualUrlField,
  previewUrlField,
  frameUrlField,
} from './urlFields'
