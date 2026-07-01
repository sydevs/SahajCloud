import type { ProjectSlug } from '@/payload-types'
import { isCollectionVisibleInProject } from '@/plugins/access'

// The plugin's `ContentSlug` isn't re-exported from its barrel; borrow the
// parameter type so the cast below stays tied to the function without a
// deep import into the access plugin's internals.
type ContentSlug = Parameters<typeof isCollectionVisibleInProject>[0]

/**
 * Extract the content slug (collection or global) currently being viewed from an
 * admin pathname, or `null` for non-content routes (dashboard, account, …).
 *
 * `/admin/collections/pages/123` → `pages`; `/admin/globals/wm-web-config` →
 * `wm-web-config`; `/admin` or `/admin/analytics` → `null`.
 */
function currentContentSlug(pathname: string): string | null {
  const match = /\/(?:collections|globals)\/([^/]+)/.exec(pathname)
  return match ? match[1] : null
}

/**
 * Decide whether switching to `newProject` requires navigating to `/admin`.
 *
 * Switching project only changes which collections/globals are *visible* (the
 * nav + `admin.hidden`), never which the user may access. So we redirect away
 * only when the content currently being viewed becomes hidden under the new
 * project — otherwise the current route stays valid and a `router.refresh()`
 * re-renders it in place. Non-content routes (dashboard, account, analytics)
 * are always safe to refresh. Switching to the admin "All Content" view
 * (`null`) never hides anything, so it never redirects.
 */
export function shouldRedirectToAdmin(pathname: string, newProject: ProjectSlug | null): boolean {
  const slug = currentContentSlug(pathname)
  if (!slug) return false
  return !isCollectionVisibleInProject(slug as ContentSlug, newProject)
}
