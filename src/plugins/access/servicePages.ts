/**
 * Which pages a client reads: only those its service's configuration places
 * (`src/lib/pageServices`, `docs/rules/access.md`).
 *
 * It sits beside the published-only clause rather than in each consumer
 * because this is the one place that reaches every surface a page arrives
 * through: a `find`, a `findByID` that carries no `where`, a populated
 * relationship, and the content-index block's own fetch.
 */
import type { PayloadRequest, Where } from 'payload'

import { loadServicePages, servicePagesWhere, type PageService } from '@/lib/pageServices'
import type { ProjectSlug } from '@/payload-types'

import { getProjectsFromRoles } from './config'

/**
 * The services whose pages each project's clients read.
 *
 * The app reads the website's pages too: it opens a page it does not carry in
 * its in-app browser, at the page's `webUrl`, so it must still learn that
 * address. The website never falls back to the app.
 *
 * ⚠ **A project that lists `pages` must be named here**, or its clients read
 * every published page — `tests/unit/service-pages-clause.spec.ts` fails one that
 * is not.
 */
export const PAGE_SERVICES_BY_PROJECT: Partial<Record<ProjectSlug, readonly PageService[]>> = {
  'wemeditate-web': ['web'],
  'wemeditate-app': ['app', 'web'],
}

/**
 * The page filter for this request, or `null` to add nothing.
 *
 * ⚠ **Keyed on the caller's project, not on one client role**, the way implicit
 * read is (`permissions.ts`), so a second website or app key is narrowed with no
 * change here. A key in several projects reads the union of their services.
 */
export async function servicePagesClause(
  req: PayloadRequest,
  collection: string,
): Promise<Where | null> {
  if (collection !== 'pages' || req.user?.collection !== 'clients') return null

  const services = new Set(
    getProjectsFromRoles(req.user.roles).flatMap(
      (project) => PAGE_SERVICES_BY_PROJECT[project] ?? [],
    ),
  )
  if (!services.size) return null

  const clauses = await Promise.all(
    [...services].map(async (service) => servicePagesWhere(await loadServicePages(req, service))),
  )
  return clauses.length === 1 ? clauses[0] : { or: clauses }
}
