'use client'

import { useAuth, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React, { useState } from 'react'

import { postAndReload } from '@/components/admin/helpers/postAndReload'
import { InfoBanner } from '@/components/admin/InfoBanner'
import type { Manager } from '@/payload-types'
import {
  type GateUser,
  isSupportAccount,
  mayBeImpersonated,
} from '@/plugins/login/impersonation/gate'

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
    type: fields.type?.value as Manager['type'] | undefined,
  }))
  const [state, setState] = useState<'idle' | 'starting' | 'failed'>('idle')

  if (!id || !isSupportAccount(user) || !mayBeImpersonated(target)) return null

  const start = async () => {
    setState('starting')
    if (!(await postAndReload(`/api/managers/impersonate/${id}`, '/admin'))) setState('failed')
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
