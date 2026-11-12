'use client'

import type { SelectFieldClientComponent } from 'payload'

import { SelectField, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React from 'react'

import { transcribableMedia } from '@/lib/transcripts/media'

/**
 * A file's Spoken language: Payload's own select, shown only for a file that
 * has one to state — an audio or video file (#1016).
 *
 * ⚠ **A component, because `admin.condition` cannot see a file being chosen.**
 * A condition runs on the server over the form's data, and an upload's type is
 * stored only once it is saved, so on the create form it can answer nothing.
 * The browser knows: the chosen `File` sits at form state's `file` path, where
 * Payload's `<Upload>` writes it (`UploadNotice` reads it the same way). A
 * saved file answers from its stored `mimeType`.
 */
export const SpokenLanguageField: SelectFieldClientComponent = (props) => {
  const chosen = useFormFields(([fields]) => fields?.file?.value)
  const { data } = useDocumentInfo()
  const mimeType = chosen instanceof File ? chosen.type : data?.mimeType
  if (!transcribableMedia(mimeType)) return null
  return <SelectField {...props} />
}

export default SpokenLanguageField
