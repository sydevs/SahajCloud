'use client'

import type { StaticDescription, StaticLabel } from 'payload'

import { FieldDescription, FieldLabel } from '@payloadcms/ui'

export interface FieldShellProps {
  readonly label: StaticLabel | undefined
  readonly description?: StaticDescription
  readonly path: string
  readonly readOnly?: boolean
  /** Layout for the wrap, owned by the caller's own stylesheet. */
  readonly wrapClassName?: string
  readonly children: React.ReactNode
}

/**
 * The markup Payload's own JSON field renders, around whatever a custom field
 * puts in its place.
 *
 * Payload exports the label and the description, never the wrapper that places
 * them, so every custom field that wants to look like a built-in one rewrites
 * these four elements. Three copies in one folder had already drifted: one
 * hard-coded `read-only` so it could not express an editable state, and one
 * passed a different `path` to its label than the other two.
 */
export const FieldShell = ({
  children,
  description,
  label,
  path,
  readOnly = false,
  wrapClassName,
}: FieldShellProps) => (
  <div className={`field-type json${readOnly ? ' read-only' : ''}`}>
    <FieldLabel label={label} path={path} />
    <div className={`field-type__wrap${wrapClassName ? ` ${wrapClassName}` : ''}`}>
      {children}
      <FieldDescription description={description} path={path} />
    </div>
  </div>
)
