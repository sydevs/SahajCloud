/** The Regions and Countries overviews: every number rolled up over a region's whole subtree. */

import { getRegionTree } from '@/lib/atlas/regionTree'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import type { Region } from '@/payload-types'

import { type OverviewArgs, scopeRegionIds } from './scope'
import { loadSignupWindows } from './statistics'
import { isProgramStage, OVERDUE_QUERY_STAGES } from './status'

export interface RegionOverviewRow {
  id: number
  name: string
  level: Region['level']
  /** Managers listed on this region or any below it; `first` is one of the region's own when it has one. */
  managers: { count: number; first: null | string }
  /** Events that are not finished. */
  programs: number
  /** Managed and not overdue, over programs — whole per cent, `null` with no programs. */
  healthy: null | number
  overdue: number
  unverified: number
  /** Sign-ups in the last 30 days, and the change on the 30 before that. */
  signups: { change: number; last30: number }
}

/**
 * Both overviews, ordered. `countriesOnly` is the admin's view: a country is
 * where an ancestor's cover runs out.
 */
export async function loadRegionOverview(
  // ⚠ No `overrideAccess`: a subtree roll-up read under a reader's grants would
  // silently undercount, so every read here overrides and `scopeRegionIds` bounds it.
  args: Omit<OverviewArgs, 'overrideAccess'> & { countriesOnly?: boolean },
): Promise<RegionOverviewRow[]> {
  const { now, req, scope } = args
  const tree = await getRegionTree(req)
  const scoped = await scopeRegionIds(req, scope, tree)
  const inScope = scoped ?? new Set(tree.chainById.keys())
  /** A region and its ancestors inside the scope; ⚠ the scope gates the roll-up, not the item. */
  const upChain = (regionId: number) =>
    [...new Set([regionId, ...(tree.chainById.get(regionId) ?? [])])].filter((id) =>
      inScope.has(id),
    )

  // ⚠ Narrowed to the scope: a subtree is closed downwards, so nothing excluded could roll up into it.
  const narrow = scoped ? [...scoped] : null
  const managerIds = [...new Set([...inScope].flatMap((id) => tree.managersById.get(id) ?? []))]
  const [events, signups, managerDocs] = await Promise.all([
    req.payload.find({
      collection: 'events',
      where: narrow ? { region: { in: narrow } } : {},
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req: localeIsolatedReq(req),
      select: { manager: true, region: true, verificationStage: true },
    }),
    loadSignupWindows({
      extraWhere: narrow ? [{ 'event.region': { in: narrow } }] : [],
      now,
      req,
    }),
    managerIds.length
      ? req.payload.find({
          collection: 'managers',
          where: { id: { in: managerIds } },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req: localeIsolatedReq(req),
          select: { name: true },
        })
      : { docs: [] },
  ])
  const managerName = new Map(managerDocs.docs.map((doc) => [doc.id, doc.name]))

  const empty = () => ({
    healthy: 0,
    overdue: 0,
    programs: 0,
    signupsNow: 0,
    signupsPrevious: 0,
    unverified: 0,
  })
  const metrics = new Map<number, ReturnType<typeof empty>>()
  for (const event of events.docs) {
    const regionId = relationId(event.region)
    if (regionId === null) continue
    const stage = event.verificationStage
    const overdue = (OVERDUE_QUERY_STAGES as readonly string[]).includes(stage)
    const window = signups.get(event.id)
    for (const id of upChain(regionId)) {
      const row = metrics.get(id) ?? empty()
      if (isProgramStage(stage)) {
        row.programs += 1
        if (relationId(event.manager) !== null && !overdue) row.healthy += 1
      }
      if (overdue) row.overdue += 1
      if (stage === 'unverified') row.unverified += 1
      row.signupsNow += window?.now ?? 0
      row.signupsPrevious += window?.previous ?? 0
      metrics.set(id, row)
    }
  }

  // ⚠ Out-of-scope regions are dropped, not just gated: their managers must not reach an in-scope ancestor.
  const managers = new Map<number, Set<number>>()
  for (const regionId of inScope) {
    for (const id of upChain(regionId)) {
      const set = managers.get(id) ?? new Set<number>()
      for (const managerId of tree.managersById.get(regionId) ?? []) set.add(managerId)
      managers.set(id, set)
    }
  }

  const rows: RegionOverviewRow[] = []
  for (const id of inScope) {
    const level = tree.levelById.get(id)
    if (!level || (args.countriesOnly && level !== 'country')) continue
    const row = metrics.get(id) ?? empty()
    const listed = [...new Set([...(tree.managersById.get(id) ?? []), ...(managers.get(id) ?? [])])]
    rows.push({
      id,
      name: tree.nameById.get(id)?.trim() || `#${id}`,
      level,
      managers: {
        count: listed.length,
        first: listed.length ? managerName.get(listed[0]!)?.trim() || 'Unnamed manager' : null,
      },
      programs: row.programs,
      healthy: row.programs > 0 ? Math.round((row.healthy / row.programs) * 100) : null,
      overdue: row.overdue,
      unverified: row.unverified,
      signups: { change: row.signupsNow - row.signupsPrevious, last30: row.signupsNow },
    })
  }

  // Least healthy first, then those with no manager of their own.
  // ⚠ `healthy: null` sorts last: an empty region is not an unhealthy one.
  const managerless = (row: RegionOverviewRow) => !tree.managersById.get(row.id)?.length
  return rows.sort(
    (a, b) =>
      (a.healthy ?? 101) - (b.healthy ?? 101) ||
      Number(managerless(b)) - Number(managerless(a)) ||
      a.name.localeCompare(b.name),
  )
}
