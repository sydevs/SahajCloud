import type { Field, FieldAccess, FieldHook } from 'payload'

import { capture } from '@/plugins/sentry/capture'

export interface SecretFieldOptions {
  name: string
  label?: string
  /** The lock on `create` and `update`. `read` is closed to everyone. */
  writeAccess: FieldAccess
}

/**
 * A stored operator credential: write-only, out of form state, encrypted at rest.
 *
 * ⚠ **`''`, `null` and `undefined` pass through untouched, both ways.** Queries
 * filter an unconfigured credential with `not_equals: ''` — `mailingListOwners.ts`
 * does — and ciphertext for `''` is a non-empty string, so encrypting the empty
 * case would make that predicate always true.
 *
 * ⚠ **A failed decrypt answers `null` rather than throwing.** A throw inside
 * `afterRead` takes down every read of the row; `null` reads as unconfigured, so
 * the feature stops rather than the CMS.
 *
 * The admin control belongs to the caller — a credential is proven against its
 * own provider before it is stored, which this factory knows nothing about. It
 * takes no `admin.description` for the same reason it takes no control:
 * `admin.disabled` means nothing here is ever rendered to read.
 */
export function secretField(options: SecretFieldOptions): Field {
  const { name, label, writeAccess } = options

  return {
    name,
    type: 'text',
    ...(label ? { label } : {}),
    access: { read: () => false, create: writeAccess, update: writeAccess },
    // Keeps the value out of the edit form's state, so live preview cannot post
    // it to a preview frame and a form save cannot write an older copy back.
    admin: { disabled: true },
    hooks: { afterRead: [decryptSecret(name)], beforeChange: [encryptSecret] },
  }
}

const encryptSecret: FieldHook = ({ req, value }) =>
  typeof value === 'string' && value !== '' ? req.payload.encrypt(value) : value

const decryptSecret =
  (name: string): FieldHook =>
  ({ req, value }) => {
    if (typeof value !== 'string' || value === '') return value
    try {
      return req.payload.decrypt(value)
    } catch (error) {
      capture({
        error,
        message: 'secretField: stored value could not be decrypted',
        logger: req.payload.logger,
        tags: { field: name },
      })
      return null
    }
  }
