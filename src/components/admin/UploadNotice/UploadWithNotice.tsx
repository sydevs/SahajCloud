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
 *
 * ⚠ `initialState` is load-bearing, and its absence is invisible on the normal
 * edit view. `<Upload>` sets `fileSrc` from it on mount, and gates the whole
 * staged-file block — thumbnail, filename input, remove button, crop — on
 * `value && fileSrc`. A click sets `fileSrc` itself, so only a form that
 * arrives with a `File` already staged needs it: the Bulk Upload drawer, which
 * renders one pre-staged form per file and would otherwise show an empty box.
 *
 * Payload hands a replacement Upload component NO props at all (it reads the
 * node off `useDocumentInfo().Upload`), so the other arguments its own call
 * sites pass cannot be recovered here: `UploadControls` and `customActions`
 * reach the Edit view and the bulk drawer as props. A collection configuring
 * either gets neither while this component owns the slot. Nothing here does.
 */
export function UploadWithNotice() {
  const { collectionSlug, initialState } = useDocumentInfo()
  const { getEntityConfig } = useConfig()

  if (!collectionSlug) return null
  const uploadConfig = getEntityConfig({ collectionSlug })?.upload
  if (!uploadConfig) return null

  return (
    <>
      <Upload
        collectionSlug={collectionSlug}
        initialState={initialState}
        uploadConfig={uploadConfig}
      />
      <UploadNotice />
    </>
  )
}

export default UploadWithNotice
