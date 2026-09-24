import type { CollectionSlug } from 'payload'

import type { ProjectSlug } from '@/payload-types'

/**
 * A document the login endpoints work on, narrowed to what they read.
 *
 * ⚠ **Deliberately structural, not `Pick<Manager, …>`.** The endpoints are
 * keyed on a configured slug now, so a shape tied to one collection's generated
 * type would make every second collection a cast. `isEligible` and `project`
 * read their own fields off the index signature, which is why
 * {@link LoginCollectionConfig} carries `select` beside them.
 *
 * Distinct from `session.ts`'s `SessionDocument`, which narrows a different
 * read: this is what the endpoints select, that is what `createSession` needs
 * off its own `findByID`. Neither is a subset of the other.
 */
export interface LoginDocument {
  [field: string]: unknown
  email?: null | string
  id: number | string
  magicLinkIssuedAt?: null | string
  name?: null | string
}

/** What the two mail generators are handed. */
export interface LoginMailArgs {
  doc: LoginDocument
  /** Branding, resolved by {@link LoginCollectionConfig.project}. */
  project: ProjectSlug | undefined
  /** The absolute URL that spends the link. */
  signInUrl: string
  /** The link's lifetime, already rendered — "15 minutes". Derived from the TTL. */
  validFor: string
}

/**
 * One auth collection the login plugin serves.
 *
 * ⚠ **The slug is the only required member.** The plugin renders and sends the
 * mail itself (`mail.ts`), so a collection supplies only what is genuinely its
 * own — which of its documents may sign in, and which project brands the
 * message.
 */
export interface LoginCollectionConfig {
  /** The auth collection. It must be able to hold a session — see `createSession`. */
  slug: CollectionSlug
  /**
   * Override the sign-in mail body. Mirrors `auth.verify.generateEmailHTML`,
   * which is how this project builds its other auth mail.
   */
  generateEmailHTML?: (args: LoginMailArgs) => Promise<string> | string
  /** Override the subject. @see generateEmailHTML */
  generateEmailSubject?: (args: LoginMailArgs) => string
  /**
   * Refuse a link for a document this rejects — a deactivated account, say.
   * Runs on both endpoints, so a document that stops qualifying cannot spend a
   * link already delivered. Defaults to accepting every document.
   *
   * ⚠ It reads the document, never `req.user`: both endpoints are anonymous.
   */
  isEligible?: (doc: LoginDocument) => boolean
  /**
   * Which project brands the mail. Defaults to `wemeditate-web` when this is
   * absent or returns nothing.
   */
  project?: (doc: LoginDocument) => null | ProjectSlug | undefined
  /**
   * Where a consumed link sends the holder. Defaults to `/admin`.
   */
  redirectTo?: string
  /**
   * The page that asks for a fresh link, as a site-absolute path.
   *
   * Every refusal this plugin can serve tells the reader to request a new
   * link, so without this they are told to do something the page gives them no
   * way to do. Supplying it also puts the control on the admin login form, for
   * the collection the admin panel authenticates.
   */
  requestPagePath?: string
  /**
   * Extra fields to select, for `isEligible` and `project` to read. Both
   * endpoints select a bounded field list, so a callback reading an unlisted
   * field sees `undefined` rather than the stored value.
   */
  select?: Record<string, true>
}
