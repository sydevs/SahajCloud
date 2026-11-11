import type { PayloadRequest } from 'payload'

import { formatShortDate, humanDurationSince } from '@/lib/notifications/eventDetails'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { mayReadManagerContacts } from '@/plugins/access'
import { relationId } from '@/plugins/access/documentManagers'

/** The collections that carry the table — each names its managers differently. */
export type ManagerContactsCollection = 'events' | 'regions'

/** One manager, as the contacts table shows them. */
export type ManagerContactRow = {
  id: number
  name: string
  email: string
  /**
   * One line, `10 Nov 2026 - 3 weeks ago`, formatted here because only the
   * server knows what "now" is for the read. `stale` once it is long ago.
   */
  lastSignIn: { text: string; stale: boolean } | null
}

/** The place the gate judges, and who is named there, off the stored row. */
async function readPlace(
  req: PayloadRequest,
  collection: ManagerContactsCollection,
  id: number,
): Promise<null | { place: { region?: unknown; manager?: unknown }; managerIds: number[] }> {
  // A server-component tree renders concurrently, so every read takes its own
  // `req` copy (src/collections/AGENTS.md).
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

/** Every id a relationship value holds, in its own order, once each. */
function idsOf(value: unknown): number[] {
  const ids = (Array.isArray(value) ? value : [value]).map(relationId)
  return [...new Set(ids.filter((id): id is number => id !== null))]
}

/**
 * Past this many months, a sign-in reads as long ago. It is no proof a manager
 * is gone: the reminder's own link verifies an event without a sign-in.
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
 * `null` when the caller may not see them, which the component renders as
 * nothing at all.
 *
 * ⚠ **It reads the row itself rather than the form `data` Payload passes the
 * field.** That one can arrive from a form-state request the browser posted,
 * so trusting it would let a caller name any manager and any region. The id is
 * the only thing taken from the request, and the gate then judges the row that
 * id names. For an event that is the published row, as the Registrations tab
 * reads it: on a published event, a draft-only reassignment names nobody here
 * until it is published. A new event's first save is its stored row, draft or
 * not, which is the gap `docs/rules/access.md` accepts.
 *
 * ⚠ **The manager rows are read after the gate, never beside it**, and with
 * `overrideAccess`: every field but `name` on another manager is locked to
 * that manager and to admins, so the gate — not the collection's field access
 * — is the authority (`docs/rules/access.md`). The `select` is what keeps the
 * rest of the row out of the table.
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
        name: manager.name || manager.email,
        email: manager.email,
        lastSignIn: lastSignIn(manager.lastLoginAt, now),
      },
    ]
  })
}
