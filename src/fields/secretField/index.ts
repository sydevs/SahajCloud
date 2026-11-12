import type { SecretControlConfig, SecretFieldMarker, SecretFieldOptions } from './types'
import type { Field, FieldHook } from 'payload'

import { APIError } from 'payload'

import { capture } from '@/plugins/sentry/capture'

import { discardStagedSecret, readStagedSecret, stagerOf } from './staging'
import { REMOVE, STAGE_PREFIX } from './types'

export type { SecretFieldOptions, SecretVerifyArgs } from './types'

/** The control field's name for a secret named `name`. */
export const changeFieldName = (name: string): string => `${name}Change`

/**
 * A stored credential — write-only, out of form state, encrypted at rest — and
 * the admin control that sets it. Spread the result into `fields`: two fields,
 * the control first.
 *
 * - **The stored field** is never readable (`read: () => false`), never in form
 *   state (`admin.disabled`), never `required`, and encrypted through
 *   `payload.encrypt`.
 * - **The control** is a virtual `<name>Change` field. Its value is the only
 *   thing the form ever holds: empty (keep), `remove`, or `stage:<token>` — a
 *   reference to a value the set modal staged through `secretFieldEndpoints`.
 *   Save applies it; nothing else does.
 *
 * ⚠ **The control comes first, and that order is load-bearing.** Payload runs a
 * field's `beforeValidate` hooks, then its access check, in field order; the
 * control's own write lock must have removed a refused instruction before the
 * stored field's hook reads it. The stored field's lock then refuses the value
 * again, so neither alone is the whole guard.
 *
 * The collection must also spread `secretFieldEndpoints(slug)` into `endpoints`,
 * imported by its deep path: `@/fields` reaches browser bundles, and the routes
 * reach server-only code.
 */
export function secretField(options: SecretFieldOptions): Field[] {
  const { name, label = 'Secret', writeAccess, verify, dependsOn = [], admin } = options
  const control: SecretControlConfig = {
    secretName: name,
    label,
    dependsOn,
    ...(options.setDescription ? { setDescription: options.setDescription } : {}),
  }
  const marker: SecretFieldMarker = { dependsOn, ...(verify ? { verify } : {}) }

  return [
    {
      name: changeFieldName(name),
      type: 'text',
      virtual: true,
      label,
      access: { create: writeAccess, update: writeAccess },
      admin: {
        ...(admin?.condition ? { condition: admin.condition } : {}),
        components: { Field: '@/components/admin/SecretField' },
        custom: { secret: control },
      },
    },
    {
      name,
      type: 'text',
      label,
      access: { read: () => false, create: writeAccess, update: writeAccess },
      // Keeps the value out of the edit form's state, so live preview cannot post
      // it to a preview frame and a form save cannot write an older copy back.
      admin: { disabled: true },
      custom: { secret: marker },
      hooks: {
        beforeValidate: [applyChange(name, label)],
        beforeChange: [encryptSecret],
        afterChange: [discardApplied],
        afterRead: [decryptSecret(name)],
      },
    },
  ]
}

const APPLIED_KEY = 'secretFieldApplied'

/**
 * Turn the control's instruction into the stored value, before any collection
 * hook reads it — a `beforeChange` hook proving the credential sees the new one.
 *
 * No instruction answers `undefined`, which leaves Payload's own back-fill of the
 * stored (decrypted) value in place.
 */
const applyChange =
  (name: string, label: string): FieldHook =>
  async ({ collection, operation, originalDoc, path, req, siblingData }) => {
    const change = siblingData?.[changeFieldName(name)]
    if (change === REMOVE) return ''
    if (typeof change !== 'string' || !change.startsWith(STAGE_PREFIX)) return undefined

    const token = change.slice(STAGE_PREFIX.length)
    const staged = await readStagedSecret(req.payload, token)
    const matches =
      staged !== null &&
      operation === 'update' &&
      staged.collection === collection?.slug &&
      staged.id === String(originalDoc?.id) &&
      staged.path === path.join('.') &&
      staged.user === stagerOf(req.user)
    if (!matches) {
      throw new APIError(
        `The new ${label} could not be saved: it expired, or was set on another page. Set it again.`,
        400,
        { code: 'secret_stage_invalid' },
        true,
      )
    }

    const applied = (req.context[APPLIED_KEY] ??= []) as string[]
    applied.push(token)
    return req.payload.decrypt(staged.cipher)
  }

/** A staged value is spent once the write that applied it has run. */
const discardApplied: FieldHook = async ({ req, value }) => {
  const applied = req.context[APPLIED_KEY] as string[] | undefined
  if (applied?.length) {
    req.context[APPLIED_KEY] = []
    await Promise.all(applied.map((token) => discardStagedSecret(req.payload, token)))
  }
  return value
}

/**
 * ⚠ **`''`, `null` and `undefined` pass through untouched, both ways.** Queries
 * filter an unconfigured credential with `not_equals: ''` — `mailingListOwners.ts`
 * does — and ciphertext for `''` is a non-empty string, so encrypting the empty
 * case would make that predicate always true.
 */
const encryptSecret: FieldHook = ({ req, value }) =>
  typeof value === 'string' && value !== '' ? req.payload.encrypt(value) : value

/**
 * ⚠ **A failed decrypt answers `null` rather than throwing.** A throw inside
 * `afterRead` takes down every read of the row; `null` reads as unconfigured, so
 * the feature stops rather than the CMS.
 */
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
