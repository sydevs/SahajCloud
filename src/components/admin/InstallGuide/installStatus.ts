import type { Milestone } from './installModel'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import type { CanonicalVerification } from '@/lib/clients/verification'
import type { Client } from '@/payload-types'

import { buildInstallModel, buildMilestones } from './installModel'
import { PLATFORM_LABELS, platformOf, tracksFor } from './steps'

/**
 * The Install tab's progress, from a service's stored record alone.
 *
 * For the places that show how far an install has got without being the
 * Install tab — the banner above the edit view and the Atlas tab's summary — so
 * all three count the same milestones the same way. Everything the tab adds on
 * top (an address still being typed, a check in flight) is this visit's, and
 * not here.
 */
export function milestonesForRecord(args: {
  site: Client['site'] | null | undefined
  embedMetadata: EmbedMetadata | null | undefined
  verification: CanonicalVerification | null | undefined
  owned: boolean
  /** `null` for a worldwide map. */
  regionName: string | null
}): Milestone[] {
  const { site, embedMetadata, verification, owned, regionName } = args
  const page = site?.page ?? null
  // The tracks only need a path to describe their steps; their flags are what is read here.
  const path = page ?? '/classes'
  const track = site?.track
    ? tracksFor({ apiKey: '', prefix: path.slice(1), atlasUrl: path, cmsUrl: '', widgetUrl: '' })[
        site.track
      ]
    : null

  const model = buildInstallModel({
    embedMetadata,
    verification,
    atlasUrl: page,
    track,
    host: site?.domain,
  })
  return buildMilestones({
    model,
    verification,
    owned,
    searchListings: track?.searchListings !== false,
    classAddresses: track?.classAddresses !== false,
    siteKind: track ? PLATFORM_LABELS[platformOf(track.id)] : undefined,
    regionName,
    host: site?.domain,
  })
}

/** Whether every milestone a site can reach is done — the "Installation complete" of the Install tab. */
export function installComplete(milestones: Milestone[]): boolean {
  return milestones.every((milestone) => milestone.state === 'done' || milestone.state === 'na')
}
