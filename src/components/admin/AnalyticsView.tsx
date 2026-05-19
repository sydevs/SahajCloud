import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'

import type { Manager } from '@/payload-types'

import FathomDashboard from './Dashboard/FathomDashboard'

export default function AnalyticsView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, visibleEntities, permissions, locale } = initPageResult
  const { payload } = req
  const user = req.user as Manager | null
  const currentProject = user?.currentProject

  let content: React.ReactNode

  switch (currentProject) {
    case 'wemeditate-web':
      content = (
        <FathomDashboard
          siteId="pfpcdamq"
          siteName="we+meditate"
          title="We Meditate Web Analytics"
        />
      )
      break
    case 'sahaj-atlas':
      content = (
        <FathomDashboard
          siteId="qqwctiuv"
          siteName="sahaj+atlas"
          title="Sahaj Atlas Analytics"
        />
      )
      break
    default:
      content = (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: 'var(--base)',
          }}
        >
          <div
            style={{
              maxWidth: '500px',
              textAlign: 'center',
              background: 'var(--theme-elevation-50)',
              padding: 'calc(var(--base) * 2.5)',
              borderRadius: 'var(--style-radius-m)',
              border: '1px solid var(--theme-elevation-200)',
            }}
          >
            <p
              style={{
                fontSize: 'calc(var(--base-body-size) * 1.15px)',
                color: 'var(--theme-elevation-600)',
                margin: 0,
              }}
            >
              No analytics available for the current project.
            </p>
          </div>
        </div>
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
