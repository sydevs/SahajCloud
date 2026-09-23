/**
 * A Payload `StaticLabel` is a string or a per-locale record; take either.
 *
 * Returns `null` for a label function, which needs an i18n context. A caller
 * with no `req` to thread has nothing to resolve one with, and falls back to
 * whatever it can name the field by.
 */
export function staticLabelText(label: unknown): string | null {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const values = Object.values(label as Record<string, unknown>)
    const first = values.find((value) => typeof value === 'string')
    if (typeof first === 'string') return first
  }
  return null
}
