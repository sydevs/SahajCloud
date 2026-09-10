// Override the audit on auth.create_account: the handoff designates the
// provider/email-error cluster (+ login_with_existing_account) a PRODUCT
// QUESTION, not a delete. Keep them in the leaf, flagged as currently-unused,
// and empty the dead list so nothing is removed. They're surfaced in the report.
import { readFileSync, writeFileSync } from 'node:fs'

const P = 'temp_scripts/ia-specs.json'
const specs = JSON.parse(readFileSync(P, 'utf8'))
const ca = specs.find((s) => s.leaf === 'auth.create_account')
if (!ca) throw new Error('auth.create_account not found')

const SECTION = 'Currently unused — needs a product decision'
const KEPT = [
  [
    'error_email_in_use',
    'Appears unused — email collisions show the “You already have an account” sheet instead. Kept pending a product decision.',
  ],
  [
    'login_with_existing_account',
    'Appears unused — its button is gated by a flag that is never turned on, so it can’t currently show. Kept pending a product decision.',
  ],
  [
    'error_google_failed',
    'Appears unused — a failed Google sign-in shows a shared error dialog instead. Kept pending a product decision.',
  ],
  [
    'error_apple_failed',
    'Appears unused — a failed Apple sign-in shows a shared error dialog instead. Kept pending a product decision.',
  ],
  [
    'error_facebook_failed',
    'Appears unused — a failed Facebook sign-in shows a shared error dialog instead. Kept pending a product decision.',
  ],
  [
    'error_provider_cancelled',
    'Appears unused — a cancelled social sign-in is dismissed silently with no message. Kept pending a product decision.',
  ],
]

// Insert the kept-unused string keys just before the trailing richText consent_label.
const consentIdx = ca.order.findIndex((o) => o.key === 'consent_label')
const insertAt = consentIdx >= 0 ? consentIdx : ca.order.length
const rows = KEPT.map(([key, description]) => ({ key, section: SECTION, description }))
ca.order.splice(insertAt, 0, ...rows)
ca.dead = []

writeFileSync(P, JSON.stringify(specs, null, 2) + '\n')
console.log(
  `auth.create_account: kept ${KEPT.length} flagged keys, dead now []; order=${ca.order.length}`,
)
