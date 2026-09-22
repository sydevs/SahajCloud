import type {
  CollectionAfterReadHook,
  FieldAccess,
  FlattenedField,
  SanitizedCollectionConfig,
} from 'payload'

type LockedField = { name: string; read: FieldAccess }

function lockedReadFields(fields: FlattenedField[]): LockedField[] {
  const locked: LockedField[] = []
  for (const field of fields) {
    if (!('name' in field)) continue
    const read = (field as { access?: { read?: unknown } }).access?.read
    if (typeof read === 'function') locked.push({ name: field.name, read: read as FieldAccess })
  }
  return locked
}

// Keyed on the sanitized field array rather than the slug, so a spec passing a
// throwaway config gets its own entry.
const lockedCache = new WeakMap<FlattenedField[], LockedField[]>()

function lockedFields(collection: SanitizedCollectionConfig): LockedField[] {
  const cached = lockedCache.get(collection.flattenedFields)
  if (cached) return cached
  const locked = lockedReadFields(collection.flattenedFields)
  lockedCache.set(collection.flattenedFields, locked)
  return locked
}

/**
 * Re-apply every field `read` lock when a caller reads its own auth collection.
 *
 * ⚠ **A field lock only covers a read that checks access, and a self-read may
 * not.** Payload's `refreshOperation` re-reads the document with `findByID` and
 * no `overrideAccess: false`, so it defaults to `true` and every field lock is
 * skipped — `meOperation` passes the flag, `refresh` does not.
 * `POST /api/clients/refresh-token` therefore returned the caller's own
 * decrypted `apiKey` and its `mailingList` provider secret to a key that ships
 * in the browser (#822). `disableLocalStrategy` does not close it: `refresh` is
 * the one auth operation that does not refuse on that flag.
 *
 * A hook runs on every read path, so this holds whichever operation forgets the
 * flag next. `accessPlugin` attaches it to every auth collection, because the
 * hole is Payload's auth operations rather than anything about `clients`: the
 * next `read` lock added to `managers` would leak the same way with nothing
 * else to catch it.
 *
 * The locks are evaluated rather than assumed, so the hook denies exactly what
 * field access would have denied. Only the flattened top level is walked —
 * that is where a locked field's value sits on the document, `mailingList`'s
 * group included.
 *
 * Reads by anyone else are untouched, and so are server-side reads, which run
 * with no user. So is authentication: `APIKeyAuthentication` resolves before
 * `req.user` exists, and matches the `apiKeyIndex` hash rather than the field.
 */
export const stripLockedFieldsOnSelfRead: CollectionAfterReadHook = async ({
  collection,
  doc,
  req,
}) => {
  if (req.user?.collection !== collection.slug) return doc

  for (const field of lockedFields(collection)) {
    const allowed = await field.read({
      req,
      id: (doc as { id?: number | string })?.id,
      data: doc,
      siblingData: doc,
      doc,
    })
    if (!allowed) delete (doc as Record<string, unknown>)[field.name]
  }
  return doc
}
