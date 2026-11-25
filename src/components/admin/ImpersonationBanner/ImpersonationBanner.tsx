'use client'

import { useAuth } from '@payloadcms/ui'
import React, { useState } from 'react'

import { postAndReload } from '@/components/admin/helpers/postAndReload'
import { InfoBanner } from '@/components/admin/InfoBanner'
import { type GateUser, impersonatorOf } from '@/plugins/login/impersonation/gate'

/**
 * The bar across every admin page while support acts as a manager, with the
 * one way out. Registered in `admin.components.header` by
 * `loginPlugin`, so no view can forget it.
 */
export function ImpersonationBanner(): React.ReactElement | null {
  const { user } = useAuth<GateUser>()
  const [state, setState] = useState<'idle' | 'leaving' | 'failed'>('idle')
  if (!user || !impersonatorOf(user)) return null

  const exit = async () => {
    setState('leaving')
    const left = await postAndReload(
      '/api/managers/stop-impersonating',
      `/admin/collections/managers/${user.id}`,
    )
    // Still impersonating: navigating away would hide the one sign that says so.
    if (!left) setState('failed')
  }

  return (
    <InfoBanner
      action={{ label: 'Exit', onClick: () => void exit(), disabled: state === 'leaving' }}
      inline
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
