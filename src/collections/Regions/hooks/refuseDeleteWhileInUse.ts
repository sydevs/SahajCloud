import type { CollectionBeforeDeleteHook, PayloadRequest } from 'payload'

import { APIError } from 'payload'
import { extractID } from 'payload/shared'

import type { Event, Region } from '@/payload-types'

/** The most places a refusal lists; past it, the last item counts the rest. */
const PLACES_NAMED = 5

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

type RegionRef = number | Region | null | undefined

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
  // The cascade runs this again on every descendant the first check cleared.
  // Kept by id, because a bulk delete's siblings share `req` and each owes its own.
  const checked = (req.context.regionDeleteChecked ??= new Set<number>()) as Set<number>
  const regionId = Number(id)
  if (checked.has(regionId)) return

  const subtree = await readSubtree(req, regionId)
  const nameOf = (region: RegionRef) => subtree.get(extractID(region!))!.name
  const inSubtree = {
    where: { region: { in: [...subtree.keys()] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  } as const
  const events = await req.payload.find({
    collection: 'events',
    ...inSubtree,
    // An archived event still names its region, and would come back from the
    // trash with none.
    trash: true,
    select: { region: true, deletedAt: true },
  })
  const services = await req.payload.find({
    collection: 'clients',
    ...inSubtree,
    select: { label: true, region: true },
  })
  const managed = [...subtree.values()].filter((region) => region.managed)

  const blockers = services.docs.map(
    (service) => `the service "${service.label}" has ${nameOf(service.region)} as its region`,
  )
  if (events.docs.length) blockers.unshift(describeEvents(events.docs, nameOf))
  // Named by region, not by manager: the places are what the caller clears,
  // and each region's own `managers` field already shows them who.
  if (managed.length) {
    const subject = managed.length === 1 ? 'a manager is listed on' : 'managers are listed on'
    blockers.push(`${subject} ${placesPhrase(managed.map((region) => region.name))}`)
  }
  if (blockers.length) {
    throw new APIError(
      `"${subtree.get(regionId)!.name}" can't be deleted while anything uses it or a region beneath it: ${blockers.join('; ')}. Nothing was deleted.`,
      409,
    )
  }
  for (const descendant of subtree.keys()) checked.add(descendant)
}

/**
 * The region and every region beneath it, each with the name a refusal shows
 * and whether it lists a manager. A descendant whose `breadcrumbs` miss it is
 * still checked, by its own delete when the cascade reaches it.
 */
async function readSubtree(
  req: PayloadRequest,
  rootId: number,
): Promise<Map<number, { managed: boolean; name: string }>> {
  const { docs } = await req.payload.find({
    collection: 'regions',
    where: { or: [{ id: { equals: rootId } }, { 'breadcrumbs.doc': { equals: rootId } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    joins: false,
    select: { name: true, slug: true, managers: true },
    req,
  })
  return new Map(
    docs.map((doc) => [doc.id, { managed: !!doc.managers?.length, name: doc.name || doc.slug }]),
  )
}

function describeEvents(
  events: Array<Pick<Event, 'region' | 'deletedAt'>>,
  nameOf: (region: RegionRef) => string,
): string {
  const count = events.length === 1 ? '1 event is' : `${events.length} events are`
  const trashed = events.filter((event) => event.deletedAt).length
  // A trashed event is in no list view, so a count with no such note reads as
  // a blocker the manager cannot find.
  const inTrash = trashed ? ` (${trashed} in the trash)` : ''
  return `${count} held in ${placesPhrase(events.map((event) => nameOf(event.region)))}${inTrash}`
}

/** The distinct places named, bounded, since a country's subtree holds thousands. */
function placesPhrase(places: string[]): string {
  const distinct = [...new Set(places)]
  if (distinct.length <= PLACES_NAMED) return listFormat.format(distinct)
  const rest = distinct.length - PLACES_NAMED + 1
  return listFormat.format([...distinct.slice(0, PLACES_NAMED - 1), `${rest} more places`])
}
