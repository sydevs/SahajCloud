import type { CollectionSlug } from 'payload'

/**
 * Anti-spam checks to run for one operation on one collection. Absent knobs
 * mean "don't run that check".
 */
export interface WriteGuardOperationPolicy {
  /**
   * Require a valid Cloudflare Turnstile token in the `x-turnstile-token`
   * header. The token is transport metadata, not document data — a header
   * keeps it out of the doc shape on the built-in REST endpoints.
   */
  turnstile?: boolean
  /** Fields to run the format + disposable-domain email check on. */
  emailFields?: string[]
  /**
   * Fields whose free text must not contain URLs. Dedicated URL fields
   * (website, onlineUrl, …) are simply never listed.
   *
   * ⚠ **Every string leaf under a listed path is scanned, not only a string at
   * the path.** The guard runs `beforeValidate`, so the value is whatever the
   * body said, and `checkNoUrls` skips a non-string — reading the path as a
   * scalar accepts `{ name: { nickname: <link> } }`. Pinned by
   * `tests/unit/write-guard-error-shape.spec.ts`, since every live entry is a
   * scalar.
   *
   * ⚠ Omission is the mechanism here, so this list can only cover a column
   * somebody remembered to add. A column set that must stay in step with
   * another collection's config belongs in `derivedScan` instead (#948).
   */
  urlScanFields?: string[]
  /**
   * A column holding a client-authored field patch for `collection`. Its string
   * leaves are scanned by `proposalLeaves` — URLs refused, `type: 'email'`
   * columns judged as addresses, and a column declared to hold an address or a
   * link exempt — all read off that collection's live config rather than listed,
   * so a column added there is covered the day it lands (#948).
   */
  derivedScan?: { path: string; collection: CollectionSlug }
}

export interface WriteGuardPolicy {
  create?: WriteGuardOperationPolicy
  update?: WriteGuardOperationPolicy
}

/**
 * Which collections get which checks on **client-originated** writes. This is
 * the whole public write surface: an API client creates `user-submissions`
 * rows, and `prepareUserSubmission` upserts the sender's `users` row on the
 * client's own `req`, so that write lands here too. Nothing sits outside it —
 * the `contactAdmin` root endpoint that once called these helpers by hand
 * became a collection for this reason (#632).
 *
 * Every public write path requires Turnstile. Registrations were the last one
 * without it (#629); the Atlas widget began sending `x-turnstile-token` on
 * registration in sydevs/SahajAtlasWeb#182, which is what made the flip safe —
 * turning it on before that would have refused every real registration.
 */
export const DEFAULT_WRITE_GUARD_POLICIES: Partial<Record<CollectionSlug, WriteGuardPolicy>> = {
  users: {
    create: { emailFields: ['email'], urlScanFields: ['name'] },
    update: { emailFields: ['email'], urlScanFields: ['name'] },
  },
  // The unified public intake (#723). One type-aware policy replaces the three
  // per-collection ones it succeeded, and it is deliberately their union
  // rather than a per-type branch: the guard runs beforeValidate, on data whose
  // `type` a forged body chooses, so a policy that relaxed a check for one type
  // could be reached by claiming to be that type. Every path here is public, so
  // every path gets every check.
  'user-submissions': {
    create: {
      turnstile: true,
      emailFields: ['senderEmail'],
      // ⚠ `submissionData` is deliberately **absent**, and is scanned by
      // `prepareUserSubmission` instead. A path here is walked by
      // `stringLeaves`, which flattens the whole `[{field, value}]` array — and
      // that array now carries the crash-report context (`error`, `path`,
      // `hostUrl`) that a contact message exempts on purpose, because a bug
      // report legitimately names the page it happened on. A path cannot say
      // "every pair except those three"; a schema built from the form, which
      // knows every pair's key, can — and each key's own check calls the same
      // `checkNoUrls` or `checkEmailAllowed` and raises the same failure. An
      // `email` block's answer is judged as an address for that reason (#899),
      // and no policy path could name it: the operator chooses the key.
      // ⚠ `subject` is deliberately absent, though the collection this
      // replaced scanned it. There it was a client-writable column; here it carries
      // `systemFieldAccess`, and Payload deletes an access-denied field in the
      // *field* beforeValidate pass — which runs before this collection hook —
      // so for the only callers this guard inspects the value is always gone.
      // The subject a sender actually writes travels in `submissionData`, and
      // `submissionDataSchema` covers it there.
      //
      // `proposed` is an Events field patch, so every check it owes is derived
      // from that collection's config rather than listed here.
      derivedScan: { path: 'proposed', collection: 'events' },
    },
  },
}
