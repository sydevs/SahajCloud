'use client'

import { useFormFields } from '@payloadcms/ui'

/** The one stage in which a batch takes a reviewer's edits. */
export const REVIEW_STAGE = 'review'

/**
 * Whether this batch's fields are the reviewer's to edit.
 *
 * ⚠ **Read from form state, not from a second request.** The jobs own every
 * other stage, so the controls have to go read-only the moment
 * `ImportProgress`'s refresh brings a new status in — and one hook means the
 * two editable fields cannot disagree about whose turn it is.
 */
export function useBatchReadOnly(): boolean {
  return useFormFields(([fields]) => fields.status?.value) !== REVIEW_STAGE
}
