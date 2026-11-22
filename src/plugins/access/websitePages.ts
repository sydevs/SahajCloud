/**
 * Which pages a website key reads: only those the website's own configuration
 * places (`src/lib/pageServices`, `docs/rules/access.md`).
 *
 * It sits beside the published-only clause rather than in WeMeditateWeb
 * because this is the one place that reaches every surface a page arrives
 * through: a `find`, a `findByID` that carries no `where`, a populated
 * relationship, and the content-index block's own fetch.
 */
import type { PayloadRequest, Where } from 'payload'

import { loadServicePages, servicePagesWhere } from '@/lib/pageServices'

import { getProjectsFromRoles } from './config'

/**
 * The website's page filter for this request, or `null` to add nothing.
 *
 * ⚠ **Keyed on the caller's project, not on one client role**, the way implicit
 * read is (`permissions.ts`), so a second website key is narrowed with no change
 * here. A key also in the app's project is not narrowed: nothing narrows the app
 * yet, because released app builds fetch pages by hardcoded id, and the union
 * of everything with the website's set is everything.
 */
export async function websitePagesClause(
  req: PayloadRequest,
  collection: string,
): Promise<Where | null> {
  if (collection !== 'pages' || req.user?.collection !== 'clients') return null

  const projects = getProjectsFromRoles(req.user.roles)
  if (!projects.includes('wemeditate-web') || projects.includes('wemeditate-app')) return null

  return servicePagesWhere(await loadServicePages(req, 'web'))
}
