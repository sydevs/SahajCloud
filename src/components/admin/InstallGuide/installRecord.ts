import type { PayloadRequest } from 'payload'

import { cache } from 'react'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import { ownedHost } from '@/lib/clients/site'
import type { CanonicalVerification } from '@/lib/clients/verification'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

import { type Milestone, milestonesForRecord } from './installModel'

interface InstallRecord {
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
 * ⚠ **The gated read below is the gate, and it has to come first.** Both
 * callers are `ui` fields, so they render on every `form-state` request too —
 * and that request names its own `id`. `buildFormState` checks `canAccessAdmin`
 * and no document access, so without a read under the caller's own access any
 * manager could name any service and be handed its address, region and install
 * progress, one request per id (#1126). Gating here rather than at each caller
 * is what covers the next one.
 *
 * Wrapped in React's `cache`, so one request reads the row once however many of
 * them render — and so both count the same milestones.
 */
export const loadInstallRecord = cache(
  async (req: PayloadRequest, id: number): Promise<InstallRecord | null> => {
    const permitted = await req.payload.findByID({
      collection: 'clients',
      id,
      depth: 0,
      // The narrowest read that still runs access control. The value is unused.
      select: { enabled: true },
      overrideAccess: false,
      disableErrors: true,
      req,
    })
    if (!permitted) return null

    // Past the gate, `overrideAccess` so a field lock cannot blank a milestone
    // for a manager the row itself admits.
    const client = (await req.payload.findByID({
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
      req,
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
