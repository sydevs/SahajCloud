import type { CollectionBeforeDeleteHook, PayloadRequest, Where } from 'payload'

import { APIError } from 'payload'
import { extractID } from 'payload/shared'

/** `req.context` key: regions an ancestor's delete already checked and is now removing. */
const CLEARED_KEY = 'regionDeleteCleared'

/** How many places an event refusal names before it counts the rest. */
const PLACES_NAMED = 5

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

/**
 * A region is deleted with everything beneath it, or not at all — for admins
 * too. Every foreign key onto `regions` is `ON DELETE SET NULL` and nested-docs
 * registers no delete hook, so a bare delete left each child a parentless root
 * outside every manager's subtree, and silently emptied `events.region` and
 * `clients.region`.
 *
 * So it refuses while any event (archived ones included) sits in the subtree,
 * or any service has a region in it, naming what is in the way. Otherwise it
 * deletes the descendants inside this delete's transaction, so a failure
 * undoes them with the region.
 */
export const deleteEmptySubtree: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const cleared = clearedRegions(req)
  const regionId = Number(id)
  if (cleared.has(regionId)) return

  const names = await readSubtree(req, regionId)
  const ids = [...names.keys()]
  const blockers = [
    ...(await eventBlockers(req, ids, names)),
    ...(await serviceBlockers(req, ids, names)),
  ]
  if (blockers.length) {
    throw new APIError(
      `"${names.get(regionId)}" can't be deleted while anything uses it or a region beneath it: ${blockers.join('; ')}. Nothing was deleted.`,
      409,
    )
  }

  const descendants = ids.filter((descendant) => descendant !== regionId)
  if (!descendants.length) return
  for (const descendant of descendants) cleared.add(descendant)
  // Not `deleteChildren`: a bulk delete reports a row it could not delete in
  // `errors` instead of throwing, which would let this region go regardless.
  const { errors } = await req.payload.delete({
    collection: 'regions',
    where: { id: { in: descendants } },
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (errors.length) {
    throw new APIError(
      `Could not delete the regions beneath "${names.get(regionId)}": ${errors.map((error) => error.message).join('; ')}`,
    )
  }
}

function clearedRegions(req: PayloadRequest): Set<number> {
  const existing = req.context[CLEARED_KEY]
  if (existing instanceof Set) return existing as Set<number>
  const created = new Set<number>()
  req.context[CLEARED_KEY] = created
  return created
}

/** The region and every region beneath it, each with the name a refusal shows. */
async function readSubtree(req: PayloadRequest, rootId: number): Promise<Map<number, string>> {
  const names = new Map<number, string>()
  // Walks `parent`, the stored truth, rather than the derived `breadcrumbs`:
  // a descendant the walk missed would outlive this region as a root.
  let where: Where = { id: { equals: rootId } }
  for (;;) {
    const { docs } = await req.payload.find({
      collection: 'regions',
      where,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      joins: false,
      select: { name: true, slug: true },
      req,
    })
    const found = docs.filter((doc) => !names.has(doc.id))
    if (!found.length) return names
    for (const doc of found) names.set(doc.id, doc.name || doc.slug || `#${doc.id}`)
    where = { parent: { in: found.map((doc) => doc.id) } }
  }
}

async function eventBlockers(
  req: PayloadRequest,
  ids: number[],
  names: Map<number, string>,
): Promise<string[]> {
  const { docs } = await req.payload.find({
    collection: 'events',
    where: { region: { in: ids } },
    // An archived event still names its region, and would come back from the
    // trash with none.
    trash: true,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { region: true, deletedAt: true },
    req,
  })
  if (!docs.length) return []

  const places = [...new Set(docs.map((doc) => names.get(extractID(doc.region!))))]
  const named = places.slice(0, PLACES_NAMED) as string[]
  if (places.length > PLACES_NAMED) named.push(`${places.length - PLACES_NAMED} more places`)
  const trashed = docs.filter((doc) => doc.deletedAt).length
  const count = docs.length === 1 ? '1 event is' : `${docs.length} events are`
  const inTrash =
    trashed === 0
      ? ''
      : docs.length === 1
        ? ' (in the trash)'
        : ` (${trashed === docs.length ? 'all' : trashed} in the trash)`
  return [`${count} held in ${listFormat.format(named)}${inTrash}`]
}

async function serviceBlockers(
  req: PayloadRequest,
  ids: number[],
  names: Map<number, string>,
): Promise<string[]> {
  const { docs } = await req.payload.find({
    collection: 'clients',
    where: { region: { in: ids } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { label: true, region: true },
    req,
  })
  return docs.map(
    (doc) =>
      `the service "${doc.label || `#${doc.id}`}" has ${names.get(extractID(doc.region!))} as its region`,
  )
}
