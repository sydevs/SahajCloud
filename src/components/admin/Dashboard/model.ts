import type { PayloadRequest } from 'payload'

import type { ProjectSlug } from '@/payload-types'
import { isAdminManager, isManager } from '@/plugins/access/adminOnly'
import { resolveProject } from '@/plugins/access/config'

/** The placeholder carries its project, so the view needs no second read of it. */
export type DashboardChoice =
  | { kind: 'atlas-admin' }
  | { kind: 'atlas-manager' }
  | { kind: 'collections' }
  | { kind: 'placeholder'; project: ProjectSlug }
  | { kind: 'select-project' }

/**
 * Which home `DashboardView` renders, for the project `resolveProject` places
 * the user in — the same answer the browser acts on, so a stored project the
 * manager can no longer reach is not rendered. Sahaj Atlas gives admins an
 * oversight home and everyone else their programs; a project with no dashboard
 * of its own falls through to the placeholder rather than being listed here.
 * `currentProject: null` is the admin "All Content" view (`Managers.ts`), which
 * keeps Payload's collection cards.
 */
export function dashboardChoiceFor(user: PayloadRequest['user'] | undefined): DashboardChoice {
  if (user?.collection !== 'managers') return { kind: 'collections' }
  const { project } = resolveProject(user)
  if (!project) return isManager(user) ? { kind: 'select-project' } : { kind: 'collections' }
  if (project === 'sahaj-atlas') {
    return isAdminManager(user) ? { kind: 'atlas-admin' } : { kind: 'atlas-manager' }
  }
  return { kind: 'placeholder', project }
}
