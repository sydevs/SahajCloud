import type { Payload, PayloadRequest } from 'payload'

import { randomBytes } from 'node:crypto'

/**
 * Where a secret waits between the set modal and the document's Save.
 *
 * The modal posts the value once; the server checks it, encrypts it and keeps
 * it here under a random token, and only the token enters the edit form. So the
 * value never sits in form state — which live preview posts to another origin —
 * and the document changes only when its own Save applies the token.
 *
 * `payload.kv` rather than a column: an entry belongs to one unsaved edit, not
 * to the document, and an abandoned one must not ride along on the next save.
 */

const PREFIX = 'secret-stage:'

/** How long a staged value waits for its Save. */
const STAGE_TTL_MS = 60 * 60 * 1000

/** One staged value, bound to the exact field, document and person it was set for. */
export interface StagedSecret {
  collection: string
  id: string
  /** The stored field's dotted path, e.g. `mailingList.apiKey`. */
  path: string
  /** `collection:id` of whoever staged it — only they can apply it. */
  user: string
  /** `payload.encrypt` ciphertext; the store never holds plaintext. */
  cipher: string
  expiresAt: number
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

/** Who a staged entry belongs to, or `null` for a caller with no identity. */
export const stagerOf = (user: PayloadRequest['user']): string | null =>
  user ? `${user.collection}:${user.id}` : null

/** Stage a value; answers the token the form carries until Save. */
export async function stageSecret(
  payload: Payload,
  entry: Omit<StagedSecret, 'cipher' | 'expiresAt'> & { value: string },
): Promise<string> {
  await sweepExpired(payload)
  const token = randomBytes(24).toString('base64url')
  const { value, ...rest } = entry
  const staged: StagedSecret = {
    ...rest,
    cipher: payload.encrypt(value),
    expiresAt: Date.now() + STAGE_TTL_MS,
  }
  await payload.kv.set(PREFIX + token, staged)
  return token
}

/** The staged entry for a token, or `null` when it is unknown or expired. */
export async function readStagedSecret(
  payload: Payload,
  token: string,
): Promise<StagedSecret | null> {
  if (!TOKEN_PATTERN.test(token)) return null
  const entry = await payload.kv.get<StagedSecret>(PREFIX + token)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    await payload.kv.delete(PREFIX + token)
    return null
  }
  return entry
}

export async function discardStagedSecret(payload: Payload, token: string): Promise<void> {
  if (TOKEN_PATTERN.test(token)) await payload.kv.delete(PREFIX + token)
}

/**
 * Drop every expired entry. Run on each stage, so an edit abandoned without a
 * Save is gone by the next one; there are only ever a handful.
 */
async function sweepExpired(payload: Payload): Promise<void> {
  const keys = (await payload.kv.keys()).filter((key) => key.startsWith(PREFIX))
  await Promise.all(
    keys.map(async (key) => {
      const entry = await payload.kv.get<StagedSecret>(key)
      if (!entry || entry.expiresAt <= Date.now()) await payload.kv.delete(key)
    }),
  )
}
