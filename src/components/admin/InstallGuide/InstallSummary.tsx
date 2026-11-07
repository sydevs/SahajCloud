import type { UIFieldServerComponent } from 'payload'

import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { SummaryCard } from '@/components/admin/SummaryCard'
import { primaryPageUrl } from '@/lib/clients/site'

import { InstallProgressBar } from './InstallProgress'
import { loadInstallRecord } from './installRecord'

/**
 * Where this service's atlas lives, read-only, at the top of the Atlas tab.
 *
 * The Install tab owns all of it — the address, the region's meaning, how far
 * the install has got — so this shows the answer and links there, rather than
 * offering a second place to change it. A server component, so it reads the row
 * itself: `site` is `admin.disabled`, which keeps it out of the form state a
 * client component would read.
 */
const InstallSummary: UIFieldServerComponent = async ({ data, payload }) => {
  const id = (data as { id?: unknown } | undefined)?.id
  if (typeof id !== 'number') return null

  const record = await loadInstallRecord(payload, id)
  if (!record) return null
  const { client, regionName, milestones } = record
  const installUrl = formatAdminURL({
    adminRoute: payload.config.routes.admin,
    path: `/collections/clients/${id}/install`,
  })

  return (
    <SummaryCard
      items={[
        { label: 'Embed location', value: primaryPageUrl(client.site) ?? 'Not set yet' },
        {
          label: 'Region',
          value: `${regionName ?? 'Worldwide'}${
            client.canonical?.owned
              ? regionName === null
                ? ' — classes in regions without a site of their own are linked to your website'
                : ' — all classes in this region are linked to your website'
              : ''
          }`,
        },
      ]}
      link={{ href: installUrl, label: 'Change these on the Install tab' }}
    >
      <InstallProgressBar milestones={milestones} />
    </SummaryCard>
  )
}

export default InstallSummary
