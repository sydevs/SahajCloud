import type { PayloadRequest } from 'payload'

import { formatAdminURL } from 'payload/shared'
import React from 'react'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import type { CanonicalVerification } from '@/lib/clients/verification'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

import { InstallBannerNotice } from './InstallBannerNotice'
import { installComplete, milestonesForRecord } from './installModel'

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

  const client = (await props.payload.findByID({
    collection: 'clients',
    id,
    depth: 1,
    select: { roles: true, site: true, region: true, canonical: true, embedMetadata: true },
    overrideAccess: true,
    disableErrors: true,
  })) as Pick<Client, 'roles' | 'site' | 'region' | 'canonical' | 'embedMetadata'> | null
  if (!client?.roles?.includes('sahaj-atlas-client')) return null

  const milestones = milestonesForRecord({
    site: client.site,
    embedMetadata: (client.embedMetadata ?? null) as EmbedMetadata | null,
    verification: (client.canonical?.verification ?? null) as CanonicalVerification | null,
    owned: Boolean(client.canonical?.owned),
    regionName:
      relationId(client.region) == null
        ? null
        : client.region && typeof client.region === 'object'
          ? (client.region.name ?? 'Set')
          : 'Set',
  })
  if (installComplete(milestones)) return null

  const counted = milestones.filter((milestone) => milestone.state !== 'na')
  return (
    <InstallBannerNotice
      done={counted.filter((milestone) => milestone.state === 'done').length}
      installUrl={formatAdminURL({
        adminRoute: props.payload.config.routes.admin,
        path: `/collections/clients/${id}/install`,
      })}
      total={counted.length}
    />
  )
}
