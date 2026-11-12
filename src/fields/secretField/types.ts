import type { Condition, FieldAccess, PayloadRequest } from 'payload'

/*
 * The secret field's shapes, in a module with no runtime dependencies so the admin
 * control can share them without pulling server code into the browser bundle.
 */

/** The control's form value that applies a staged secret on Save. */
export const STAGE_PREFIX = 'stage:'
/** The control's form value that clears the stored secret on Save. */
export const REMOVE = 'remove'

/** What a stored secret's `verify` is handed. */
export interface SecretVerifyArgs {
  value: string
  /**
   * The stored siblings, overlaid with the form's unsaved values for each
   * `dependsOn` field — what the value will be saved beside if Save follows.
   */
  siblingData: Record<string, unknown>
  req: PayloadRequest
}

export interface SecretFieldOptions {
  name: string
  label?: string
  /** The lock on `create` and `update`. `read` is closed to everyone. */
  writeAccess: FieldAccess
  /**
   * Proves a value before it is staged: answer a refusal in words the person can
   * act on, or `null`. It is a courtesy, not the guard — a collection hook that
   * must hold on every write re-checks on Save, against what is actually saved.
   */
  verify?: (args: SecretVerifyArgs) => Promise<string | null>
  /** Sibling field names whose unsaved form values `verify` needs. Never stored by staging. */
  dependsOn?: string[]
  /** One line in the set modal, saying what the value is checked against. */
  setDescription?: string
  admin?: { condition?: Condition }
}

/** What the admin control reads from its field's `admin.custom`. Serializable. */
export interface SecretControlConfig {
  secretName: string
  label: string
  dependsOn: string[]
  setDescription?: string
}

/** Server-only marker on the stored field, which the endpoints refuse to act without. */
export interface SecretFieldMarker {
  verify?: SecretFieldOptions['verify']
  dependsOn: string[]
}

/** `GET /api/<collection>/:id/secrets/:path` — whether a value is stored, and its tail. */
export interface SecretStatus {
  set: boolean
  /** The stored value's last four characters, or `null` when none is stored. */
  last4: string | null
}

/** `POST /api/<collection>/:id/secrets/:path` — the staged value's token. */
export interface SecretStaged {
  token: string
  last4: string
}
