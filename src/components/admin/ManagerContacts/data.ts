import type { PayloadRequest } from 'payload'

import { formatShortDate, humanDurationSince } from '@/lib/notifications/eventDetails'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { mayReadManagerContacts } from '@/plugins/access'
import { relationId } from '@/plugins/access/documentManagers'

export type ManagerContactsCollection = 'events' | 'regions'

export type ManagerContactRow = {
  id: number
  name: string
  email: string
  /** `10 Nov 2026 - 3 weeks ago`, formatted against the server's "now". */
  lastSignIn: { text: string; stale: boolean } | null
}

/** The place the gate judges, and who is named there. */
async function readPlace(
  req: PayloadRequest,
  collection: ManagerContactsCollection,
  id: number,
): Promise<null | { place: { region?: unknown; manager?: unknown }; managerIds: number[] }> {
  // Server components render concurrently, so each read takes its own `req`.
  if (collection === 'regions') {
    const region = await req.payload.findByID({
      collection: 'regions',
      id,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: { managers: true },
      req: localeIsolatedReq(req),
    })
    if (!region) return null
    return { place: { region: region.id }, managerIds: idsOf(region.managers) }
  }

  const event = await req.payload.findByID({
    collection: 'events',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { manager: true, region: true },
    // An archived class is trashed, and its manager is still someone to reach.
    trash: true,
    req: localeIsolatedReq(req),
  })
  if (!event) return null
  return {
    place: { region: event.region, manager: event.manager },
    managerIds: idsOf(event.manager),
  }
}

/** A relationship value's ids, in order, once each. */
function idsOf(value: unknown): number[] {
  const ids = (Array.isArray(value) ? value : [value]).map(relationId)
  return [...new Set(ids.filter((id): id is number => id !== null))]
}

/**
 * Past this many months a sign-in shows red. No proof a manager is gone: a
 * reminder's link verifies an event without signing in.
 */
export const STALE_SIGN_IN_MONTHS = 6

function lastSignIn(iso: null | string | undefined, now: Date): ManagerContactRow['lastSignIn'] {
  if (!iso) return null
  const since = humanDurationSince(iso, now)
  const staleBefore = new Date(now)
  staleBefore.setUTCMonth(staleBefore.getUTCMonth() - STALE_SIGN_IN_MONTHS)
  return {
    text: `${formatShortDate(iso)} - ${since ? `${since} ago` : 'just now'}`,
    stale: new Date(iso) < staleBefore,
  }
}

/**
 * The managers named on a region or an event, with how to reach them — or
 * `null` when the caller may not see them.
 *
 * ⚠ It reads the stored row by id, never the form `data` Payload passes the
 * field: a posted form state could name any manager and any region. For an
 * event that is the published row, as the Registrations tab reads it.
 *
 * ⚠ The manager rows are read after the gate, with `overrideAccess` past the
 * field locks, so the `select` is what keeps the rest of each row out.
 */
export async function loadManagerContacts(
  req: PayloadRequest,
  collection: ManagerContactsCollection,
  docID: number | string | undefined,
  now: Date = new Date(),
): Promise<ManagerContactRow[] | null> {
  // `/create` resolves a document view with `docID` of `'create'`.
  const id = Number(docID)
  if (docID == null || !Number.isInteger(id)) return null

  const read = await readPlace(req, collection, id)
  if (!read || !(await mayReadManagerContacts(req, read.place))) return null
  if (!read.managerIds.length) return []

  const { docs } = await req.payload.find({
    collection: 'managers',
    where: { id: { in: read.managerIds } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { name: true, email: true, lastLoginAt: true },
    req: localeIsolatedReq(req),
  })
  const byId = new Map(docs.map((doc) => [doc.id, doc]))

  return read.managerIds.flatMap((managerId) => {
    const manager = byId.get(managerId)
    if (!manager) return []
    return [
      {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        lastSignIn: lastSignIn(manager.lastLoginAt, now),
      },
    ]
  })
}
