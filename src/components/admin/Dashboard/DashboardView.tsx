import type { AdminViewServerProps, PayloadRequest } from 'payload'
import type { ReactNode } from 'react'

import { Gutter } from '@payloadcms/ui'
import { CollectionCards } from '@payloadcms/ui/rsc'

import { managerRoles } from '@/lib/notifications/managerRoles'
import type { ProjectSlug } from '@/payload-types'
import { isAdminManager, isManager } from '@/plugins/access/adminOnly'
import { getProjectLabel, resolveProject } from '@/plugins/access/config'

import AtlasAdmin from './AtlasAdmin'
import AtlasManager from './AtlasManager'
import AtlasRegion from './AtlasRegion'
import { CenteredNotice } from '../CenteredNotice'
import ProjectSelectionPrompt from './ProjectSelectionPrompt'
import { parseDashboardQuery } from './shared/model'

/** `no-dashboard` carries its project, so the view needs no second read of it. */
type DashboardChoice =
  | { kind: 'atlas-admin' }
  | { kind: 'atlas-manager' }
  | { kind: 'atlas-region' }
  | { kind: 'collections' }
  | { kind: 'no-dashboard'; project: ProjectSlug }
  | { kind: 'select-project' }

/**
 * Which dashboard the view renders, for the project `resolveProject` places
 * the user in — the answer the browser acts on too. `currentProject: null` is
 * the admin "All Content" view (`Managers.ts`), which keeps Payload's cards.
 *
 * ⚠ **Sahaj Atlas has three homes, and the widest role wins.** The region home
 * carries a manager's own programs under "Your events"; the program home
 * carries nothing of the region.
 */
export function dashboardChoiceFor(user: PayloadRequest['user'] | undefined): DashboardChoice {
  if (user?.collection !== 'managers') return { kind: 'collections' }
  const { project } = resolveProject(user)
  if (!project) return isManager(user) ? { kind: 'select-project' } : { kind: 'collections' }
  if (project === 'sahaj-atlas') {
    if (isAdminManager(user)) return { kind: 'atlas-admin' }
    const roles = managerRoles(user)
    if (roles.includes('region')) return { kind: 'atlas-region' }
    return { kind: 'atlas-manager' }
  }
  return { kind: 'no-dashboard', project }
}

/**
 * The admin homepage, in place of Payload's widget grid, which a saved layout
 * could drop or carry across projects.
 *
 * ⚠ Payload renders this in `DefaultDashboard`'s slot, after `DefaultTemplate`
 * and `SetStepNav`, so a second template here would nest the admin chrome. The
 * slot is also where `beforeDashboard` renders, so this view replaces that hook.
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
      // An admin following a row into a region reads that region's home.
      content =
        parseDashboardQuery(searchParams).region > 0 ? (
          <AtlasRegion req={req} searchParams={searchParams} />
        ) : (
          <AtlasAdmin req={req} searchParams={searchParams} />
        )
      break
    case 'atlas-manager':
      content = <AtlasManager req={req} searchParams={searchParams} />
      break
    case 'atlas-region':
      content = <AtlasRegion req={req} searchParams={searchParams} />
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
