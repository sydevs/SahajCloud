import type { CollectionBeforeOperationHook, SelectType } from 'payload'

import { isRecord } from '@/lib/utilities/isRecord'

/**
 * Keep a computed field resolvable when an include-mode `select` names it
 * without the stored fields its `afterRead` hook reads.
 *
 * A caller selecting only a computed field has no reason to also select its
 * inputs — but `select` strips them before the afterRead field hooks run, so
 * the hook sees `undefined` and the field comes back wrong. Whenever a computed
 * field is requested, its inputs go back into the `select`.
 *
 * Mounted on `beforeOperation`, rather than in one endpoint, so each computed
 * field stays selectable on its own across every read path. A no-op unless the
 * caller uses an include-mode `select` naming one, so it can neither strip nor
 * alter any other read.
 *
 * Nothing calls this directly: `virtualFieldsPlugin` builds one per collection
 * from the declarations its own fields carry (`declare.ts`), so a computed
 * field cannot be mounted without saying what it reads.
 *
 * @param deps computed field name → the stored fields its hook reads
 */
export function ensureVirtualFieldDeps(
  deps: Record<string, readonly string[]>,
): CollectionBeforeOperationHook {
  // Resolved once, at config build: the hook itself runs on every read.
  const declared = Object.entries(deps)

  return ({ operation, args }) => {
    if (operation !== 'find' && operation !== 'read') return args
    const select: unknown = args.select
    if (!isRecord(select)) return args

    // Copied only once something is added, so a read naming no computed field
    // keeps the caller's own object.
    let patched: Record<string, unknown> | undefined
    for (const [field, inputs] of declared) {
      if (!select[field]) continue
      for (const input of inputs) {
        // Against the growing object: an input two computed fields share, and
        // one the caller decided for itself, are both left as they are.
        if (input in (patched ?? select)) continue
        patched ??= { ...select }
        patched[input] = true
      }
    }

    if (patched) args.select = patched as SelectType
    return args
  }
}
