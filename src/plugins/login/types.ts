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
   * Take passwords away from this collection: `auth.disableLocalStrategy` in
   * the object form, and `maxLoginAttempts: 0` (#840).
   *
   * ⚠ **Per collection, because it is a schema change.** The plugin serves any
   * auth collection, and setting this plugin-wide would silently rewrite the
   * auth columns of the next slug added to `collections` — `clients` needs the
   * bare `true` form and would gain `email`, `_verified` and `sessions` from a
   * one-line edit to an array.
   */
  passwordless?: boolean
  /**
   * One address that signs in on request, with no mail and no token.
   *
   * ⚠ **The address IS the credential**, so it is only ever set where the same
   * gate provisions the account — a Railway preview, never production, never CI,
   * never local dev (`src/plugins/previewAdmin`). Absent, `issueMagicLink` has
   * no branch to take and every address is mailed.
   *
   * ⚠ **Per collection, for the same reason as `passwordless`.** It names one
   * address on one collection, so setting it plugin-wide would sign a caller
   * into the next slug added to `collections` with the *manager* address.
   *
   * ⚠ Stored lowercased and trimmed, matching what Payload writes and what
   * `magicLinkEmailSchema` parses — a capital here would otherwise match nothing
   * and mail the preview admin a link no lane can open.
   */
  previewAutoSignIn?: string
  /**
   * Refuse a link for a document this rejects — a deactivated account, say.
   * Runs on both endpoints, so a document that stops qualifying cannot spend a
   * link already delivered. Defaults to accepting every document.
   *
   * ⚠ It reads the document, never `req.user`: both endpoints are anonymous.
   */
  isEligible?: (doc: LoginDocument) => boolean
  /**
   * The tab of the account page that holds the collection's notification
   * preferences, by label. An accepted account's invitation links there
   * ("Configure notifications"); without one it lands on the default tab.
   */
  notificationsTab?: string
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
   * The sign-in page this collection's links resolve against, as a
   * site-absolute path.
   *
   * ⚠ **Required, because it is the address in the mail.** The delivered link is
   * `<requestPagePath>?token=…`, and every refusal the redeem route can serve
   * redirects to `<requestPagePath>?error=expired|invalid`. So one page asks for
   * a link, confirms a delivered one, and explains a refused one — which is why
   * this plugin no longer renders HTML of its own. Supplying it also puts the
   * control on the admin login form, for the collection the admin panel
   * authenticates.
   */
  requestPagePath: string
  /**
   * Extra fields to select, for `isEligible` and `project` to read. Both
   * endpoints select a bounded field list, so a callback reading an unlisted
   * field sees `undefined` rather than the stored value.
   */
  select?: Record<string, true>
}
