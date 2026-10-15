/**
 * Storage module barrel export
 *
 * Provides Cloudflare-native storage adapters and URL field factories
 * for PayloadCMS upload collections.
 */

// Storage plugin (default export)
export { storagePlugin } from './storagePlugin'
export { storagePlugin as default } from './storagePlugin'

// Upload size ceilings, and the 413 that names them
export { uploadErrorPlugin } from './uploadErrorPlugin'
export {
  UPLOAD_FILE_SIZE_LIMIT,
  UPLOAD_REQUEST_SIZE_LIMIT,
  UPLOAD_SIZE_LIMIT_MESSAGE,
} from './uploadValidation'

// Storage adapters
export { cloudflareImagesAdapter, getCloudflareImagesUrl } from './cloudflareImagesAdapter'
export { cloudflareStreamAdapter, getCloudflareStreamMp4Url, getCloudflareStreamThumbnailUrl } from './cloudflareStreamAdapter'
export { r2NativeAdapter, getR2Url } from './r2NativeAdapter'
export { mixedMediaAdapter } from './mixedMediaAdapter'

// Filename utilities
export { generateR2Key, generateCloudflareImageId } from './filenameUtils'

// MIME type utilities
export { getMimeCategory } from './mimeUtils'
export type { MimeCategory } from './mimeUtils'

// URL field factories
export { virtualUrlField, previewUrlField, mixedMediaUrlField } from './urlFields'
