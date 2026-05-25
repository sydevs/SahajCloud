/**
 * Pure helpers for the wm-app-translations status section. The translations
 * schema is 3-level (parent group → sub-group → string keys), so both
 * counting helpers recurse when they encounter a nested-object property.
 *
 * Extracted from `translations.ts` so the recursion can be unit-tested without
 * bootstrapping Payload.
 */

export type TranslationSchemaNode = {
  type: 'object'
  description?: string
  properties?: Record<string, unknown>
}

function isSchemaNode(value: unknown): value is TranslationSchemaNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'object'
  )
}

export function countLeafKeys(node: TranslationSchemaNode): number {
  if (!node.properties) return 0
  return Object.values(node.properties).reduce<number>((sum, prop) => {
    if (isSchemaNode(prop)) return sum + countLeafKeys(prop)
    return sum + 1
  }, 0)
}

export function countNonEmptyKeys(
  node: TranslationSchemaNode,
  data: Record<string, unknown> | null | undefined,
): number {
  if (!data || !node.properties) return 0
  return Object.entries(node.properties).reduce<number>((sum, [key, prop]) => {
    if (isSchemaNode(prop)) {
      return (
        sum +
        countNonEmptyKeys(prop, data[key] as Record<string, unknown> | null | undefined)
      )
    }
    const value = data[key]
    return sum + (typeof value === 'string' && value.trim().length > 0 ? 1 : 0)
  }, 0)
}
