import type { CollectionBeforeDeleteHook, PayloadRequest, Where } from 'payload'

import { APIError } from 'payload'
import { extractID } from 'payload/shared'

/** `req.context` key: regions an ancestor's delete has already checked. */
const CHECKED_KEY = 'regionDeleteChecked'

/** How many places an event refusal names before it counts the rest. */
const PLACES_NAMED = 5

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

/**
 * Refuses to delete a region while any event (archived ones included) sits in
 * its subtree, or any service has a region in it, naming what is in the way —
 * for admins too. It runs before `Regions`' `deleteChildren`, so nothing in the
 * subtree goes until all of it has been checked.
 *
 * Every foreign key onto `regions` is `ON DELETE SET NULL`, so without it a
 * delete silently emptied `events.region` and `clients.region`.
 */
export const refuseDeleteWhileInUse: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const checked = checkedRegions(req)
  const regionId = Number(id)
  if (checked.has(regionId)) return

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
  for (const descendant of ids) checked.add(descendant)
}

function checkedRegions(req: PayloadRequest): Set<number> {
  const existing = req.context[CHECKED_KEY]
  if (existing instanceof Set) return existing as Set<number>
  const created = new Set<number>()
  req.context[CHECKED_KEY] = created
  return created
}

/** The region and every region beneath it, each with the name a refusal shows. */
async function readSubtree(req: PayloadRequest, rootId: number): Promise<Map<number, string>> {
  const names = new Map<number, string>()
  // `parent`, not the derived `breadcrumbs`: it is what `deleteChildren`
  // follows, so what is checked is exactly what goes.
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
