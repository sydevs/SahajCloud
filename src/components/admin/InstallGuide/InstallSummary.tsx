import type { UIFieldServerComponent } from 'payload'

import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { primaryPageUrl } from '@/lib/clients/site'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

import styles from './InstallGuide.module.css'

/**
 * Where this service's atlas lives, read-only, at the top of the Atlas tab.
 *
 * The Install tab owns all of it — the address, the region's meaning, whether the
 * page is confirmed — so this shows the answer and links there, rather than
 * offering a second place to change it. A server component, so it reads the row
 * itself: `site` is `admin.disabled`, which keeps it out of the form state a
 * client component would read.
 */
const InstallSummary: UIFieldServerComponent = async ({ data, payload }) => {
  const id = (data as { id?: unknown } | undefined)?.id
  if (typeof id !== 'number') return null

  const client = (await payload.findByID({
    collection: 'clients',
    id,
    depth: 1,
    select: { site: true, region: true, canonical: true },
    overrideAccess: true,
    disableErrors: true,
  })) as Pick<Client, 'site' | 'region' | 'canonical'> | null
  if (!client) return null

  const page = primaryPageUrl(client.site)
  const region = client.region && typeof client.region === 'object' ? client.region.name : null
  const confirmed = Boolean(client.canonical?.verification?.verified)
  const installUrl = formatAdminURL({
    adminRoute: payload.config.routes.admin,
    path: `/collections/clients/${id}/install`,
  })

  return (
    <div className={styles.summary}>
      <dl className={styles.summaryList}>
        <dt>Atlas address</dt>
        <dd>{page ?? 'Not set yet'}</dd>
        <dt>Region</dt>
        <dd>
          {relationId(client.region) == null ? 'Worldwide' : (region ?? 'Set')}
          {client.canonical?.owned ? ' — your site is the home for its atlas links' : ''}
        </dd>
        <dt>Install</dt>
        <dd>{confirmed ? 'Confirmed' : 'Not confirmed yet'}</dd>
      </dl>
      <a href={installUrl}>Change these on the Install tab</a>
    </div>
  )
}

export default InstallSummary
