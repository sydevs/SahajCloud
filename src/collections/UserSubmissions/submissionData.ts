import { EVENT_REGISTRATION_QUESTIONS } from '@/lib/registrations/questions'
import type { UserSubmission } from '@/payload-types'


/**
 * The bound on `submissionData` — the plugin's `[{ field, value }]` array,
 * which holds the free-form remainder of a submission.
 *
 * **Why a hook and not a `jsonSchema`.** `submissionData` is not a JSON column;
 * it is a Payload array field, and its `value` is a `textarea`. So the guard
 * every other blob on this collection gets from Ajv has to be written out
 * here — and it has to be written out *per type*, because a contact row's
 * legitimate keys are whatever its form's author named, and a registration
 * row's are the event's enabled questions.
 *
 * **Why bound it at all.** The array is client-writable as one blob, so
 * field-level access cannot protect anything inside it, and Payload cannot pair
 * `field`/`value` conditions on one array element — so nothing queryable may
 * live here, and nothing unbounded may either. Without this check a caller
 * chooses both the keys and their sizes on a public endpoint.
 *
 * Everything in this module is pure, so the whole matrix is testable in the
 * unit lane without booting Payload.
 */

/** How many pairs one submission may carry, whatever its type. */
export const MAX_SUBMISSION_DATA_ENTRIES = 40

/** How long a key may be. Authored form fields are named by a person. */
export const MAX_SUBMISSION_DATA_KEY_LENGTH = 100

/** How long a value may be, for a key with no more specific bound below. */
export const DEFAULT_MAX_VALUE_LENGTH = 2000

/**
 * Per-key value bounds, for the keys that hold prose rather than a token.
 * Mirrors what the collections being replaced enforced: `UserMessages.message`
 * was `maxLength: 5000`.
 */
export const VALUE_MAX_LENGTHS: Readonly<Record<string, number>> = {
  message: 5000,
  note: 5000,
  error: 5000,
}

/**
 * Keys every type may carry: who sent it, in what language, and from where.
 *
 * These are the `context` keys `user-messages` accepted, flattened into the
 * pairs array. They are not per-type because the client that sends them does
 * not vary by type — the same widget reports its path and user agent whether
 * the visitor is registering or filing a bug.
 */
export const BASE_SUBMISSION_KEYS = [
  'name',
  'locale',
  'path',
  'hostUrl',
  'userAgent',
  'error',
] as const

/**
 * Keys a type adds to the base set, beyond whatever its form authored.
 *
 * `subscribe` adds none: an address plus a name is the whole of a subscription,
 * and the address is a real column.
 */
export const TYPE_SUBMISSION_KEYS: Record<UserSubmission['type'], readonly string[]> = {
  contact: ['subject', 'message'],
  subscribe: [],
  registration: EVENT_REGISTRATION_QUESTIONS.map((question) => question.name),
  proposal: ['note'],
}

/**
 * Every key this submission may carry.
 *
 * `formFieldNames` is what the authored form declares — read from the live
 * `forms` document rather than restated here, because an author adds a field
 * whenever they like and a fixed list would refuse it the moment they did.
 */
export function allowedSubmissionKeys(
  type: UserSubmission['type'],
  formFieldNames: readonly string[] = [],
): Set<string> {
  return new Set<string>([
    ...BASE_SUBMISSION_KEYS,
    ...TYPE_SUBMISSION_KEYS[type],
    ...formFieldNames,
  ])
}

/** One `submissionData` pair, as it arrives. */
export interface SubmissionDataEntry {
  field?: unknown
  value?: unknown
}

/**
 * Check the pairs against the allowed keys and the length bounds.
 *
 * Returns the problems rather than throwing, so the caller owns the error
 * envelope and this stays a pure function. Every message **names the offending
 * key**: a 400 saying only "invalid submission data" tells a client integrator
 * nothing they can act on.
 */
