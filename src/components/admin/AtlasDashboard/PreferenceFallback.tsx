import type { ServerProps } from 'payload'

import { headers } from 'next/headers'
import { createLocalReq } from 'payload'
import { PREFERENCE_KEYS } from 'payload/shared'

import { needsAtlasDashboardFallback } from './model'
import { isAtlasOrganiser } from '../helpers/isAtlasOrganiser'

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
    pagination: false,
    where: { key: { equals: PREFERENCE_KEYS.DASHBOARD_LAYOUT } },
  })
  const value = preferences.docs[0]?.value as { layouts?: { id?: string }[] } | undefined
  if (!needsAtlasDashboardFallback(value)) return null
  // The `user` prop has been through a field read, which flattens the per-locale
  // roles; access needs the user the auth strategies build (docs/rules/access.md).
  const { user: authUser } = await payload.auth({ headers: await headers() })
  if (!authUser) return null
  const accessReq = await createLocalReq({ user: authUser, locale: locale?.code }, payload)
  return <AtlasDashboardContent req={accessReq} />
}
