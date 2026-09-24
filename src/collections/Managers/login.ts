import type { Manager } from '@/payload-types'
import type { LoginCollectionConfig } from '@/plugins/login'

const INACTIVE: Manager['type'] = 'inactive'

/**
 * The logged-out page that asks for a sign-in link.
 *
 * ⚠ Exported because the route itself must agree with it — a literal in both
 * places would let the refusal pages and the admin control point at a 404.
 */
export const MANAGER_SIGNIN_PATH = '/managers/signin'

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
  // `null` is the admin "All Content" view, which has no brand of its own — the
  // plugin's default stands in. Note this diverges from #483, which brands the
  // verify and reset mail `wemeditate-web` regardless of the recipient.
  project: (doc) => doc.currentProject as Manager['currentProject'],
  // What the two callbacks above read. The endpoints select a bounded field
  // list, so without this they would see `undefined` — and an inactive manager
  // would be let in.
  select: { currentProject: true, type: true },
  // Both refusal pages link here, and it is what puts the control on the admin
  // login form — `admin.user` is this collection (#838).
  requestPagePath: MANAGER_SIGNIN_PATH,
}
