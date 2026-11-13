import type { PayloadRequest } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { breadcrumbAncestorIds, relationId } from '@/plugins/access/documentManagers'

/** A `type`, not an `interface`: Payload's `Table` takes `Record<string, unknown>` rows. */
export type RegionContact = {
  id: number
  name: string
  email: string
  /** The region they look after — the nearest one above the caller's events. */
  region: string
}

/**
 * The region ids above `regionIds`, nearest first: each region, then its
 * breadcrumb trail reversed, merged on the shortest distance any event gives.
 */
async function regionsAbove(req: PayloadRequest, regionIds: number[]): Promise<number[]> {
  const { docs } = await req.payload.find({
    collection: 'regions',
    where: { id: { in: regionIds } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { breadcrumbs: true },
    req: localeIsolatedReq(req),
  })

  const distance = new Map<number, number>()
  for (const doc of docs) {
    const chain = [doc.id, ...breadcrumbAncestorIds(doc, doc.id).reverse()]
    chain.forEach((id, step) => {
      const nearest = distance.get(id)
      if (nearest === undefined || step < nearest) distance.set(id, step)
    })
  }
  return [...distance].sort(([, a], [, b]) => a - b).map(([id]) => id)
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
  const regionIds = [
    ...new Set(events.docs.map((event) => relationId(event.region)).filter((id) => id !== null)),
  ]
  if (!regionIds.length) return []

  const chain = await regionsAbove(req, regionIds)
  const { docs: regions } = await req.payload.find({
    collection: 'regions',
    where: { id: { in: chain } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true, managers: true },
    req: localeIsolatedReq(req),
  })
  const byId = new Map(regions.map((region) => [region.id, region]))

  // A manager listed on several of these regions is reached about the nearest.
  const nearestRegion = new Map<number, string>()
  for (const id of chain) {
    const region = byId.get(id)
    if (!region?.name) continue
    for (const listed of region.managers ?? []) {
      const contactId = relationId(listed)
      if (contactId !== null && !nearestRegion.has(contactId)) {
        nearestRegion.set(contactId, region.name)
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
