/**
 * Atlas sidebar view model — pure transforms (no Payload, no React).
 *
 * Turns the manager's events and owned-region subtree into the ordered event
 * list and nested region tree the sidebar renders. Kept free of I/O and JSX so
 * the bucket ordering and subtree-count rollup are unit-testable in isolation
 * (cf. `src/lib/status/groupView.ts`). The fetcher (`getAtlasSidebarData.ts`)
 * maps Payload docs onto these inputs; `StageIcon.tsx` maps buckets to glyphs.
 */

import type { VerificationStage } from '@/lib/eventVerification/stages'
import type { RegionLevel } from '@/lib/mapbox/geocoder'

// =============================================================================
// Events
// =============================================================================

/**
 * Display buckets for a manager's events, in the order they appear in the
 * sidebar (top → bottom). Distinct from the raw `verificationStage` enum:
 * `reminded`/`escalated` collapse into one "needs verification" bucket, and a
 * trashed event (any stage, `deletedAt` set) becomes its own bucket.
 */
export type EventBucket =
  | 'urgent'
  | 'needsVerification'
  | 'expired'
  | 'verified'
  | 'trashed'
  | 'finished'

/** Sidebar order: most-attention-needed first. */
export const EVENT_BUCKET_ORDER: readonly EventBucket[] = [
  'urgent',
  'needsVerification',
  'expired',
  'verified',
  'trashed',
  'finished',
]

/** Per-bucket text (the glyph + colour live in `StageIcon.tsx`). */
export const EVENT_BUCKET_META: Record<EventBucket, { label: string; tooltip: string }> = {
  urgent: { label: 'Urgent', tooltip: 'Urgent — verify now or it will be unpublished' },
  needsVerification: {
    label: 'Needs verification',
    tooltip: 'A verification reminder has been sent',
  },
  expired: { label: 'Expired', tooltip: 'Unpublished — recoverable for ~2 weeks, then trashed' },
  verified: { label: 'Verified', tooltip: 'Verified and published' },
  trashed: { label: 'Trashed', tooltip: 'Trashed — pending permanent deletion' },
  finished: { label: 'Finished', tooltip: 'The event schedule has ended' },
}

/** The event fields the bucketing/ordering needs. */
export interface SidebarEventInput {
  id: number
  title: string | null | undefined
  verificationStage: VerificationStage
  /** Trash marker — when set, the event is trashed regardless of its stage. */
  deletedAt?: string | null
  updatedAt: string | null | undefined
}

/** A bucketed, render-ready event entry. */
export interface SidebarEventItem {
  id: number
  title: string
  bucket: EventBucket
}

/**
 * Map an event to its display bucket. Trash wins over stage — a trashed event
 * is `expired` in practice, but belongs in the Trashed bucket — so `deletedAt`
 * is checked first.
 */
export function bucketForEvent(event: {
  verificationStage: VerificationStage
  deletedAt?: string | null
}): EventBucket {
  if (event.deletedAt) return 'trashed'
  switch (event.verificationStage) {
    case 'urgent':
      return 'urgent'
    case 'reminded':
    case 'escalated':
      return 'needsVerification'
    case 'expired':
      return 'expired'
    case 'finished':
      return 'finished'
    case 'verified':
    default:
      return 'verified'
  }
}

/** Untitled events still need a stable, clickable label. */
const UNTITLED_EVENT = '(untitled event)'

/**
 * Bucket, then order events by bucket (per `EVENT_BUCKET_ORDER`) and `updatedAt`
 * descending within each bucket. Stable for equal keys.
 */
export function sortEventsIntoBuckets(events: SidebarEventInput[]): SidebarEventItem[] {
  return events
    .map((event) => ({ event, bucket: bucketForEvent(event) }))
    .sort((a, b) => {
      const byBucket = EVENT_BUCKET_ORDER.indexOf(a.bucket) - EVENT_BUCKET_ORDER.indexOf(b.bucket)
      if (byBucket !== 0) return byBucket
      // updatedAt desc; missing timestamps sort last.
      return (b.event.updatedAt ?? '').localeCompare(a.event.updatedAt ?? '')
    })
    .map(({ event, bucket }) => ({
      id: event.id,
      title: event.title?.trim() || UNTITLED_EVENT,
      bucket,
    }))
}

// =============================================================================
// Regions
// =============================================================================

/**
 * A region's level in the geographic tree (Country → Region → City → Venue).
 *
 * Re-exported from the canonical union rather than redeclared. The import is
 * **type-only**, so it's erased at compile time and none of `geocoder.ts`'s
 * server-side Mapbox code reaches the client bundle this module feeds. Declaring
 * a second union here is what let the `center` → `venue` rename typecheck
 * cleanly while leaving stale values below — the failure only surfaced when the
 * unit lane ran.
 */
export type { RegionLevel }

/**
 * The level a node's direct child would have — the natural "add child" target
 * (Country → Region, Region → City, City → Venue). A Venue is a leaf, so it
 * has no child level. This is the inverse of the Regions collection's
 * `ALLOWED_PARENT_LEVELS`; a Country can technically also parent a City, but a
 * Region is the conventional next level down, so that's what "add child" offers.
 */
const CHILD_LEVEL: Record<RegionLevel, RegionLevel | null> = {
  country: 'region',
  region: 'city',
  city: 'venue',
  venue: null,
}

/** The level an "add child" action would create under a node of this level, if any. */
export function childLevelOf(level: RegionLevel): RegionLevel | null {
  return CHILD_LEVEL[level]
}

