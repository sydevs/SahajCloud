import type { CollectionBeforeOperationHook, SelectType } from 'payload'

/**
 * Keep a computed field resolvable when an include-mode `select` names it
 * without the stored fields its `afterRead` hook reads.
 *
 * A caller selecting only a computed field has no reason to also select its
 * inputs — but `select` strips them before the afterRead field hooks run, so
 * the hook sees `undefined` and the field comes back wrong. Whenever a
 * computed field is requested, its inputs go back into the `select`.
 *
 * ⚠ **The input is returned too, so the dependency is part of the response.**
 * There is no way to select a field for a hook alone. Declare only what the
 * hook truly reads: a large column named here is paid for by every caller who
 * selects the field deriving from it.
 *
 * Declared per collection on `beforeOperation`, rather than in one endpoint, so
 * each computed field stays selectable on its own across every read path. A
 * no-op unless the caller uses an include-mode `select` naming one, so it can
 * neither strip nor alter any other read.
 *
 * @param deps computed field name → the stored fields its hook reads
 */
export function ensureVirtualFieldDeps(
  deps: Record<string, readonly string[]>,
): CollectionBeforeOperationHook {
  return ({ operation, args }) => {
    if (operation !== 'find' && operation !== 'read') return args
    const select = args.select as SelectType | undefined
    if (!select || typeof select !== 'object') return args

    const fields = select as Record<string, unknown>
    const missing = Object.keys(deps)
      .filter((field) => fields[field])
      .flatMap((field) => deps[field]!)
      .filter((dep) => !(dep in fields))
    if (missing.length === 0) return args

    const patched = { ...fields, ...Object.fromEntries(missing.map((dep) => [dep, true])) }
    args.select = patched as SelectType
    return args
  }
}
