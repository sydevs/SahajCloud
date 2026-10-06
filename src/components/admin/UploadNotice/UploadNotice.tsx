'use client'

import { Spinner, useFormFields, useFormProcessing } from '@payloadcms/ui'

/**
 * The feedback a multipart save does not give: between submit and the response
 * the button fades and nothing else changes, so a large file on a slow
 * connection reads as a frozen page (#888).
 *
 * `useFormProcessing()` alone is not the signal — it is equally true of a save
 * that posts no file, and `data-form-ready` is also false while the form
 * initializes. The staged `File` sits at form state's `file` path, where
 * Payload's own `<Upload>` writes it through `useField({ path: 'file' })`, so
 * the two together mean bytes are in flight.
 */
export function UploadNotice() {
  const processing = useFormProcessing()
  const pendingFile = useFormFields(([fields]) => fields?.file?.value)

  if (!processing || !(pendingFile instanceof File)) return null

  return <Spinner loadingText="Uploading, please keep this page open" size="sm" />
}

export default UploadNotice
