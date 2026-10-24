import type { CollectionBeforeOperationHook, SelectType } from 'payload'

/**
 * The stored fields each computed field's afterRead hook reads. `webPath` and
 * `webUrl` derive from `region` and are publish-gated on `_status`;
 * `offersMailingList` derives from `region`.
 */
const VIRTUAL_FIELD_DEPS: Record<string, readonly string[]> = {
  webPath: ['region', '_status'],
  webUrl: ['region', '_status'],
  offersMailingList: ['region'],
}

/**
 * beforeOperation hook: keep the computed fields above resolvable on any event
 * read, not just the geojson feed.
 *
 * A caller selecting only a computed field has no reason to also select its
 * inputs — but an include-mode `select` would strip them before the afterRead
 * field hooks run, leaving the field null. So whenever one is requested, add
 * its inputs back into the `select` (a harmless extra id / status in the
 * response).
 *
 * Runs at the collection level rather than in a single endpoint so each stays
 * selectable on its own across every read path (list, findByID, geojson). A
 * no-op unless the caller uses an include-mode `select` that names one, so it
 * can't strip or alter any other read.
 */
export const ensureVirtualFieldDeps: CollectionBeforeOperationHook = ({ operation, args }) => {
  if (operation !== 'find' && operation !== 'read') return args
  const select = args.select as SelectType | undefined
  if (!select || typeof select !== 'object') return args

  const fields = select as Record<string, unknown>
  const deps = Object.keys(VIRTUAL_FIELD_DEPS)
    .filter((field) => fields[field])
    .flatMap((field) => VIRTUAL_FIELD_DEPS[field]!)
  if (deps.length === 0) return args

  const patched = { ...fields }
  for (const dep of deps) if (!(dep in patched)) patched[dep] = true
  args.select = patched as SelectType
  return args
}
