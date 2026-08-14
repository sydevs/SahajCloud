/**
 * Resolve a Payload relationship value to its numeric id.
 *
 * A relationship arrives in more shapes than is obvious: a bare number at
 * `depth: 0`, a populated document at `depth >= 1`, and a **string** whenever
 * the value has been through a URL, a form body or a JSON payload that didn't
 * preserve the numeric type. Returning `null` for the string case looks
 * harmless but isn't — callers read `null` as "no relationship", so a
 * string-valued manager id would make an event look unmanaged.
 *
 * The recursion handles a populated doc whose own `id` arrives as a string.
 */
export function relationId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isInteger(parsed) ? parsed : null
  }
  if (value && typeof value === 'object' && 'id' in value) {
    return relationId((value as { id: unknown }).id)
  }
  return null
}
