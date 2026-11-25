'use client'

import { useAuth, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React, { useState } from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { type GateUser, isSupportAccount, mayImpersonate } from '@/plugins/impersonation/gate'

/**
 * "Sign in as this manager", on a manager's page — for the support account
 * alone, and only on a manager it may become. The server repeats both checks
 * (`POST /api/managers/impersonate/:id`); this only keeps the control off
 * pages where it could answer nothing but a refusal.
 */
export function ImpersonateButton(): React.ReactElement | null {
  const { user } = useAuth<GateUser>()
  const { id } = useDocumentInfo()
  const target = useFormFields(([fields]) => ({
    _verified: fields._verified?.value as boolean | undefined,
    type: fields.type?.value as string | undefined,
  }))
  const [state, setState] = useState<'idle' | 'starting' | 'failed'>('idle')

  if (!id || !isSupportAccount(user) || !mayImpersonate(target)) return null

  const start = async () => {
    setState('starting')
    const response = await fetch(`/api/managers/impersonate/${id}`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => null)
    if (!response?.ok) return setState('failed')
    // A full load, not a router push: the signed-in user changes, and the
    // auth provider and server-rendered nav must both start again from it.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/admin')
  }

  return (
    <InfoBanner
      action={{
        label: 'Sign in as this manager',
        onClick: () => void start(),
        disabled: state === 'starting',
      }}
      title="Debug their access"
      type={state === 'failed' ? 'error' : 'default'}
    >
      {state === 'failed'
        ? 'Could not sign in as this manager. Try again.'
        : 'See the admin exactly as they do. Anything you save is saved in their name, until you exit.'}
    </InfoBanner>
  )
}

export default ImpersonateButton
