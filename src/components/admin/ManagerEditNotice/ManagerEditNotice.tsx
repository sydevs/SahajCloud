'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { CONTACT_EMAIL } from '@/lib/contact'

/**
 * The head of a manager's page, for a reader who cannot save it: why the form
 * is read-only, and who to write to. `hasSavePermission` is Payload's own
 * per-document `update` answer, so it follows the rule in `accessPlugin`
 * rather than restating it.
 *
 * Non-admins reach another manager only through a document drawer — from an
 * event's or a region's manager picker — because `managers` is hidden from
 * them, and Payload answers a hidden collection's document route with a 404.
 */
export function ManagerEditNotice(): React.ReactElement | null {
  const { id, hasSavePermission } = useDocumentInfo()
  if (!id || hasSavePermission) return null

  return (
    <InfoBanner
      action={{ label: 'Email support', href: `mailto:${CONTACT_EMAIL}` }}
      title="You can’t edit this manager"
      type="warning"
    >
      Only an admin or the manager themself can edit a manager. If you need help, write to{' '}
      {CONTACT_EMAIL}.
    </InfoBanner>
  )
}

export default ManagerEditNotice
