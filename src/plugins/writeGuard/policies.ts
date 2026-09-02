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
 * the whole public write surface: API clients can only ever write
 * event-submissions and user-messages (built-in create), and users +
 * registrations through the register endpoint's internal upserts (which forward
 * the client `req`, so they land here too). Nothing sits outside it any more —
 * the `contactAdmin` root endpoint that used to call these helpers by hand
 * became the `user-messages` collection (#632).
 *
 * Every public write path now requires Turnstile. Registrations were the last
 * one without it (#629); the Atlas widget began sending `x-turnstile-token` on
 * registration in sydevs/SahajAtlasWeb#182, which is what made the flip safe —
 * turning it on before that would have refused every real registration.
 */
export const DEFAULT_WRITE_GUARD_POLICIES: Partial<Record<CollectionSlug, WriteGuardPolicy>> = {
  'event-submissions': {
    create: {
      turnstile: true,
      // The submission carries one `proposed` Events patch plus its intake
      // metadata, so the free text a spammer would use sits one level down.
      // These are paths, not field names — `valueAtPath` walks them, and
      // `stringLeaves` covers the nested address/contact values under
      // `proposed` without each having to be listed.
      emailFields: ['submitterInfo.email', 'proposed.contactEmail'],
      urlScanFields: [
        'proposed.description',
        'proposed.contactName',
        // The whole address group: `stringLeaves` walks it, so street, room,
        // city and the rest are scanned too. Naming only `venueName` left a
        // spammer free to put a URL in the street line.
        'proposed.address',
        'proposed.title',
        'submitterInfo.note',
        'submitterInfo.name',
      ],
    },
  },
  users: {
    create: { emailFields: ['email'], urlScanFields: ['name'] },
    update: { emailFields: ['email'], urlScanFields: ['name'] },
  },
  registrations: {
    create: { turnstile: true, urlScanFields: ['questions'] },
  },
  'user-messages': {
    create: {
      turnstile: true,
      emailFields: ['senderEmail'],
      // The message body and the caller's subject label are the only free text
      // a spammer controls. `context` is deliberately NOT scanned: a crash
      // report legitimately carries a URL (the page it happened on), which is
      // the exemption the old endpoint spelled out by scanning only `message`.
      urlScanFields: ['message', 'subject'],
    },
  },
}
