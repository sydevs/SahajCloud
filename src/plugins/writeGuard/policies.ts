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
   * Fields whose free text must not contain URLs. A field holding an object
   * (e.g. registration `questions`) has all its string leaves scanned.
   * Dedicated URL fields (website, onlineUrl, …) are simply never listed.
   */
  urlScanFields?: string[]
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
      emailFields: ['senderEmail', 'proposed.contactEmail'],
      // `proposed` is scanned the way `event-submissions` scanned it: by group,
      // so the street line is covered as well as the venue name.
      //
      // ⚠ `submissionData` is deliberately **absent**, and is scanned by
      // `prepareUserSubmission` instead. A path here is walked by
      // `stringLeaves`, which flattens the whole `[{field, value}]` array — and
      // that array now carries the crash-report context (`error`, `path`,
      // `hostUrl`) that a contact message exempts on purpose, because a bug
      // report legitimately names the page it happened on. A path cannot say
      // "every pair except those three"; a hook that already knows each pair's
      // key can, and it uses the same `checkNoUrls` and raises the same
      // `urls_not_allowed` failure.
      // ⚠ `subject` is deliberately absent, though the collection this
      // replaced scanned it. There it was a client-writable column; here it carries
      // `systemFieldAccess`, and Payload deletes an access-denied field in the
      // *field* beforeValidate pass — which runs before this collection hook —
      // so for the only callers this guard inspects the value is always gone.
      // The subject a sender actually writes travels in `submissionData`, and
      // `urlScannablePairs` covers it there.
      urlScanFields: [
        'proposed.description',
        'proposed.contactName',
        'proposed.address',
        'proposed.title',
      ],
    },
  },
}
