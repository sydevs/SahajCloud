import type { PayloadRequest } from 'payload'

import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { InstallBannerNotice } from './InstallBannerNotice'
import { installComplete, installProgress } from './installModel'
import { loadInstallRecord } from './installRecord'

/**
 * A banner above a service's document views while its atlas install is not
 * finished, pointing at the Install tab.
 *
 * Registered as the collection's `Description`, the one slot Payload renders
 * under the document header on every document view — so it is also handed the
 * list view (no `id`), where it renders nothing, and the Install tab itself,
 * where `InstallBannerNotice` hides it.
 *
 * Counts what the Install tab counts (`milestonesForRecord`), so the banner goes
 * exactly when the tab says "Installation complete".
 */
export default async function InstallBanner(props: {
  id?: number | string
  payload: PayloadRequest['payload']
}): Promise<React.ReactElement | null> {
  const id = Number(props.id)
  if (!Number.isInteger(id)) return null

  const record = await loadInstallRecord(props.payload, id)
  if (!record?.atlas || installComplete(record.milestones)) return null

  const { done, total } = installProgress(record.milestones)
  return (
    <InstallBannerNotice
      done={done}
      installUrl={formatAdminURL({
        adminRoute: props.payload.config.routes.admin,
        path: `/collections/clients/${id}/install`,
      })}
      total={total}
    />
  )
}
