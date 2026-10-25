import type { AdminViewServerProps } from 'payload'
import type { ReactNode } from 'react'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { CollectionCards } from '@payloadcms/ui/rsc'

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
 */
export default function DashboardView({
  initPageResult,
  params,
  searchParams,
  user,
}: AdminViewServerProps) {
  const { cookies, locale, permissions, req, visibleEntities } = initPageResult
  const { payload } = req
  const choice = dashboardChoiceFor(req.user)

  let content: ReactNode
  switch (choice.kind) {
    case 'atlas':
      content = <AtlasDashboard req={req} />
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

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      {content}
    </DefaultTemplate>
  )
}
