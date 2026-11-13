import type { PayloadRequest } from 'payload'

import { getRegionTree } from '@/lib/atlas/regionTree'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'

export interface RegionContact {
  id: number
  name: string
  email: string
  /** The region they look after — the nearest one above the caller's events. */
  region: string
}

/**
 * Who a manager asks to have an event added: the managers of the regions above
 * the events they already run, nearest first.
 *
 * Reading them is one step past `mayReadManagerContacts`, which shows a class
 * manager no region manager's details (#908). Anton priced that on 12 Nov 2026
 * for this drawer alone, so the gate is the caller's own `manager` listings —
 * nothing here takes a region or a manager from the request.
 *
 * ⚠ The manager rows are read with `overrideAccess` past the field locks, so
 * the `select` is what keeps the rest of each row out (`docs/rules/access.md`).
 */
export async function loadRegionContacts(
  req: PayloadRequest,
  managerId: number,
): Promise<RegionContact[]> {
  const events = await req.payload.find({
    collection: 'events',
    where: { manager: { equals: managerId } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { region: true },
    req: localeIsolatedReq(req),
  })
  const regionIds = new Set(
    events.docs.map((event) => relationId(event.region)).filter((id) => id !== null),
  )
  if (!regionIds.size) return []

  // `chainById` runs root → self, so reversed it is a region and then every
  // region above it. The tree is this app's one derivation of that hierarchy,
  // and the page has already paid for it (`loadOpenItems`).
  const tree = await getRegionTree(req)
  const distance = new Map<number, number>()
  for (const id of regionIds) {
    const above = [...(tree.chainById.get(id) ?? [id])].reverse()
    above.forEach((link, step) => distance.set(link, Math.min(step, distance.get(link) ?? step)))
  }
  const chain = [...distance].sort(([, a], [, b]) => a - b).map(([id]) => id)

  // ⚠ Not `getRegionManagers`, which reads every region in the atlas. This
  // wants the handful standing above one manager's own events.
  const { docs: regions } = await req.payload.find({
    collection: 'regions',
    where: { id: { in: chain } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { managers: true },
    req: localeIsolatedReq(req),
  })
  const listedOn = new Map(regions.map((region) => [region.id, region.managers]))

  // A manager listed on several of these regions is reached about the nearest.
  const nearestRegion = new Map<number, string>()
  for (const id of chain) {
    const region = tree.nameById.get(id)
    if (!region) continue
    for (const listed of listedOn.get(id) ?? []) {
      const contactId = relationId(listed)
      // Nobody is asked to email themselves, as `findManagerForRegion` has it.
      if (contactId !== null && contactId !== managerId && !nearestRegion.has(contactId)) {
        nearestRegion.set(contactId, region)
      }
    }
  }
  if (!nearestRegion.size) return []

  const { docs: contacts } = await req.payload.find({
    collection: 'managers',
    where: { id: { in: [...nearestRegion.keys()] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true, email: true },
    req: localeIsolatedReq(req),
  })
  const rowById = new Map(contacts.map((contact) => [contact.id, contact]))

  return [...nearestRegion].flatMap(([id, region]) => {
    const row = rowById.get(id)
    return row ? [{ id, name: row.name, email: row.email, region }] : []
  })
}
