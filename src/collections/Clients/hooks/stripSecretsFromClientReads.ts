import type { CollectionAfterReadHook, FlattenedField, SanitizedCollectionConfig } from 'payload'

/** Fields whose own `read` lock a skipped field-access pass would have honoured. */
function lockedFieldNames(fields: FlattenedField[]): string[] {
  return fields
    .filter(
      (field): field is FlattenedField & { name: string } =>
        'name' in field &&
        typeof (field as { access?: { read?: unknown } }).access?.read === 'function',
    )
    .map((field) => field.name)
}

// Keyed on the sanitized field array rather than the slug, so a unit test
// passing a throwaway config gets its own entry.
const lockedCache = new WeakMap<FlattenedField[], string[]>()

function lockedFields(collection: SanitizedCollectionConfig): string[] {
  const cached = lockedCache.get(collection.flattenedFields)
  if (cached) return cached
  const names = lockedFieldNames(collection.flattenedFields)
  lockedCache.set(collection.flattenedFields, names)
  return names
}

/**
 * Strip every manager-locked field from any read a `clients` caller made.
 *
 * ⚠ **Field access is not enough, and `GET /clients/me` is not the only
 * self-read.** Payload's `refreshOperation` re-reads the document with
 * `findByID` and no `overrideAccess: false`, so it defaults to `true` and every
 * field lock is skipped — `meOperation` passes the flag, `refresh` does not.
 * `POST /api/clients/refresh-token` therefore returned the caller's own
 * decrypted `apiKey` and its `mailingList` provider secret to a key that ships
 * in the browser (#822). `disableLocalStrategy` does not close it: `refresh` is
 * the one auth operation that does not refuse on that flag.
 *
 * A hook runs on every read path, so this holds whichever operation forgets the
 * flag next. It keys on the caller, not the operation, for the same reason.
 *
 * The set is read off the collection rather than listed here, so a field locked
 * later is stripped without anyone remembering this file. Only the flattened
 * top level is walked — that is where a locked field's value sits on the
 * document, `mailingList`'s group included.
 *
 * Server-side reads are untouched — they run with no user, or a manager. So is
 * authentication: `APIKeyAuthentication` resolves before `req.user` exists, and
 * matches the `apiKeyIndex` hash rather than this field.
 */
export const stripSecretsFromClientReads: CollectionAfterReadHook = ({ collection, doc, req }) => {
  if (req.user?.collection !== 'clients') return doc

  for (const name of lockedFields(collection)) {
    delete (doc as Record<string, unknown>)[name]
  }
  return doc
}
