import type { UIFieldServerComponent } from 'payload'

import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'

import { installProgress } from './installModel'
import { loadInstallRecord } from './installRecord'

/**
 * A banner at the top of a service's edit form while its atlas install is not
 * finished, pointing at the Install tab. A `ui` field, so it shows on the edit
 * view alone; on the create screen there is no row yet, and nothing to install.
 *
 * Counts what the Install tab counts, so the banner goes exactly when the tab
 * says "Installation complete".
 */
const InstallBanner: UIFieldServerComponent = async ({ data, payload, req }) => {
  const id = (data as { id?: unknown } | undefined)?.id
  if (typeof id !== 'number') return null

  const record = await loadInstallRecord(req, id)
  if (!record?.atlas) return null
  const { done, total } = installProgress(record.milestones)
  if (done === total) return null

  const installUrl = formatAdminURL({
    adminRoute: payload.config.routes.admin,
    path: `/collections/clients/${id}/install`,
  })
  return (
    <InfoBanner
      action={<a href={installUrl}>Open the Install tab</a>}
      title="The atlas is not fully installed yet"
      type="warning"
    >
      {done} of {total} steps are done. The Install tab walks you through the rest.
    </InfoBanner>
  )
}

export default InstallBanner
