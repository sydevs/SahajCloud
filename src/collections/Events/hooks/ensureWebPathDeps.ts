import type { CollectionBeforeOperationHook, SelectType } from 'payload'

/**
 * beforeOperation hook: keep the computed `webPath` / `webUrl` fields resolvable
 * on any event read, not just the geojson feed.
 *
 * Both derive from the event's `region` (its id); `webUrl`'s published gate also
 * reads `_status`. A caller selecting only a canonical path has no reason to
 * also select those inputs — but an include-mode `select` would strip them
 * before the afterRead field hooks run, leaving the path/URL null. So whenever a
 * path field is requested, add whichever input it needs back into the `select`
 * (a harmless extra id / status in the response).
 *
 * Runs at the collection level rather than in a single endpoint so `webPath`
 * stays selectable on its own across every read path (list, findByID, geojson).
 * A no-op unless the caller uses an include-mode `select` that names a path
 * field, so it can't strip or alter any other read.
 */
export const ensureWebPathDeps: CollectionBeforeOperationHook = ({ operation, args }) => {
  if (operation !== 'find' && operation !== 'read') return args
  const select = args.select as SelectType | undefined
  if (!select || typeof select !== 'object') return args

  const fields = select as Record<string, unknown>
  if (!fields.webPath && !fields.webUrl) return args

  const patched = { ...fields }
  if (!('region' in patched)) patched.region = true
  if (fields.webUrl && !('_status' in patched)) patched._status = true
  args.select = patched as SelectType
  return args
}
