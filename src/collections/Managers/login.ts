import type { Manager } from '@/payload-types'
import type { LoginCollectionConfig } from '@/plugins/login'

const INACTIVE: Manager['type'] = 'inactive'

/**
 * What `loginPlugin` needs to serve sign-in links to `managers` (#837).
 *
 * The predicate reads a `managers` enum, so it is this collection's own. The
 * plugin renders and sends the mail itself.
 */
export const managersLogin: LoginCollectionConfig = {
  slug: 'managers',
  // Same predicate as `requireActiveManager`, read off the fetched document
  // rather than `req.user` — both endpoints are anonymous. `INACTIVE` is typed
  // against the generated enum, so renaming that option upstream fails here
  // rather than quietly letting every manager through.
  isEligible: (doc) => doc.type !== INACTIVE,
  // `type` is what `isEligible` reads, and the endpoints select a bounded field
  // list — without this it would see `undefined` and let an inactive manager in.
  select: { type: true },
}
