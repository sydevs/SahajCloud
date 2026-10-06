'use client'

import { Upload, useConfig, useDocumentInfo } from '@payloadcms/ui'

import { UploadNotice } from './UploadNotice'

/**
 * Payload's native `<Upload>` with the upload notice beneath it. Wired as the
 * default `admin.components.edit.Upload` by `uploadNoticePlugin`, so a new
 * upload collection carries the notice with no per-collection wiring.
 *
 * `<Upload>`'s own `UploadControls` slot cannot carry it: the slot renders
 * inside the dropzone, which the staged-file preview replaces the moment a file
 * is chosen — exactly when the notice is needed
 * (`node_modules/@payloadcms/ui/dist/elements/Upload/index.js`).
 */
export function UploadWithNotice() {
  const { collectionSlug } = useDocumentInfo()
  const { getEntityConfig } = useConfig()

  if (!collectionSlug) return null
  const uploadConfig = getEntityConfig({ collectionSlug })?.upload
  if (!uploadConfig) return null

  return (
    <>
      <Upload collectionSlug={collectionSlug} uploadConfig={uploadConfig} />
      <UploadNotice />
    </>
  )
}

export default UploadWithNotice
