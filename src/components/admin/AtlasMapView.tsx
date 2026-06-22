import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { SetStepNav } from '@payloadcms/ui'

/** The standalone Sahaj Atlas map app, embedded in the admin. */
const ATLAS_MAP_URL = 'https://atlasreact.sydevelopers.com'

/**
 * Custom admin view (registered as `admin.components.views.atlasMap`) that
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
      <SetStepNav nav={[{ label: 'Atlas Map' }]} />
      <iframe
        src={ATLAS_MAP_URL}
        style={{ width: '100%', height: 'calc(100dvh - 5.5rem)', border: 0, display: 'block' }}
        title="Atlas Map"
      />
    </DefaultTemplate>
  )
}
