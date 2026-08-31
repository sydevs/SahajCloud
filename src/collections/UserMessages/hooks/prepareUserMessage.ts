import type { CollectionBeforeChangeHook } from 'payload'

import { createHash } from 'node:crypto'

import { upsertUserByEmail } from '@/lib/users/upsertUserByEmail'

/**
 * Fingerprint of a message body, for the screening job's duplicate-body check.
 *
 * The normalization is the whole design. Spam is the same payload sent many
 * times, and the cheap variations a sender makes between sends are casing and
 * whitespace — a trailing newline, a doubled space, a capitalized first word.
 * Folding those away means one hash covers the family; folding away anything
 * *more* would start matching genuinely different messages, which is the
 * failure that actually costs us (a lost bug report).
 *
 * Deliberately exact rather than fuzzy. A near-duplicate detector needs a
 * threshold, and a threshold needs real spam data to tune against — which we
 * won't have until this has run for a while. Exact equality has no knob and no
 * false positives worth the name: two people do not independently type the same
 * ten-plus characters of free text.
 *
 * SHA-256 because it is what `node:crypto` gives for free and the column is
 * indexed; there is nothing secret here, so the choice is about collision
 * resistance and nothing else.
 */
export function normalizedBodyHash(message: string): string {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, ' ')
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

/**
 * beforeChange (create): system stamping for a fresh user message. The
 * write-guard plugin has already run (beforeValidate) — the captcha, URL scan
 * and disposable-email list are behind us; this hook owns what the request
 * itself knows and what needs the database:
 *
 * - **`client`** is taken from the authenticated key, never from the body. It
 *   is what names the message in the admin list and prefixes the notification
 *   subject, so a caller able to set it could attribute its messages to another
 *   service. The field's access already refuses a client write; this is the
 *   positive half of the same rule.
 * - **`bodyHash`** is stamped once, here, so the screening job's duplicate check
 *   is an indexed equality rather than a scan over every recent message body.
 *   Create only: clients hold no update grant, and an admin editing the text
 *   afterwards is triage, not a new submission.
 * - **the sender is upserted into `users`** and linked, so screening can count a
 *   sender's recent history and abuse is visible across both public intakes.
 * - **a client-created message always starts at `status: 'screening'`**
 *   (belt-and-braces with the field-level access lockdown).
 */
export const prepareUserMessage: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data

  const fromClient = req.user?.collection === 'clients'
  const senderEmail = typeof data.senderEmail === 'string' ? data.senderEmail.trim() : ''
  const message = typeof data.message === 'string' ? data.message : ''

  // Anonymous messages are allowed — `senderEmail` is optional — and simply
  // carry no user. They are still screened, just by the checks that don't need
  // an identity (the duplicate-body window).
  const user = senderEmail
    ? await upsertUserByEmail({ req, name: displayNameFor(senderEmail), email: senderEmail })
    : null

  return {
    ...data,
    ...(user != null ? { user } : {}),
    ...(fromClient && req.user?.id != null ? { client: req.user.id } : {}),
    ...(message ? { bodyHash: normalizedBodyHash(message) } : {}),
    ...(fromClient ? { status: 'screening' } : {}),
  }
}

/** Said when an address has no usable local part (`"..."@example.org`). */
const FALLBACK_NAME = 'Message sender'

/**
 * A display name for the `users` row, derived from the address — this intake
 * has no name field, and `users.name` is required.
 *
 * **Dots and underscores become spaces**, which is both nicer to read
 * (`john.doe` → `john doe`) and load-bearing: the write-guard's `users` policy
 * URL-scans `name`, and its bare-domain pattern matches any `word.tld` — so a
 * literal local part would reject every message from `foo.com@example.org`
 * with "Links are not allowed in name". Every branch of that pattern needs a
 * dot (`https://`, `www.`, `word.tld`), so removing dots removes the hazard
 * rather than special-casing it.
 */
function displayNameFor(email: string): string {
  const localPart = email.split('@')[0] ?? ''
  const name = localPart.replace(/[._]+/g, ' ').trim()
  return name || FALLBACK_NAME
}
