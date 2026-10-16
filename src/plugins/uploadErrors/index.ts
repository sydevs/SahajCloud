/**
 * Upload Errors Plugin — answers Payload's unnamed over-limit 413 with a sentence
 * naming both ceilings, instead of only that one was reached. See `uploadErrorPlugin`.
 */

export { isOversizedUploadError, uploadErrorPlugin } from './uploadErrorPlugin'
