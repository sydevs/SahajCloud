import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { SetStepNav } from '@payloadcms/ui'

/**
 * Custom admin view (registered as `admin.components.views.map`) that
 * embeds the Sahaj Atlas map app full-height inside the default admin chrome.
 */
export default function AtlasMapView({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { req, visibleEntities, permissions, locale } = initPageResult
  const { payload } = req

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
      <SetStepNav nav={[{ label: 'Public Map' }]} />
      <iframe
        src={process.env.SAHAJATLAS_URL}
        style={{ width: '100%', height: 'calc(100dvh - 5.5rem)', border: 0, display: 'block' }}
        title="Sahaj Atlas Map"
      />
    </DefaultTemplate>
  )
}
