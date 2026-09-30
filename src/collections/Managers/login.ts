import type { Manager } from '@/payload-types'
import type { LoginCollectionConfig } from '@/plugins/login'

const INACTIVE: Manager['type'] = 'inactive'

/**
 * The logged-out page that asks for a sign-in link: Payload's admin login
 * route, whose view `loginPlugin` replaces (`@/components/admin/SignIn`).
 *
 * The one spelling of the path, read by the config below and by the tests.
 * ⚠ It is `routes.admin` plus `admin.routes.login`, both Payload's defaults —
 * `src/payload.config.ts` overrides neither. Overriding either needs this
 * changed by hand.
 */
export const MANAGER_SIGNIN_PATH = '/admin/login'

/** The account tab holding Notification Preferences — `Managers.ts` labels it with this. */
export const MANAGER_NOTIFICATIONS_TAB = 'Contact'

/**
 * What `loginPlugin` needs to serve sign-in links to `managers` (#837).
 *
 * Both values are this collection's own — the predicate reads a `managers`
 * enum, and `currentProject` is a `managers` field. The plugin renders and
 * sends the mail itself.
 */
export const managersLogin: LoginCollectionConfig = {
  slug: 'managers',
  // Same predicate as `requireActiveManager`, read off the fetched document
  // rather than `req.user` — both endpoints are anonymous. `INACTIVE` is typed
  // against the generated enum, so renaming that option upstream fails here
  // rather than quietly letting every manager through.
  isEligible: (doc) => doc.type !== INACTIVE,
  // An invitation's "Configure notifications" opens the account on this tab.
  notificationsTab: MANAGER_NOTIFICATIONS_TAB,
  // A manager signs in by link only (#840). The plugin turns this into
  // `auth.disableLocalStrategy` plus `maxLoginAttempts: 0`; `clients` is served
  // by nothing here and keeps its own bare `disableLocalStrategy: true`.
  passwordless: true,
  // `null` is the admin "All Content" view, which has no brand of its own — the
  // plugin's default stands in. Note this diverges from #483, which brands the
  // verify and reset mail `wemeditate-web` regardless of the recipient.
  project: (doc) => doc.currentProject as Manager['currentProject'],
  // What the two callbacks above read. The endpoints select a bounded field
  // list, so without this they would see `undefined` — and an inactive manager
  // would be let in.
  select: { currentProject: true, type: true },
  // Every emailed link and every refusal lands here, and `passwordless` plus
  // `admin.user` being this collection is what puts the sign-in view there.
  requestPagePath: MANAGER_SIGNIN_PATH,
}