export function checkSubmissionData(
  entries: unknown,
  allowed: ReadonlySet<string>,
): string[] {
  if (entries == null) return []
  if (!Array.isArray(entries)) return ['`submissionData` must be a list of field/value pairs.']

  const problems: string[] = []

  // Returns immediately rather than reporting and carrying on: the caller joins
  // every problem into one response message, so walking a 100k-entry array
  // would answer with 100k sentences about a request already refused.
  if (entries.length > MAX_SUBMISSION_DATA_ENTRIES) {
    return [
      `A submission may carry at most ${MAX_SUBMISSION_DATA_ENTRIES} answers; this one has ${entries.length}.`,
    ]
  }

  const seen = new Set<string>()

  for (const entry of entries as SubmissionDataEntry[]) {
    const key = entry?.field

    if (typeof key !== 'string' || key.length === 0) {
      problems.push('Every answer needs a `field` name.')
      continue
    }

    if (key.length > MAX_SUBMISSION_DATA_KEY_LENGTH) {
      problems.push(`\`${key.slice(0, MAX_SUBMISSION_DATA_KEY_LENGTH)}…\` is not a valid field name.`)
      continue
    }

    if (!allowed.has(key)) {
      problems.push(`\`${key}\` is not a field this submission accepts.`)
      continue
    }

    // A repeated key silently overwrites downstream, so it is a malformed
    // blob rather than a harmless one.
    if (seen.has(key)) {
      problems.push(`\`${key}\` appears more than once.`)
      continue
    }
    seen.add(key)

    const value = entry?.value
    if (value != null && typeof value !== 'string') {
      problems.push(`\`${key}\` must be text.`)
      continue
    }

    const max = VALUE_MAX_LENGTHS[key] ?? DEFAULT_MAX_VALUE_LENGTH
    if (typeof value === 'string' && value.length > max) {
      problems.push(`\`${key}\` is longer than the ${max} characters allowed.`)
    }
  }

  return problems
}

/**
 * Keys whose value may legitimately contain a URL, and so are never URL-scanned.
 *
 * This is the exemption `user-messages` expressed by not scanning its `context`
 * column at all: a crash report names the page it happened on, and the host URL
 * of the embedding site *is* a URL. Flattening those keys into the same array
 * as the message body is what makes the exemption need spelling out — the
 * write-guard's `urlScanFields` walks a path's every string leaf, so it cannot
 * tell one pair from another. See `policies.ts`.
 *
 * ⚠ **A constraint on whatever renders these pairs.** Exempt does not mean
 * harmless: `error` holds up to 5000 characters a sender chose, links included.
 * Nothing renders `submissionData` as HTML today — the admin shows textareas —
 * so there is no live hazard, but Phase 2's delivery templates must not turn
 * these five keys into anchors.
 */
export const URL_EXEMPT_KEYS: ReadonlySet<string> = new Set([
  'path',
  'hostUrl',
  'error',
  'userAgent',
  'locale',
])

/**
 * The pairs a URL scan should look at, as `{ [key]: value }` — the shape
 * `checkNoUrls` takes, so the failure it raises names the offending key.
 */
export function urlScannablePairs(entries: unknown): Record<string, string> {
  if (!Array.isArray(entries)) return {}
  const pairs: Record<string, string> = {}
  for (const entry of entries as SubmissionDataEntry[]) {
    const key = entry?.field
    const value = entry?.value
    if (typeof key !== 'string' || typeof value !== 'string') continue
    if (URL_EXEMPT_KEYS.has(key)) continue
    pairs[key] = value
  }
  return pairs
}

/** Read one pair's value out of the blob, for the hooks that compose from it. */
export function readSubmissionValue(entries: unknown, key: string): string | undefined {
  if (!Array.isArray(entries)) return undefined
  const found = (entries as SubmissionDataEntry[]).find((entry) => entry?.field === key)
  return typeof found?.value === 'string' ? found.value : undefined
}
