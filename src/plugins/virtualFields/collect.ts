import type { Field } from 'payload'

import { isRecord } from '@/lib/utilities/isRecord'

/**
 * Every computed-field declaration at a collection's own data level, as the map
 * `ensureVirtualFieldDeps` takes.
 *
 * ⚠ **The level, not the tree.** A `select` nests the same way data does, and
 * the hook patches the object the caller passed — so a declaration inside a
 * named group, array, block or tab belongs to that key's own `select`, which
 * this walk cannot reach. `row`, `collapsible` and an unnamed tab hold no data
 * of their own, so a field inside one is still top-level and is collected.
 * That is deliberate: `publicUrlFields` wraps its three fields in a
 * collapsible.
 */
export function collectVirtualFieldInputs(fields: Field[]): Record<string, readonly string[]> {
  const deps: Record<string, readonly string[]> = {}

  for (const field of fields) {
    const nested = sameLevelFields(field)
    if (nested) {
      Object.assign(deps, collectVirtualFieldInputs(nested))
      continue
    }

    if (!('name' in field)) continue
    const declared = isRecord(field.custom) ? field.custom.virtualFieldInputs : undefined
    if (!Array.isArray(declared) || declared.length === 0) continue
    deps[field.name] = declared.filter((input): input is string => typeof input === 'string')
  }

  return deps
}

/** The fields a container holds at its parent's data level, or undefined. */
function sameLevelFields(field: Field): Field[] | undefined {
  if (field.type === 'tabs') {
    return field.tabs.flatMap((tab) => ('name' in tab ? [] : tab.fields))
  }
  if (field.type === 'row' || field.type === 'collapsible') return field.fields
  if (field.type === 'group' && !('name' in field)) return field.fields
  return undefined
}
