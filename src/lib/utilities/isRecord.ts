/**
 * Type guard for a non-null object (`Record<string, unknown>`).
 *
 * The single source for this guard — previously duplicated in the lexical
 * sanitizer and `lib/status/helpers`. Lives in `utilities/` (not `status/`)
 * because it's a generic structural guard with no domain ties, so unrelated
 * callers (`richEditor`, `status`, globals) can share it without a cross-domain
 * import reading oddly.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
