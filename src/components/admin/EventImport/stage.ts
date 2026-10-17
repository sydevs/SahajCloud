'use client'

import { useFormFields } from '@payloadcms/ui'

/** The one stage in which a batch takes a reviewer's edits. */
export const REVIEW_STAGE = 'review'

/**
 * Whether this batch's fields are the reviewer's to edit.
 *
 * ⚠ **Read from form state, not from the document the page loaded.** A Save
 * that commits moves the status without leaving the page, so the controls have
 * to go read-only against the value the form now holds — and one hook means the
 * two editable fields cannot disagree about whose turn it is.
 *
 * `JobStageView` closes the form outright for `resolving` and `committing`, so
 * what this still answers for is a batch that is `finished`, `failed`,
 * `discarded`, or past its stall window.
 */
export function useBatchReadOnly(): boolean {
  return useFormFields(([fields]) => fields.status?.value) !== REVIEW_STAGE
}
