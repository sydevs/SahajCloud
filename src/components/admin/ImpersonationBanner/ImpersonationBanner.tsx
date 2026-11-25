'use client'

import { useAuth } from '@payloadcms/ui'
import React, { useState } from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { type GateUser, impersonatorOf } from '@/plugins/login/impersonation/gate'

/**
 * The bar across every admin page while support acts as a manager, with the
 * one way out. Registered in `admin.components.header` by
 * `impersonationPlugin`, so no view can forget it.
 */
export function ImpersonationBanner(): React.ReactElement | null {
  const { user } = useAuth<GateUser>()
  const [state, setState] = useState<'idle' | 'leaving' | 'failed'>('idle')
  if (!user || !impersonatorOf(user)) return null

  const exit = async () => {
    setState('leaving')
    const response = await fetch('/api/managers/stop-impersonating', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => null)
    // Still impersonating: navigating away would hide the one sign that says so.
    if (!response?.ok) return setState('failed')
    // A full load, not a router push: the signed-in user changes, and the
    // auth provider and server-rendered nav must both start again from it.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/admin/collections/managers/${user.id}`)
  }

  return (
    <InfoBanner
      action={{ label: 'Exit', onClick: () => void exit(), disabled: state === 'leaving' }}
      title={`You are signed in as ${user.name || user.email}`}
      type="error"
    >
      {state === 'failed'
        ? 'Could not exit. You are still signed in as them — try again.'
        : 'Support impersonation. Everything you save is saved in their name.'}
    </InfoBanner>
  )
}

export default ImpersonationBanner
