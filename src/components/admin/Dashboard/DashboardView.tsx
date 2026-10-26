import type { AdminViewServerProps } from 'payload'
import type { ReactNode } from 'react'

import { Gutter } from '@payloadcms/ui'
import { CollectionCards } from '@payloadcms/ui/rsc'

import AtlasAdminHome from './AtlasAdminHome'
import AtlasDashboard from './AtlasDashboard'
import { dashboardChoiceFor } from './model'
import ProjectPlaceholder from './ProjectPlaceholder'
import ProjectSelectionPrompt from './ProjectSelectionPrompt'

/**
 * The admin homepage, registered as `admin.components.views.dashboard` in place
 * of Payload's widget grid — so a project's home is this repo's to compose
 * rather than a widget a saved layout can drop or carry across projects.
 *
 * `dashboardChoiceFor` owns which home a user gets.
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
      content = <AtlasAdminHome req={req} />
      break
    case 'atlas-manager':
      content = <AtlasDashboard req={req} searchParams={searchParams} />
      break
    case 'placeholder':
      content = <ProjectPlaceholder project={choice.project} />
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
