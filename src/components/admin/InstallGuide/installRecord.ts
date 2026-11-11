import type { PayloadRequest } from 'payload'

import { cache } from 'react'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import { ownedHost } from '@/lib/clients/site'
import type { CanonicalVerification } from '@/lib/clients/verification'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

import { type Milestone, milestonesForRecord } from './installModel'
import { gatedRead } from '../helpers/gatedRead'

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
 * ⚠ **The gated read is the gate, and it has to come first.** A `form-state`
 * request names its own `id` past nothing but `canAccessAdmin`, so without a
 * read under the caller's own access any manager is handed any service's
 * address, region and install progress (#1126, `docs/rules/admin-ui.md`).
 * Gating here rather than at each caller is what covers the next one.
 *
 * Wrapped in React's `cache`, so one request reads the row once however many of
 * them render — and so both count the same milestones. ⚠ The key is the
 * caller's own `req`: copying it here would miss the memo on every call.
 */
export const loadInstallRecord = cache(
  async (req: PayloadRequest, id: number): Promise<InstallRecord | null> => {
    // Value unused: this read is the access check.
    const permitted = await gatedRead(req, 'clients', id, { enabled: true })
    if (!permitted) return null

    // Past the gate, `overrideAccess` so the summary reads the same for every
    // caller the row admits — including one whose roles do not reach `regions`,
    // where the populate below would otherwise degrade to a bare id.
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
      req: localeIsolatedReq(req),
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
