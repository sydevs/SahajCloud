import type { CollectionAfterReadHook } from 'payload'

/**
 * Strip this collection's two secrets from any read a `clients` caller made.
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
 * Server-side reads are untouched — they run with no user, or a manager. So is
 * authentication: `APIKeyAuthentication` resolves before `req.user` exists, and
 * matches the `apiKeyIndex` hash rather than this field.
 */
export const stripSecretsFromClientReads: CollectionAfterReadHook = ({ doc, req }) => {
  if (req.user?.collection !== 'clients') return doc

  delete (doc as Record<string, unknown>).apiKey
  delete (doc as Record<string, unknown>).mailingList
  return doc
}
