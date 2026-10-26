import type { PayloadRequest } from 'payload'

import type { ProjectSlug } from '@/payload-types'
import { isManager } from '@/plugins/access/adminOnly'

/** The placeholder carries its project, so the view needs no second read of it. */
export type DashboardChoice =
  | { kind: 'atlas' }
  | { kind: 'collections' }
  | { kind: 'placeholder'; project: ProjectSlug }
  | { kind: 'select-project' }

/**
 * Which home `DashboardView` renders. The current project alone decides, so an
 * admin working in a project sees what its managers see, and a project with no
 * dashboard of its own falls through to the placeholder rather than being
 * listed here. `currentProject: null` is the admin "All Content" view
 * (`Managers.ts`), which keeps Payload's collection cards.
 */
export function dashboardChoiceFor(user: PayloadRequest['user'] | undefined): DashboardChoice {
  const project = user?.collection === 'managers' ? user.currentProject : null
  if (!project) return isManager(user) ? { kind: 'select-project' } : { kind: 'collections' }
  return project === 'sahaj-atlas' ? { kind: 'atlas' } : { kind: 'placeholder', project }
}
