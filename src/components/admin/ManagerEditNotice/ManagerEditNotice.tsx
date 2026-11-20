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
 * ⚠ Mounted as `Managers`' `admin.components.Description`, which Payload draws
 * at the top of a document drawer and not on the full-page edit view. The
 * drawer is the one place a non-admin opens another manager — from an event's
 * or a region's manager picker — because `managers` is hidden from them, and
 * Payload answers a hidden collection's document route with a 404. The list
 * view draws the slot too, outside any document, where `id` is absent.
 */
export function ManagerEditNotice(): React.ReactElement | null {
  const { id, hasSavePermission } = useDocumentInfo()
  if (!id || hasSavePermission) return null

  return (
    <InfoBanner
      action={{ label: 'Email support', href: `mailto:${CONTACT_EMAIL}` }}
      title="You can’t edit this manager"
    >
      An admin, or the manager themself, can make this change.
    </InfoBanner>
  )
}

export default ManagerEditNotice
