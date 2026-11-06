import type { UIFieldServerComponent } from 'payload'

import { formatAdminURL } from 'payload/shared'
import React from 'react'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import { primaryPageUrl } from '@/lib/clients/site'
import type { CanonicalVerification } from '@/lib/clients/verification'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

import styles from './InstallGuide.module.css'
import { milestonesForRecord } from './installModel'
import { InstallProgressBar } from './InstallProgress'

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

  const client = (await payload.findByID({
    collection: 'clients',
    id,
    depth: 1,
    select: { site: true, region: true, canonical: true, embedMetadata: true },
    overrideAccess: true,
    disableErrors: true,
  })) as Pick<Client, 'site' | 'region' | 'canonical' | 'embedMetadata'> | null
  if (!client) return null

  const regionName =
    relationId(client.region) == null
      ? null
      : client.region && typeof client.region === 'object'
        ? (client.region.name ?? 'Set')
        : 'Set'
  const milestones = milestonesForRecord({
    site: client.site,
    embedMetadata: (client.embedMetadata ?? null) as EmbedMetadata | null,
    verification: (client.canonical?.verification ?? null) as CanonicalVerification | null,
    owned: Boolean(client.canonical?.owned),
    regionName,
  })
  const installUrl = formatAdminURL({
    adminRoute: payload.config.routes.admin,
    path: `/collections/clients/${id}/install`,
  })

  return (
    <div className={styles.summary}>
      <dl className={styles.summaryList}>
        <dt>Embed location</dt>
        <dd>{primaryPageUrl(client.site) ?? 'Not set yet'}</dd>
        <dt>Region</dt>
        <dd>
          {regionName ?? 'Worldwide'}
          {client.canonical?.owned
            ? regionName === null
              ? ' — classes in regions without a site of their own are linked to your website'
              : ' — all classes in this region are linked to your website'
            : ''}
        </dd>
      </dl>
      <InstallProgressBar milestones={milestones} />
      <a className={styles.summaryLink} href={installUrl}>
        Change these on the Install tab
      </a>
    </div>
  )
}

export default InstallSummary
