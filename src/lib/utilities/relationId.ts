/**
 * Resolve a Payload relationship value to its numeric id. Relationship fields
 * arrive either as a bare id (depth 0) or a populated doc (depth ≥ 1); this
 * normalises both to the id, or `null` when neither shape applies.
 */
export function relationId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    return typeof id === 'number' ? id : null
  }
  return null
}
