import type { Payload } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

/**
 * Backfill `breadcrumbs[].url` on existing regions (#634).
 *
 * The nested-docs plugin writes `url` only when the config supplies
 * `generateURL`, and only **on write** — so enabling it leaves every existing
 * row's `url` null until something re-saves them. Without this, the
 * `where[breadcrumbs.url][equals]='/nl/amsterdam'` lookup resolves nothing.
 *
 * ## Roots only, on purpose
 *
 * `resaveChildren` fires on *every* region write and recursively re-saves the
 * whole subtree beneath it. So re-saving each of the ~595 regions individually
 * would re-save every region once per ancestor it has — the same work several
 * times over. Re-saving only the roots visits each region exactly once, driven
 * by the plugin's own cascade, which is also the machinery that keeps
 * breadcrumbs correct in normal operation.
 *
 * "Root" here means *anything the cascade has to be started from*, which
 * includes orphans as well as true roots — see the filter below.
 *
 * The write is an **empty patch**: it changes no field, and exists purely to
 * make the beforeChange hook recompute breadcrumbs from `{...originalDoc}`.
 * That also means it can't trip `withNonEmptySlug` on the root itself.
 *
 * Re-runnable — `url` is a pure function of the ancestor slug chain.
 */

export interface BreadcrumbBackfillStats {
  /** Regions inspected. */
  scanned: number
  /** Regions missing at least one breadcrumb `url` before the run. */
  missing: number
  /** Root regions re-saved (each cascading through its subtree). */
  resaved: number
  /** Regions still missing a `url` after the run — 0 unless a slug is blank. */
  remaining: number
  /** Root re-saves that threw. */
  failed: number
}

interface RegionRow {
  id: number
  slug?: string | null
  parent?: unknown
  breadcrumbs?: Array<{ url?: string | null }> | null
}

/** A region whose stored trail has a gap the lookup would miss. */
function isMissingUrl(row: RegionRow): boolean {
  const crumbs = row.breadcrumbs
  if (!Array.isArray(crumbs) || crumbs.length === 0) return true
  return crumbs.some((crumb) => typeof crumb?.url !== 'string' || crumb.url.length === 0)
}

async function loadRegions(payload: Payload): Promise<RegionRow[]> {
  const { docs } = await payload.find({
    collection: 'regions',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    // Same rule as the path resolver: an unselected field returns before its
    // afterRead hook runs, so this can't recurse into webPath/webUrl.
    select: { slug: true, parent: true, breadcrumbs: true },
  })
  return docs as RegionRow[]
}

export async function backfillBreadcrumbUrls({
  payload,
  apply,
  onProgress,
}: {
  payload: Payload
  apply: boolean
  onProgress?: (event: { id: number; error?: string }) => void
}): Promise<BreadcrumbBackfillStats> {
  const rows = await loadRegions(payload)
  const missing = rows.filter(isMissingUrl)

  // Every region the cascade has to be started from. `parent == null` is the
  // whole set: a region can't be stranded holding a dangling parent id, because
  // `regions_parent_id_regions_id_fk` is ON DELETE **set null** — deleting a
  // parent turns its children into roots rather than orphaning them, so they
  // are picked up here. Pinned by a test, since the strategy depends on it.
  const roots = rows.filter((row) => relationId(row.parent) === null)

  if (!apply) {
    return {
      scanned: rows.length,
      missing: missing.length,
      resaved: roots.length,
      remaining: missing.length,
      failed: 0,
    }
  }

  let failed = 0
  // Sequential on purpose. Each root's write cascades recursively through its
  // whole subtree, so running the roots concurrently multiplies out into many
  // concurrent writes — enough to exhaust the connection pool on a tree this
  // shape. This is a one-off operator script; the wall-clock saving would not
  // pay for that risk.
  for (const root of roots) {
    try {
      await payload.update({
        collection: 'regions',
        id: root.id,
        data: {},
        depth: 0,
        overrideAccess: true,
      })
      onProgress?.({ id: root.id })
    } catch (error) {
      failed += 1
      onProgress?.({ id: root.id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  const after = await loadRegions(payload)
  return {
    scanned: rows.length,
    missing: missing.length,
    resaved: roots.length - failed,
    remaining: after.filter(isMissingUrl).length,
    failed,
  }
}
