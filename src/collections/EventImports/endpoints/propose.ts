import type { ExistingRegion } from '../propose/match'
import type { Endpoint, PayloadRequest } from 'payload'

import { requireActiveManager } from '@/lib/endpoints'
import { relationId } from '@/lib/utilities/relationId'
import type { EventImport, EventImportRows } from '@/payload-types'

import {
  batchIdOf,
  failure,
  loadTarget,
  readExistingRegions,
  readTakenSlugs,
  refuseUnownedTarget,
  targetSubtreeWhere,
  type TargetRegion,
} from '../batchRequest'
import {
  buildProposedTree,
  isProposableTargetLevel,
  unproposableTargetMessage,
  type ProposableRow,
  tallyTree,
  type ProposedRowError,
  type ProposedTree,
} from '../propose/tree'

type ImportRow = EventImportRows[number]

/**
 * POST /api/event-imports/:id/propose
 *
 * Builds the region tree a resolved batch would create and writes it to
 * `proposedRegions`. The review UI renders what comes back; the commit walks the
 * stored copy.
 *
 * ⚠ **One request, unlike the resolve step.** Every input is already in hand —
 * the rows carry their geocode answers, and the tree reads come from our own
 * database — so there is no per-row network call to chunk around. Re-calling it
 * recomputes from scratch and overwrites, which is what makes a renamed node
 * (phase 7) something the review re-sends rather than patches.
 *
 * ⚠ **The tree is recomputed here and again at commit.** Between a review and a
 * commit somebody else can create the very city this batch proposes, and the
 * stored tree would then create a second one. So this answer is what a human
 * approves, never what the commit trusts.
 *
 * Auth: intentionally NOT `requireActiveClient`. That guard serves published API
 * `clients`; this is an admin-panel action by an authenticated `manager` on a
 * batch they uploaded, reached only from a region's Import tab. `managers` sits
 * in no project and publishes no paths, so this is absent from the OpenAPI
 * client spec for the same reason `setProject` is. Which batch the caller may
 * touch comes from the collection's own `access` (`access.ts`); the subtree
 * check is re-run explicitly because the write that follows elevates past it.
 */
export const proposeEventImport: Endpoint = {
  path: '/:id/propose',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const id = batchIdOf(req)
    if (id === null) return failure('A numeric batch id is required.', 400)

    const batch = (await req.payload.findByID({
      collection: 'event-imports',
      id,
      depth: 0,
      overrideAccess: false,
      disableErrors: true,
      // Three fields, and `proposedRegions` deliberately not among them: this
      // endpoint is its only writer and rewrites it whole, so reading the copy it
      // is about to replace would re-serialise the previous tree for nothing.
      select: { status: true, targetRegion: true, rows: true },
      req,
    })) as EventImport | null
    if (!batch) return failure('No such import batch.', 404)
    if (batch.status === 'committing') {
      return failure('This batch is being committed, so its tree can no longer change.', 409)
    }
    // ⚠ **Not "enough rows have answers" but "no row is still waiting".** A tree
    // built from a half-resolved batch would propose a city layer missing the
    // places the remaining rows name, and the merge and state-layer thresholds
    // both count places — so a reviewer would approve a shape the finished batch
    // does not have.
    if (batch.status !== 'resolved') {
      return failure('Resolve the batch before proposing its regions.', 409)
    }

    const targetId = relationId(batch.targetRegion)
    if (targetId === null) return failure('This batch names no target region.', 409)

    const unowned = await refuseUnownedTarget(req, targetId)
    if (unowned) return unowned

    const loaded = await loadTarget(req, targetId)
    if (!loaded.ok) return failure(loaded.error, 422)

    const { target } = loaded
    if (!isProposableTargetLevel(target.level)) {
      // ⚠ **`targetRegion` carries no `filterOptions`, so this is the only
      // refusal.** `ALLOWED_PARENT_LEVELS` (`Regions.ts`) forbids a city under a
      // venue, so proposing one would build a tree the commit cannot write.
      return failure(unproposableTargetMessage(target.level), 422)
    }

    const rows = (batch.rows ?? []) as ImportRow[]
    const { rows: proposable, errors: strayErrors } = confineToTarget(proposableRows(rows), target)
    const { existing, takenSlugs } = await loadTreeContext(req, targetId, proposable)

    const built = buildProposedTree({
      target: { id: targetId, level: target.level, name: target.name },
      countryCode: loaded.scope.countryCode,
      rows: proposable,
      existing,
      takenSlugs,
    })
    const tree: ProposedTree = {
      ...built,
      rowErrors: [...strayErrors, ...built.rowErrors].sort((a, b) => a.line - b.line),
    }

    await req.payload.update({
      collection: 'event-imports',
      id,
      // The caller's ownership was settled above, and `proposedRegions` is
      // `readOnly` in the admin — so this write elevates past field access
      // deliberately.
      data: { proposedRegions: tree },
      overrideAccess: true,
      depth: 0,
      // The answer is already in hand, and the document carries up to
      // `MAX_IMPORT_ROWS` rows plus the tree just written — all of which an
      // unbounded update would re-read and re-serialise to be discarded. `id` is
      // not a selectable key — it always comes back — so this asks for the
      // cheapest column there is.
      select: { status: true },
      req,
    })

    const warn = loaded.warning ? { warning: loaded.warning } : {}
    return Response.json({ ...warn, ...tallyTree(tree), proposedRegions: tree })
  },
}


/**
 * The rows a node may be proposed for.
 *
 * ⚠ **A duplicate is left out, not reported again.** The resolve step already
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
        placeId: resolved.placeId,
        placeName: resolved.placeName,
        subdivisionCode: resolved.subdivisionCode,
        mapboxId: resolved.mapboxId,
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
