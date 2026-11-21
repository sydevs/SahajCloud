/**
 * Which pages a service may read — the website's, the app's, or both.
 *
 * It lives beside the published-only clause rather than in each consumer
 * because this is the only place that reaches every surface a page arrives
 * through: a `find`, a `findByID` that carries no `where`, a populated
 * relationship, and the content-index block's own fetch. It is also the only
 * mechanism that can hide a page from an **installed** app release, which
 * ships compiled. `docs/rules/access.md` carries the rule.
 */
import type { PayloadRequest, Where } from 'payload'

import type { Page, ProjectSlug } from '@/payload-types'

import { getProjectsFromRoles } from './config'

/**
 * One project, and the `pages` column that answers it.
 *
 * ⚠ **Keyed on the project, not on the client role, so a role added later
 * narrows without being listed here.** Implicit read is project-keyed too
 * (`permissions.ts`), so a second website or app key would otherwise be granted
 * `pages` and narrowed by nothing — the fail-open direction. The cost is the
 * same rule in reverse: any role placed in these projects takes the channel.
 *
 * Typed against both generated unions, so renaming either a project or a column
 * fails `pnpm typecheck` here instead of silently narrowing nothing.
 */
const CHANNEL_BY_PROJECT: Partial<Record<ProjectSlug, keyof Page>> = {
  'wemeditate-web': 'publishedToWeb',
  'wemeditate-app': 'publishedToApp',
}

/**
 * The channel filter for this request, or `null` when the request has none.
 *
 * `null` means "add nothing", never "allow nothing": a caller that is not a
 * client, a collection that is not `pages`, and a client in no channelled
 * project all reach `pages` under the rules that already govern them.
 * `sahaj-atlas-client` is the last case — its project does not name `pages`,
 * so `hasPermission` has already refused it.
 */
export function publicChannelClause(req: PayloadRequest, collection: string): Where | null {
  if (collection !== 'pages' || req.user?.collection !== 'clients') return null

  const projects = getProjectsFromRoles(req.user.roles)
  const clauses = projects
    .map((project) => CHANNEL_BY_PROJECT[project])
    .filter((column): column is keyof Page => Boolean(column))
    .map((column) => ({ [column]: { equals: true } }) as Where)

  if (!clauses.length) return null
  return clauses.length === 1 ? clauses[0] : { or: clauses }
}
