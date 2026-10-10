'use client'

import type { StaticDescription, StaticLabel } from 'payload'

import { FieldDescription, FieldLabel, useFormFields } from '@payloadcms/ui'

import './styles.css'

/** The one stage in which a batch takes a reviewer's edits. */
const REVIEW_STAGE = 'review'

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

export interface FieldShellProps {
  readonly label: StaticLabel | undefined
  readonly description?: StaticDescription
  readonly path: string
  readonly readOnly?: boolean
  readonly children: React.ReactNode
}

/**
 * The markup Payload's own JSON field renders, around whatever a batch's review
 * surface puts in its place.
 *
 * Three field components in this folder need the identical label-plus-wrap
 * shell, and writing it three times had already drifted: one copy hard-coded
 * `read-only` so it could not express an editable state, and one passed a
 * different `path` to its label than the other two.
 */
export const FieldShell = ({
  children,
  description,
  label,
  path,
  readOnly = false,
}: FieldShellProps) => (
  <div className={`field-type json${readOnly ? ' read-only' : ''}`}>
    <FieldLabel label={label} path={path} />
    <div className="field-type__wrap event-import__stack">
      {children}
      <FieldDescription description={description} path={path} />
    </div>
  </div>
)
