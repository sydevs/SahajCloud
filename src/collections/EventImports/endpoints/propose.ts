import type { ExistingRegion } from '../propose/match'
import type { Endpoint, PayloadRequest, Where } from 'payload'

import { requireActiveManager } from '@/lib/endpoints'
import { relationId } from '@/lib/utilities/relationId'
import type { EventImport, EventImportRows, Region } from '@/payload-types'

import { batchIdOf, failure, loadTarget, refuseUnownedTarget } from '../batchRequest'
import {
  buildProposedTree,
  type ProposableRow,
  type ProposableTargetLevel,
  type ProposedTree,
} from '../propose/tree'

type ImportRow = EventImportRows[number]
type ResolvedRow = NonNullable<ImportRow['resolved']>

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
    if (!isProposableLevel(target.level)) {
      // ⚠ **`targetRegion` carries no `filterOptions`, so this is the only
      // refusal.** `ALLOWED_PARENT_LEVELS` (`Regions.ts`) forbids a city under a
      // venue, so proposing one would build a tree the commit cannot write.
      return failure(
        `A ${target.level} cannot hold imported classes' regions. Target a country, state or city.`,
        422,
      )
    }

    const rows = (batch.rows ?? []) as ImportRow[]
    const proposable = proposableRows(rows)
    const { existing, takenSlugs } = await loadTreeContext(req, targetId, proposable)

    const tree = buildProposedTree({
      target: { id: targetId, level: target.level, name: target.name },
      countryCode: loaded.scope.countryCode,
      rows: proposable,
      existing,
      takenSlugs,
    })

    await req.payload.update({
      collection: 'event-imports',
      id,
      // The caller's ownership was settled above, and `proposedRegions` is
      // `readOnly` in the admin — so this write elevates past field access
      // deliberately.
      data: { proposedRegions: tree },
      overrideAccess: true,
      depth: 0,
      req,
    })

    const warn = loaded.warning ? { warning: loaded.warning } : {}
    return Response.json({ ...warn, ...tally(tree), proposedRegions: tree })
  },
}

function isProposableLevel(level: Region['level']): level is ProposableTargetLevel {
  return level === 'country' || level === 'region' || level === 'city'
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
    const resolved = row.resolved as ResolvedRow
    const values = row.values ?? {}
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

interface TreeContext {
  existing: ExistingRegion[]
  takenSlugs: string[]
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
): Promise<TreeContext> {
  const subtree: Where = {
    or: [{ id: { equals: targetId } }, { 'breadcrumbs.doc': { equals: targetId } }],
  }
  const features = [
    ...new Set(
      rows.flatMap((row) => [row.placeId, row.mapboxId].filter((id): id is string => !!id)),
    ),
  ]

  const [inside, holders, slugs] = await Promise.all([
    readRegions(req, subtree),
    features.length ? readRegions(req, { mapboxId: { in: features } }) : Promise.resolve([]),
    // The slug namespace is collection-wide (`slugs.ts`), so this cannot be
    // scoped to the subtree. `slug` is a plain column, and the include-mode
    // select is what stops every region's virtual URL fields running per row.
    req.payload
      .find({
        collection: 'regions',
        depth: 0,
        pagination: false,
        overrideAccess: true,
        select: { slug: true },
        req,
      })
      .then(({ docs }) => docs.map((region) => region.slug)),
  ])

  // ⚠ **The subtree read decides `inTarget`, not a second query.** Postgres has
  // no `NOT (…)` through Payload's `Where`, and asking for "holds this feature
  // and is outside the subtree" as its own query would need one — so the feature
  // read is unscoped and the ids already in hand remove its overlap.
  const insideIds = new Set(inside.map((region) => region.id))
  return {
    existing: [
      ...inside.map((region) => asExisting(region, true)),
      ...holders
        .filter((region) => !insideIds.has(region.id))
        .map((region) => asExisting(region, false)),
    ],
    takenSlugs: slugs,
  }
}

function readRegions(req: PayloadRequest, where: Where): Promise<Region[]> {
  return req.payload
    .find({
      collection: 'regions',
      where,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      select: { level: true, name: true, slug: true, mapboxId: true, parent: true },
      req,
    })
    .then(({ docs }) => docs as Region[])
}

function asExisting(region: Region, inTarget: boolean): ExistingRegion {
  return {
    id: region.id,
    level: region.level,
    name: region.name,
    slug: region.slug,
    mapboxId: region.mapboxId,
    parentId: relationId(region.parent),
    inTarget,
  }
}

interface Tally {
  /** Regions the commit would create. */
  creating: number
  /** Proposed nodes the Atlas already holds, which the commit leaves alone. */
  existing: number
  /** Rows the proposal itself refuses, on top of whatever the resolve step did. */
  rowErrors: number
}

/** What the review banner counts, recomputed from the tree rather than tracked. */
function tally(tree: ProposedTree): Tally {
  return {
    creating: tree.nodes.filter((node) => node.match.kind === 'create').length,
    existing: tree.nodes.filter((node) => node.match.kind === 'existing').length,
    rowErrors: tree.rowErrors.length,
  }
}
