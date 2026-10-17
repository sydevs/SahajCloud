/**
 * The resolve job's last pass: the region tree this batch would create.
 *
 * Lifted from #874's `propose` endpoint. What it loses with the endpoint is the
 * status check and the lease — the rows are in hand, every one of them answered,
 * which is the condition the endpoint could only assert.
 *
 * ⚠ **The commit walks the stored tree, but re-checks what it names.** Between
 * a review and a commit somebody else can create the very city this batch
 * proposes, or take its slug; the commit adopts the one, re-slugs around the
 * other, and refuses a region that has since left the target
 * (`commit/regions.ts`).
 */

import type { PayloadRequest } from 'payload'

import type { ExistingRegion } from '@/collections/EventImports/propose/match'
import type {
  ProposableRow,
  ProposableTargetLevel,
  ProposedRowError,
  ProposedTree,
} from '@/collections/EventImports/propose/tree'
import { buildProposedTree } from '@/collections/EventImports/propose/tree'
import type { LoadTargetResult, TargetRegion } from '@/collections/EventImports/regionReads'
import {
  readExistingRegions,
  readTakenSlugs,
  targetSubtreeWhere,
} from '@/collections/EventImports/regionReads'
import type { EventImportRows } from '@/payload-types'

type ImportRow = EventImportRows[number]
type LoadedTarget = Extract<LoadTargetResult, { ok: true }>

export async function proposeTree(args: {
  req: PayloadRequest
  rows: readonly ImportRow[]
  target: LoadedTarget
  /**
   * The target's level, narrowed by the caller.
   *
   * Passed rather than read off `target`: `ALLOWED_PARENT_LEVELS` (`Regions.ts`)
   * forbids a city under a venue, so a venue target would build a tree the
   * commit cannot write — and the refusal belongs where the batch can be told,
   * not here.
   */
  level: ProposableTargetLevel
}): Promise<ProposedTree> {
  const { req, rows, target, level } = args
  const { rows: proposable, errors: strayErrors } = confineToTarget(
    proposableRows(rows),
    target.target,
  )
  const { existing, takenSlugs } = await loadTreeContext(req, target.target.id, proposable)

  const built = buildProposedTree({
    target: { id: target.target.id, level, name: target.target.name },
    countryCode: target.scope.countryCode,
    rows: proposable,
    existing,
    takenSlugs,
  })

  return {
    ...built,
    rowErrors: [...strayErrors, ...built.rowErrors].sort((a, b) => a.line - b.line),
  }
}

/**
 * The rows a node may be proposed for.
 *
 * ⚠ **A duplicate is left out, not reported again.** The duplicate pass already
 * said which class it repeats, and the commit skips it — so counting it towards
 * the metro merge or the state-layer thresholds would size the tree off classes
 * nothing is going to create.
 */
function proposableRows(rows: readonly ImportRow[]): ProposableRow[] {
  return rows.flatMap((row) => {
    if (!row.resolved || row.errors?.length || row.duplicate) return []
    const { resolved, values } = row
    return [
      {
        line: row.line,
        point: { latitude: resolved.latitude, longitude: resolved.longitude },
        cityKey: resolved.cityKey,
        cityName: values.city ?? null,
        placeId: resolved.placeId,
        placeName: resolved.placeName,
        subdivisionCode: resolved.subdivisionCode,
        regionMapboxId: resolved.regionMapboxId ?? null,
        // ⚠ **None for an approximate geocode.** Its feature is the street or
        // the town, and venues sharing a feature merge (`cluster.ts`) — so two
        // halls on one street would become one.
        mapboxId: resolved.approximate ? null : resolved.mapboxId,
        // ⚠ **Read off the CSV, not off `resolved`.** The address is what keys a
        // hall (`cluster.ts`), and an online row has none — which is how its
        // classes stay off a city target's venue layer.
        address: values.address ?? null,
        venueName: values.venueName ?? null,
      },
    ]
  })
}

/**
 * The two tree reads `buildProposedTree` refuses to do itself.
 *
 * ⚠ **`existing` is the target's subtree PLUS whoever else holds a feature this
 * batch geocoded.** The subtree answers "is this city already ours"; the second
 * read answers "is it somebody else's", which is a refusal rather than a match
 * (`match.ts`) and is invisible from inside the subtree. Without it a batch
 * silently proposes a second Pune and the commit fails `mapboxId`'s unique
 * constraint, naming a column the volunteer cannot read.
 */
async function loadTreeContext(
  req: PayloadRequest,
  targetId: number,
  rows: readonly ProposableRow[],
): Promise<{ existing: ExistingRegion[]; takenSlugs: string[] }> {
  const subtree = targetSubtreeWhere(targetId)
  const features = [
    ...new Set(
      rows.flatMap((row) => [row.placeId, row.mapboxId].filter((id): id is string => !!id)),
    ),
  ]

  const [inside, holders, slugs] = await Promise.all([
    readExistingRegions(req, subtree, true),
    features.length
      ? readExistingRegions(req, { mapboxId: { in: features } }, false)
      : Promise.resolve([]),
    readTakenSlugs(req),
  ])

  // ⚠ **The subtree read decides `inTarget`, not a second query.** Postgres has
  // no `NOT (…)` through Payload's `Where`, and asking for "holds this feature
  // and is outside the subtree" as its own query would need one — so the feature
  // read is unscoped and the ids already in hand remove its overlap.
  const insideIds = new Set(inside.map((region) => region.id))
  return {
    existing: [...inside, ...holders.filter((region) => !insideIds.has(region.id))],
    takenSlugs: slugs,
  }
}

/**
 * Rows a city target cannot hold, and the rest.
 *
 * ⚠ **A city target is the one level nothing else confines.** `targetScope.ts`
 * reduces the chain to an ISO country and subdivision, which is as tight as a
 * `region` target gets and names a city not at all — so without this a hall in
 * Nuremberg becomes a `venue` node under a Munich target, created inside it and
 * reported as nothing. A country or state target needs none of this: every node
 * it proposes is built beneath it.
 *
 * ⚠ **Compared on the Mapbox feature, and skipped where the target has none.** A
 * region seeded by hand carries a `manual-` id no geocode returns
 * (`src/lib/mapbox/manualLocation.ts`), and a name comparison is what would
 * refuse München to an admin whose locale spells it Munich — the refusal
 * `targetScope.ts` declines for the same reason. So a hand-located city target
 * stays unconfined, and says so in the warning rather than refusing every row.
 */
function confineToTarget(
  rows: readonly ProposableRow[],
  target: TargetRegion,
): { rows: ProposableRow[]; errors: ProposedRowError[] } {
  if (target.level !== 'city' || target.mapboxId.startsWith('manual-')) {
    return { rows: [...rows], errors: [] }
  }

  const kept: ProposableRow[] = []
  const errors: ProposedRowError[] = []
  for (const row of rows) {
    // A row with no place id geocoded to an address inside some city Mapbox did
    // not name; refusing it would turn a thin answer into a dead row, and the
    // hall it proposes still hangs off this target either way.
    if (!row.placeId || row.placeId === target.mapboxId) kept.push(row)
    else errors.push({ line: row.line, message: `This address is not in ${target.name}.` })
  }
  return { rows: kept, errors }
}
