import type { Config } from 'payload'

import { appendDocumentControl } from '@/lib/admin/documentControls'

/** The import-map path Payload mounts; also what the coverage spec looks for. */
export const UPLOAD_NOTICE = '@/components/admin/UploadNotice'

/**
 * Gives every upload collection the uploading notice, so a new one cannot ship
 * without feedback during a multipart save (#888).
 *
 * ⚠ `storagePlugin` applies this **above** its `cloudStoragePlugin` call, so it
 * does not depend on the credentials or on `enabled`. A save still posts a file
 * with the plugin disabled and with the Cloudflare credentials absent — local
 * dev, the test suite, `migrate:create` — and those are the paths a notice
 * mounted only where an adapter exists would miss.
 *
 * Keyed on `collection.upload` rather than `STORAGE_BACKENDS`, which is what
 * makes the coverage need no wiring: a new upload collection is covered before
 * anyone picks its backend.
 *
 * ⚠ **Not the `edit.Upload` slot**, which *replaces* Payload's upload box: a
 * collection with its own Upload component — `AudioUpload` today, and silently
 * every future one — would be skipped, and Payload's own call site, props
 * included, re-implemented.
 */
export const withUploadNotice = (config: Config): Config =>
  appendDocumentControl(config, {
    collections: (collection) => Boolean(collection.upload),
    component: UPLOAD_NOTICE,
  })
