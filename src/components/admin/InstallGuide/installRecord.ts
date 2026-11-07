import type { Payload } from 'payload'

import { cache } from 'react'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import { ownedHost } from '@/lib/clients/site'
import type { CanonicalVerification } from '@/lib/clients/verification'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

import { type Milestone, milestonesForRecord } from './installModel'

export interface InstallRecord {
  client: Pick<Client, 'roles' | 'enabled' | 'site' | 'region' | 'canonical' | 'embedMetadata'>
  /** Whether the service has the atlas role, and so an install at all. */
  atlas: boolean
  /** Whether its site is the home for its region's links right now (`ownedHost`). */
  owned: boolean
  /** The region's name, `'Set'` when it cannot be read, `null` for a worldwide map. */
  regionName: string | null
  milestones: Milestone[]
}

/**
 * A service's install, off its stored row, for the server components that show
 * it outside the Install tab: the edit form's banner and the Atlas tab's summary.
 *
 * Wrapped in React's `cache`, so one request reads the row once however many of
 * them render — and so both count the same milestones.
 */
export const loadInstallRecord = cache(
  async (payload: Payload, id: number): Promise<InstallRecord | null> => {
    const client = (await payload.findByID({
      collection: 'clients',
      id,
      depth: 1,
      select: {
        roles: true,
        enabled: true,
        site: true,
        region: true,
        canonical: true,
        embedMetadata: true,
      },
      populate: { regions: { name: true } },
      overrideAccess: true,
      disableErrors: true,
    })) as InstallRecord['client'] | null
    if (!client) return null

    const regionName =
      relationId(client.region) == null
        ? null
        : client.region && typeof client.region === 'object'
          ? (client.region.name ?? 'Set')
          : 'Set'
    const owned = ownedHost(client) !== null
    return {
      client,
      atlas: Boolean(client.roles?.includes('sahaj-atlas-client')),
      owned,
      regionName,
      milestones: milestonesForRecord({
        site: client.site,
        embedMetadata: (client.embedMetadata ?? null) as EmbedMetadata | null,
        verification: (client.canonical?.verification ?? null) as CanonicalVerification | null,
        owned,
        regionName,
      }),
    }
  },
)
