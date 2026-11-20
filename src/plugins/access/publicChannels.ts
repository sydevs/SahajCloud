/**
 * Which pages a service may read — the website's, the app's, or both.
 *
 * It lives beside the published-only clause rather than in each consumer
 * because this is the only place that reaches every surface a page arrives
 * through: a `find`, a `findByID` that carries no `where`, a populated
 * relationship, the live-preview proxy and the content-index block's own
 * fetch. It is also the only mechanism that can hide a page from an
 * **installed** app release, which ships compiled.
 */
import type { PayloadRequest, Where } from 'payload'

import type { Page, RoleSlug } from '@/payload-types'

/**
 * One client role, and the `pages` column that answers it.
 *
 * Typed against both generated unions, so renaming either a role or a column
 * fails `pnpm typecheck` here instead of silently narrowing nothing.
 */
const CHANNEL_BY_ROLE: Partial<Record<RoleSlug, keyof Page>> = {
  'wemeditate-web-client': 'publishedToWeb',
  'wemeditate-app-client': 'publishedToApp',
}

/**
 * The channel filter for this request, or `null` when the request has none.
 *
 * `null` means "add nothing", never "allow nothing": a caller that is not a
 * client, a collection that is not `pages`, and a client holding neither
 * channel role all reach `pages` under the rules that already govern them.
 * `sahaj-atlas-client` is the last case — its project does not name `pages`,
 * so `hasPermission` has already refused it.
 */
export function publicChannelClause(req: PayloadRequest, collection: string): Where | null {
  if (collection !== 'pages' || req.user?.collection !== 'clients') return null

  // A client's roles are a flat, non-localized array (`Clients.roles`), so no
  // locale scope applies here.
  const roles = (req.user.roles ?? []) as RoleSlug[]

  const columns = [...new Set(roles.map((role) => CHANNEL_BY_ROLE[role]).filter(Boolean))]
  if (!columns.length) return null

  const clauses = columns.map((column) => ({ [column as string]: { equals: true } }))
  return clauses.length === 1 ? clauses[0] : { or: clauses }
}
