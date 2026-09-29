import type { CSSProperties } from 'react'

/**
 * The layout shared by the form and the confirmation, in Payload's own tokens
 * so the page follows the admin theme, dark mode included.
 *
 * Centred as a column: Payload's login view lays its slot out for a
 * full-width `LoginForm`, and a lone `Button` is an inline-flex element that
 * sits left once that form is gone.
 */
export const stack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--base)',
  textAlign: 'center',
}

export const heading: CSSProperties = { margin: 0 }

export const lead: CSSProperties = { margin: 0, color: 'var(--theme-elevation-650)' }

/** A child of {@link stack} that fills the column rather than shrinking to its content. */
export const fullWidth: CSSProperties = { width: '100%' }