/**
 * Display label per level, matching the Regions collection's
 * `REGION_LEVEL_OPTIONS`. This one genuinely must be duplicated: the options
 * array is a runtime value inside a server collection config, so importing it
 * would drag that config (and its hooks, `serverEnv` and component paths) into
 * the client bundle. Keep the two in sync by hand.
 */
const REGION_LEVEL_LABEL: Record<RegionLevel, string> = {
  country: 'Country',
  region: 'Region',
  city: 'City',
  venue: 'Venue',
}

/** Human label for a region level (e.g. for an "add child" action/tooltip). */
export function regionLevelLabel(level: RegionLevel): string {
  return REGION_LEVEL_LABEL[level]
}

/**
 * Admin create-page URL for a new child region, pre-seeded with its parent +
 * level. `RegionCreatePrefill` reads the `parent` / `childLevel` params to seed
 * the form; both the Atlas sidebar "+" links and the Regions child-tab "New …"
 * buttons build it. `URLSearchParams` keeps the values encoded.
 */
export function buildRegionCreateUrl(parentId: number | string, childLevel: RegionLevel): string {
  const params = new URLSearchParams({ parent: String(parentId), childLevel })
  return `/admin/collections/regions/create?${params.toString()}`
}

/** The region fields the tree builder needs (from the owned-region subtree). */
export interface SidebarRegionInput {
  id: number
  name: string | null | undefined
  level: RegionLevel
  /** Direct parent id, or null at the top of the geographic tree. */
  parentId: number | null
  /** Ancestor ids from the nested-docs breadcrumb trail, excluding self. */
  ancestorIds: number[]
}

/** Published/total event counts summed over a region's entire subtree. */
export interface RegionCounts {
  published: number
  total: number
}

/** A node in the rendered region tree, counts already rolled up. */
export interface RegionTreeNode {
  id: number
  name: string
  level: RegionLevel
  counts: RegionCounts
  children: RegionTreeNode[]
}

/** The event fields the count rollup needs. */
export interface SidebarCountEventInput {
  /** The event's region id (must be within the subtree). */
  regionId: number
  /** Ancestor region ids of `regionId` (so the event rolls up the tree). */
  ancestorRegionIds: number[]
  /** `_status === 'published'` and not trashed. */
  published: boolean
  /** Not trashed and not `finished` — i.e. an active event the region "owns". */
  countsTowardTotal: boolean
}

const UNNAMED_REGION = '(unnamed region)'

/**
 * Roll event counts up the region tree: each event contributes to its own
 * region and every ancestor within the subtree, in a single pass over events
 * (no per-region recursive queries). Ancestors outside the subtree — above the
 * manager's owned roots — are ignored.
 */
export function rollUpRegionCounts(
  events: SidebarCountEventInput[],
  subtreeRegionIds: Set<number>,
): Map<number, RegionCounts> {
  const counts = new Map<number, RegionCounts>()
  const bump = (regionId: number, event: SidebarCountEventInput) => {
    if (!subtreeRegionIds.has(regionId)) return
    const current = counts.get(regionId) ?? { published: 0, total: 0 }
    if (event.published) current.published += 1
    if (event.countsTowardTotal) current.total += 1
    counts.set(regionId, current)
  }
  for (const event of events) {
    bump(event.regionId, event)
    for (const ancestorId of event.ancestorRegionIds) bump(ancestorId, event)
  }
  return counts
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name)
}

/**
 * Assemble the nested region tree from a flat subtree list. Display roots are
 * the regions whose parent is not itself in the subtree (the manager's
 * top-most owned regions); the rest nest under their parent. Each node carries
 * its subtree-summed counts (defaulting to zero when it owns no events).
 */
export function buildRegionTree(
  regions: SidebarRegionInput[],
  counts: Map<number, RegionCounts>,
): RegionTreeNode[] {
  const idSet = new Set(regions.map((region) => region.id))
  const childrenByParent = new Map<number, SidebarRegionInput[]>()
  const roots: SidebarRegionInput[] = []

  for (const region of regions) {
    if (region.parentId !== null && idSet.has(region.parentId)) {
      const siblings = childrenByParent.get(region.parentId) ?? []
      siblings.push(region)
      childrenByParent.set(region.parentId, siblings)
    } else {
      roots.push(region)
    }
  }

  const build = (region: SidebarRegionInput): RegionTreeNode => ({
    id: region.id,
    name: region.name?.trim() || UNNAMED_REGION,
    level: region.level,
    counts: counts.get(region.id) ?? { published: 0, total: 0 },
    children: (childrenByParent.get(region.id) ?? []).map(build).sort(byName),
  })

  return roots.map(build).sort(byName)
}

/** True when a node has any unpublished (expired) events in its subtree. */
export function hasUnpublished(counts: RegionCounts): boolean {
  return counts.published < counts.total
}

/**
 * Pill text: `published/total` when some events are unpublished, otherwise a
 * single number (all events are live, nothing to flag).
 */
export function regionPillLabel(counts: RegionCounts): string {
  return hasUnpublished(counts) ? `${counts.published}/${counts.total}` : String(counts.total)
}

/** Pill colour: `warning` when events are unpublished, else `success`. */
export function regionPillStyle(counts: RegionCounts): 'success' | 'warning' {
  return hasUnpublished(counts) ? 'warning' : 'success'
}

/** Tooltip for a region's published/total pill. */
export function regionPillTooltip(counts: RegionCounts): string {
  return hasUnpublished(counts)
    ? `${counts.total - counts.published} expired events`
    : 'All events are verified'
}
