import type { CollectionSlug } from 'payload'

/**
 * A document the login endpoints work on, narrowed to what they read.
 *
 * ⚠ **Deliberately structural, not `Pick<Manager, …>`.** The endpoints are
 * keyed on a configured slug now, so a shape tied to one collection's generated
 * type would make every second collection a cast. `isEligible` reads its own
 * fields off the index signature, which is why {@link LoginCollectionConfig}
 * carries `select` beside it.
 */
export interface LoginDocument {
  [field: string]: unknown
  email?: null | string
  id: number | string
  magicLinkIssuedAt?: null | string
  name?: null | string
}

/** What {@link LoginCollectionConfig.mail} is handed. */
export interface LoginMailArgs {
  doc: LoginDocument
  /** The absolute URL that spends the link. */
  signInUrl: string
  /** The link's lifetime, already rendered — "15 minutes". Derived from the TTL. */
  validFor: string
}

/** What {@link LoginCollectionConfig.mail} returns, passed to `payload.sendEmail`. */
export interface LoginMail {
  from: string
  html: string
  subject: string
}

/**
 * One auth collection the login plugin serves.
 *
 * ⚠ **`mail` is required, and that is the point of this type.** A sign-in link
 * cannot be sent generically: the envelope sender, the subject and the template
 * are the collection's own branding, and a plugin-supplied default would mail
 * every future collection as if it were `managers`. Supplying it is what makes
 * a second slug honest rather than a knob the endpoints cannot honour.
 */
export interface LoginCollectionConfig {
  /**
   * Build the sign-in mail. The endpoint sends whatever this returns and never
   * inspects it.
   */
  mail: (args: LoginMailArgs) => LoginMail | Promise<LoginMail>
  /** The auth collection. It must be able to hold a session — see `createSession`. */
  slug: CollectionSlug
  /**
   * Refuse a link for a document this rejects — a deactivated account, say.
   * Runs on both endpoints, so a document that stops qualifying cannot spend a
   * link already delivered. Defaults to accepting every document.
   *
   * ⚠ It reads the document, never `req.user`: both endpoints are anonymous.
   */
  isEligible?: (doc: LoginDocument) => boolean
  /**
   * Where a consumed link sends the holder. Defaults to `/admin`.
   */
  redirectTo?: string
  /**
   * Extra fields to select, for `isEligible` to read. Both endpoints select a
   * bounded field list, so a predicate reading an unlisted field sees
   * `undefined` rather than the stored value.
   */
  select?: Record<string, true>
}
