import type { ServerProps } from 'payload'

import { createLocalReq } from 'payload'
import { PREFERENCE_KEYS } from 'payload/shared'

import { isAtlasOrganiser, needsAtlasDashboardFallback } from './model'

import { AtlasDashboardContent } from './index'

/** Saved layouts predate this widget and also survive project switches. */
export default async function PreferenceFallback({ payload, user, locale }: ServerProps) {
  if (!isAtlasOrganiser(user)) return null
  const req = await createLocalReq({ user, locale: locale?.code }, payload)
  const preferences = await payload.find({
    collection: 'payload-preferences',
    req,
    overrideAccess: false,
    depth: 0,
    limit: 1,
    where: { key: { equals: PREFERENCE_KEYS.DASHBOARD_LAYOUT } },
  })
  const value = preferences.docs[0]?.value as { layouts?: { id?: string }[] } | undefined
  if (!needsAtlasDashboardFallback(value)) return null
  return <AtlasDashboardContent req={req} />
}
