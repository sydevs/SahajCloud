import type { AdminViewServerProps, PayloadRequest } from 'payload'
import type { ReactNode } from 'react'

import { Gutter } from '@payloadcms/ui'
import { CollectionCards } from '@payloadcms/ui/rsc'

import type { ProjectSlug } from '@/payload-types'
import { isAdminManager, isManager } from '@/plugins/access/adminOnly'
import { getProjectLabel, resolveProject } from '@/plugins/access/config'

import AtlasAdmin from './AtlasAdmin'
import AtlasManager from './AtlasManager'
import { CenteredNotice } from '../CenteredNotice'
import ProjectSelectionPrompt from './ProjectSelectionPrompt'

/** `no-dashboard` carries its project, so the view needs no second read of it. */
type DashboardChoice =
  | { kind: 'atlas-admin' }
  | { kind: 'atlas-manager' }
  | { kind: 'collections' }
  | { kind: 'no-dashboard'; project: ProjectSlug }
  | { kind: 'select-project' }

/**
 * Which dashboard the view renders, for the project `resolveProject` places
 * the user in — the same answer the browser acts on, so a stored project the
 * manager can no longer reach is not rendered. Sahaj Atlas gives admins an
 * oversight dashboard and everyone else their programs; a project with no dashboard
 * of its own falls through to `no-dashboard` rather than being listed here.
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
  return { kind: 'no-dashboard', project }
}

/**
 * The admin homepage, registered as `admin.components.views.dashboard` in place
 * of Payload's widget grid — so a project's home is this repo's to compose
 * rather than a widget a saved layout can drop or carry across projects.
 *
 * ⚠ Payload's own `DashboardView` renders this in `DefaultDashboard`'s slot, so
 * the route has already applied `DefaultTemplate` and `SetStepNav` — a second
 * template here would nest the whole admin chrome. `Gutter` is what the default
 * dashboard wraps its own content in. That slot is also where `beforeDashboard`
 * is rendered, so a custom view replaces that hook rather than composing with
 * it: anything it carried has to move into the branch below.
 */
export default function DashboardView({
  initPageResult,
  searchParams,
  user,
}: AdminViewServerProps) {
  const { cookies, locale, permissions, req } = initPageResult
  const choice = dashboardChoiceFor(req.user)

  let content: ReactNode
  switch (choice.kind) {
    case 'atlas-admin':
      content = <AtlasAdmin req={req} />
      break
    case 'atlas-manager':
      content = <AtlasManager req={req} searchParams={searchParams} />
      break
    case 'no-dashboard':
      content = (
        <CenteredNotice fullHeight title={getProjectLabel(choice.project)}>
          <p>This project does not have a dashboard yet. Use the sidebar to open its content.</p>
        </CenteredNotice>
      )
      break
    case 'select-project':
      content = <ProjectSelectionPrompt />
      break
    default:
      content = (
        <CollectionCards
          cookies={cookies}
          locale={locale}
          permissions={permissions}
          req={req}
          user={user}
          widgetSlug="collections"
        />
      )
  }

  return <Gutter className="dashboard">{content}</Gutter>
}
