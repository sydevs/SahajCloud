import type { Config } from 'payload'

/**
 * A string path, not an import: Payload resolves `admin.components` through the
 * generated import map, and importing a client component here would pull it
 * into the server config graph.
 */
export const UPLOAD_NOTICE = '@/components/admin/UploadNotice'

/**
 * Gives every upload collection the uploading notice, so a new one cannot ship
 * without feedback during a multipart save (#888).
 *
 * ⚠ `storagePlugin` applies this **above** its two early returns. A save still
 * posts a file with the plugin disabled and with the Cloudflare credentials
 * absent — local dev, the test suite, `migrate:create` — and those are the
 * paths a notice folded in below the returns would miss.
 *
 * Keyed on `collection.upload` rather than `STORAGE_BACKENDS`, which is what
 * makes the coverage need no wiring: a new upload collection is covered before
 * anyone picks its backend.
 *
 * `beforeDocumentControls` is an **additive** array slot, rendered
 * unconditionally beside the Save button and inside the `<Form>` the notice
 * reads. That is what makes the coverage total: the `edit.Upload` slot
 * *replaces* Payload's upload box, so mounting there would mean skipping any
 * collection with its own Upload component — `AudioUpload` today, and silently
 * every future one — and re-implementing Payload's own call site, props
 * included.
 */
export const withUploadNotice = (config: Config): Config => ({
  ...config,
  collections: config.collections?.map((collection) => {
    if (!collection.upload) return collection

    const edit = collection.admin?.components?.edit

    return {
      ...collection,
      admin: {
        ...collection.admin,
        components: {
          ...collection.admin?.components,
          edit: {
            ...edit,
            beforeDocumentControls: [...(edit?.beforeDocumentControls ?? []), UPLOAD_NOTICE],
          },
        },
      },
    }
  }),
})
