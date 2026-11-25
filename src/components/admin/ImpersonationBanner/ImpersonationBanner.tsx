'use client'

import { useAuth } from '@payloadcms/ui'
import React, { useState } from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { type GateUser, impersonatorOf } from '@/plugins/impersonation/gate'

type BannerUser = GateUser & { name?: string | null }

/**
 * The bar across every admin page while support acts as a manager, with the
 * one way out. Registered in `admin.components.header` by
 * `impersonationPlugin`, so no view can forget it.
 */
export function ImpersonationBanner(): React.ReactElement | null {
  const { user } = useAuth<BannerUser>()
  const [leaving, setLeaving] = useState(false)
  if (!impersonatorOf(user)) return null

  const exit = async () => {
    setLeaving(true)
    await fetch('/api/managers/stop-impersonating', { method: 'POST', credentials: 'include' })
    // A full load, not a router push: the signed-in user changes, and the
    // auth provider and server-rendered nav must both start again from it.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/admin/collections/managers/${user!.id}`)
  }

  return (
    <InfoBanner
      action={{ label: 'Exit', onClick: () => void exit(), disabled: leaving }}
      title={`You are signed in as ${user!.name || user!.email}`}
      type="error"
    >
      Support impersonation. Everything you save is saved in their name.
    </InfoBanner>
  )
}

export default ImpersonationBanner
