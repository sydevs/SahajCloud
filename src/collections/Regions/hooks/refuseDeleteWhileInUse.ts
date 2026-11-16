import type { CollectionBeforeDeleteHook, PayloadRequest, Where } from 'payload'

import { APIError } from 'payload'
import { extractID } from 'payload/shared'

/** `req.context` key: regions an ancestor's delete has already checked. */
const CHECKED_KEY = 'regionDeleteChecked'

/** How many places a refusal names before it counts the rest. */
const PLACES_NAMED = 5

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

/**
 * Refuses to delete a region while any event (archived ones included) sits in
 * its subtree, any service has a region in it, or any region in it lists a
 * manager, naming what is in the way — for admins too. It runs before
 * `Regions`' `deleteChildren`, so nothing in the subtree goes until all of it
 * has been checked.
 *
 * Every foreign key onto `regions` is `ON DELETE SET NULL`, so without it a
 * delete silently emptied `events.region` and `clients.region`. A `managers`
 * listing is the same loss of a different kind: the listing *is* the
 * `atlas-region-manager` grant over that region, so deleting the region
 * revokes it, and a manager listed nowhere else loses the admin panel.
 */
export const refuseDeleteWhileInUse: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const checked = checkedRegions(req)
  const regionId = Number(id)
  if (checked.has(regionId)) return

  const { names, managed } = await readSubtree(req, regionId)
  const ids = [...names.keys()]
  const blockers = [
    ...(await eventBlockers(req, ids, names)),
    ...(await serviceBlockers(req, ids, names)),
    ...managerBlockers(managed, names),
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

/**
 * The region and every region beneath it, each with the name a refusal shows,
 * and which of them list a manager of their own.
 */
async function readSubtree(
  req: PayloadRequest,
  rootId: number,
): Promise<{ managed: number[]; names: Map<number, string> }> {
  const names = new Map<number, string>()
  const managed: number[] = []
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
      select: { name: true, slug: true, managers: true },
      req,
    })
    const found = docs.filter((doc) => !names.has(doc.id))
    if (!found.length) return { managed, names }
    for (const doc of found) {
      names.set(doc.id, doc.name || doc.slug || `#${doc.id}`)
      if (doc.managers?.length) managed.push(doc.id)
    }
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

  const trashed = docs.filter((doc) => doc.deletedAt).length
  const count = docs.length === 1 ? '1 event is' : `${docs.length} events are`
  // A trashed event is in no list view, so a count with no such note reads as
  // a blocker the manager cannot find.
  const inTrash = trashed ? ` (${trashed} in the trash)` : ''
  const places = docs.map((doc) => names.get(extractID(doc.region!)))
  return [`${count} held in ${placesPhrase(places)}${inTrash}`]
}

/** The distinct places named, bounded, since a country's subtree holds thousands. */
function placesPhrase(places: (string | undefined)[]): string {
  const distinct = [...new Set(places.filter((place): place is string => !!place))]
  const named = distinct.slice(0, PLACES_NAMED)
  if (distinct.length > PLACES_NAMED) named.push(`${distinct.length - PLACES_NAMED} more places`)
  return listFormat.format(named)
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

/**
 * Named by region, not by manager: the places are what the caller clears, and
 * the subtree's own `managers` field already shows them who.
 */
function managerBlockers(managed: number[], names: Map<number, string>): string[] {
  if (!managed.length) return []
  const subject = managed.length === 1 ? 'a manager is listed on' : 'managers are listed on'
  return [`${subject} ${placesPhrase(managed.map((id) => names.get(id)))}`]
}
