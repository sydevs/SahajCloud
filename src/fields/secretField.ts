import type { FieldAccess, FieldHook, PayloadRequest, TextField } from 'payload'

import { capture } from '@/plugins/sentry/capture'

export interface SecretFieldOptions extends Omit<
  TextField,
  'access' | 'hasMany' | 'hooks' | 'maxRows' | 'minRows' | 'required' | 'type' | 'validate'
> {
  name: string
  /** Who may write it. Reading is closed to everyone, so there is no read option. */
  writeAccess: FieldAccess
}

/** A stored value, as opposed to a column nobody has filled in. */
const isStored = (value: unknown): value is string => typeof value === 'string' && value !== ''

const decryptStored = (req: PayloadRequest, value: string, path: (number | string)[]) => {
  try {
    return req.payload.decrypt(value)
  } catch (error) {
    const field = path.join('.')
    // ⚠ One issue per column, not per read. A column holding anything this
    // environment's key cannot read — a restored dump, a rotated
    // `PAYLOAD_SECRET` — reports on every read of every such row, and the
    // widget's boot read is the busiest in the app.
    capture({
      error,
      message: 'secretField: a stored value could not be decrypted',
      fingerprint: ['secretField', field],
      logger: req.payload.logger,
      tags: { field },
    })
    return null
  }
}

/**
 * A credential this service stores for an operator: write-only, and encrypted at
 * rest. Every consumer reads it with `overrideAccess: true`, which skips field
 * access while still running the decrypt below.
 *
 * It owns storage alone. The control that sets one stays with the caller,
 * because a credential is entered beside whatever else its provider needs
 * (`Clients.mailingList`).
 *
 * ⚠ **`''`, `null` and `undefined` pass through untouched, both ways**, because
 * a filled column is told from a blank one by `not_equals: ''` and ciphertext
 * for `''` is non-empty.
 *
 * ⚠ **A failed decrypt is reported and answers `null`, never thrown.** A throw
 * in `afterRead` takes down every read of the row; `null` reads as unconfigured,
 * so delivery stops rather than the CMS.
 *
 * No `validate`: supplying one replaces Payload's own `text` validator
 * (`src/collections/AGENTS.md`). Never `required` either — a field the form
 * cannot show refuses saves with an error nobody can act on.
 *
 * What each of those costs, and when to reach for this: `src/fields/AGENTS.md`.
 */
export function secretField({ admin, writeAccess, ...field }: SecretFieldOptions): TextField {
  const encryptOnWrite: FieldHook = ({ req, value }) =>
    isStored(value) ? req.payload.encrypt(value) : value

  const decryptOnRead: FieldHook = ({ path, req, value }) =>
    isStored(value) ? decryptStored(req, value, path) : value

  return {
    ...field,
    type: 'text',
    access: { create: writeAccess, read: () => false, update: writeAccess },
    // Out of form state: a form save then carries no copy to write back over a
    // newer one, and a live preview has none to post to its iframe.
    admin: { ...admin, disabled: true },
    hooks: { afterRead: [decryptOnRead], beforeChange: [encryptOnWrite] },
  }
}
