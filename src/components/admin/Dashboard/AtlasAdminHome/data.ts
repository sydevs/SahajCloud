import type { PayloadRequest, Where } from 'payload'

import { stringify } from 'qs-esm'

import { OPEN_REVIEW_STATUSES } from '@/collections/UserSubmissions/statuses'
import type { VerificationStage } from '@/lib/eventVerification/stages'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import type { Event } from '@/payload-types'

/** One count on the overview, and the list view that shows its rows. */
export type OverviewCount = { label: string; count: number; href: string }

export type RecentProgram = Pick<
  Event,
  'id' | 'title' | '_status' | 'verificationStage' | 'updatedAt'
> & {
  regionName: string | null
}

export type AtlasOverviewData = {
  health: (OverviewCount & { stage: VerificationStage })[]
  unowned: OverviewCount[]
  proposals: OverviewCount
  recent: RecentProgram[]
}

/** The verification ladder, in the order a program climbs it. */
const HEALTH_STAGES: { stage: VerificationStage; label: string }[] = [
  { stage: 'verified', label: 'Verified' },
  { stage: 'reminded', label: 'Reminded' },
  { stage: 'escalated', label: 'Escalated' },
  { stage: 'urgent', label: 'Urgent' },
  { stage: 'expired', label: 'Expired' },
]

const UNADOPTED: Where = {
  and: [{ verificationStage: { equals: 'unverified' } }, { manager: { exists: false } }],
}
const UNMANAGED_REGIONS: Where = { managers: { exists: false } }
const OPEN_PROPOSALS: Where = {
  and: [{ type: { equals: 'proposal' } }, { status: { in: [...OPEN_REVIEW_STATUSES] } }],
}

/** A list view filtered to `where` — the overview counts, Payload's own list browses. */
export function listHref(collection: string, where: Where): string {
  return `/admin/collections/${collection}${stringify({ where }, { addQueryPrefix: true })}`
}

/**
 * The admin's view of the whole map. Every count is a list-view filter, so an
 * admin follows one straight into the rows behind it.
 */
export async function getAtlasOverviewData(req: PayloadRequest): Promise<AtlasOverviewData> {
  // Concurrent reads on one req must not share it (src/collections/AGENTS.md).
  const count = (collection: 'events' | 'regions' | 'user-submissions', where: Where) =>
    req.payload
      .count({ collection, where, overrideAccess: false, req: localeIsolatedReq(req) })
      .then((result) => result.totalDocs)

  const [health, unadopted, unmanagedRegions, proposals, recent] = await Promise.all([
    Promise.all(
      HEALTH_STAGES.map(async ({ stage, label }) => {
        const where: Where = { verificationStage: { equals: stage } }
        return {
          stage,
          label,
          count: await count('events', where),
          href: listHref('events', where),
        }
      }),
    ),
    count('events', UNADOPTED),
    count('regions', UNMANAGED_REGIONS),
    count('user-submissions', OPEN_PROPOSALS),
    req.payload.find({
      collection: 'events',
      overrideAccess: false,
      req: localeIsolatedReq(req),
      draft: true,
      depth: 1,
      limit: 10,
      sort: '-updatedAt',
      locale: req.locale,
      select: {
        title: true,
        _status: true,
        verificationStage: true,
        updatedAt: true,
        region: true,
      },
      populate: { regions: { name: true } },
    }),
  ])

  return {
    health,
    unowned: [
      { label: 'Imported, not adopted', count: unadopted, href: listHref('events', UNADOPTED) },
      {
        label: 'Regions with no manager',
        count: unmanagedRegions,
        href: listHref('regions', UNMANAGED_REGIONS),
      },
    ],
    proposals: {
      label: 'Awaiting review',
      count: proposals,
      href: listHref('user-submissions', OPEN_PROPOSALS),
    },
    recent: recent.docs.map((event) => ({
      id: event.id,
      title: event.title,
      _status: event._status,
      verificationStage: event.verificationStage,
      updatedAt: event.updatedAt,
      regionName: typeof event.region === 'object' ? (event.region?.name ?? null) : null,
    })),
  }
}
