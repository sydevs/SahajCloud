import type { StaticLabel } from 'payload'

/**
 * A field's label as one string, for an `aria-label` on a composite control
 * that renders no `<label>` of its own.
 *
 * Not for display: `FieldLabel` resolves the locale map against the viewer's
 * own language, and this takes English or whatever is first. It stands in only
 * where a name is owed to a control and nothing localized can reach it.
 */
export function labelText(label: StaticLabel | undefined, fallback: string): string {
  if (typeof label === 'string') return label
  if (label) return label['en'] || Object.values(label)[0] || fallback
  return fallback
}
