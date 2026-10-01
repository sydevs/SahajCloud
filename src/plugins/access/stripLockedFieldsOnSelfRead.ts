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
 * Re-apply a field `read` lock the caller's own row would otherwise escape.
 *
 * ⚠ **A field lock only covers a read that checks access, and an auth operation
 * may not.** `POST /api/clients/refresh-token` returned the caller's own
 * decrypted `apiKey` and its `mailingList` provider secret to a key that ships
 * in the browser, because `refreshOperation` re-read the row with no
 * `overrideAccess: false` (#822). Payload passes the flag there as of 3.90.2, so
 * this is the net for whichever operation forgets it next rather than the fix
 * for that one.
 *
 * The locks are evaluated rather than assumed, so it denies exactly what field
 * access would have. Only the flattened top level is walked — that is where a
 * locked field's value sits on the document, `mailingList`'s group included.
 *
 * Three things it deliberately does not touch, each because the answer is
 * already settled elsewhere:
 *
 * - **A read that checked access** (`overrideAccess === false`), where the locks
 *   have already run.
 * - **A read by anyone else**, and a server-side read, which carries no user.
 *   Authentication too: `APIKeyAuthentication` resolves before `req.user`
 *   exists, and matches the `apiKeyIndex` hash rather than the field.
 * - ⚠ **A row that is not the caller's own.** Every operation in the class above
 *   reads the authenticated row, so nothing is lost — and a sibling row reaching
 *   here is an internal read the app has to be able to trust.
 *   `syncVerificationOnSave` is the live one: it reads the event manager's
 *   `notificationPreferences` with the acting manager's `req`, and a stripped
 *   cadence moved `nextCheckAt` from 30 days to the 90-day default silently
 *   (#828).
 *
 * So what it catches is a field a collection locks **against the row's own
 * holder**. `Clients.apiKey` is that; every lock on `managers` is self-or-admin,
 * so there the hook is a no-op by design, not by oversight.
 */
export const stripLockedFieldsOnSelfRead: CollectionAfterReadHook = async ({
  collection,
  doc,
  overrideAccess,
  req,
}) => {
  if (overrideAccess === false) return doc
  if (req.user?.collection !== collection.slug) return doc
  const id = (doc as { id?: number | string })?.id
  if (id === undefined || String(req.user.id) !== String(id)) return doc

  for (const field of lockedFields(collection)) {
    const allowed = await field.read({
      req,
      id,
      data: doc,
      siblingData: doc,
      doc,
    })
    if (!allowed) delete (doc as Record<string, unknown>)[field.name]
  }
  return doc
}
