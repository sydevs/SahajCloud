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
 * event-submissions (built-in create), and users + registrations through the
 * register endpoint's internal upserts (which forward the client `req`, so
 * they land here too). Root endpoints (`contactAdmin`) sit outside collections
 * and call the same helpers by hand.
 *
 * Registrations deliberately carry no `turnstile` yet — adding the widget to
 * the Atlas registration form is a tracked follow-up; flipping it on here is
 * a one-line policy change.
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
        // Inside the address group, not beside it — `addressFields` nests it.
        'proposed.address.venueName',
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
    create: { urlScanFields: ['questions'] },
  },
}
