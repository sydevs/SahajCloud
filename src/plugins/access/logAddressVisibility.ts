import type { EventScope } from './regionSubtreeAccess'
import type { PayloadRequest } from 'payload'

import type { LogAddressEntry, LogAddressVisibility } from '@/fields/logField'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

import { isAdminManager, isManager } from './adminOnly'
import { isEventInScope, resolveOwnedRegionIds } from './regionSubtreeAccess'

/**
 * Who reads the contact addresses an activity log records (#1047).
 *
 * `logField`'s lock admits every manager, and `atlas-manager` reads `events`
 * and every proposal project-wide — so without this, any of them read the
 * email address or messaging handle each reminder and review mail went to, in
 * any region. A reader sees an address when:
 *
 * - they are an admin;
 * - it is their own: the entry names them as its recipient, or, naming nobody,
 *   went to their email;
 * - the document is in their scope — `isEventInScope`, the same test their
 *   writes on `events` pass: the event's region is in their owned subtree, or
 *   they are its own manager. A region manager has to be able to contact the
 *   managers below them, and an event's manager the region managers a
 *   reminder escalated to about their own event.
 *
 * Everyone else keeps the entry and loses the address. An API client never
 * gets this far: the field lock removes the whole log for it.
 */

const SHOW_ALL = () => true
const SHOW_NONE = () => false

/**
 * Whether an entry's address is this manager's own. By the recipient's id when
 * the entry names one, as a reminder does; only an entry naming nobody, a
 * delivery, falls back to comparing the address with their email.
 *
 * ⚠ Never by comparing a messaging handle: a manager edits their own
 * `contactDetails`, so a guessed handle added there would confirm, entry by
 * entry, which colleagues it belongs to.
 */
function isOwnEntry(
  userId: number,
  email: unknown,
  { entry, addresses }: LogAddressEntry,
): boolean {
  const recipientId = relationId(entry.manager)
  if (recipientId !== null) return recipientId === userId
  if (typeof email !== 'string') return false
  const own = email.trim().toLowerCase()
  return addresses.every((address) => address.trim().toLowerCase() === own)
}

/** Where the document a log sits on belongs, or `null` when it cannot be placed. */
export type LocateAddressScope = (args: {
  req: PayloadRequest
  doc: Record<string, unknown>
  docId: number | null
}) => Promise<EventScope | null>

/** The visibility rule above, for a document placed by `locate`. */
export function regionScopedAddressVisibility(locate: LocateAddressScope): LogAddressVisibility {
  return async ({ req, doc, docId, entries }) => {
    const { user } = req
    if (isAdminManager(user)) return SHOW_ALL
    // ⚠ An allowlist: no user, an inactive manager and any future auth
    // collection all see no address.
    if (!isManager(user)) return SHOW_NONE

    const userId = Number(user.id)
    const isOwn = (candidate: LogAddressEntry) => isOwnEntry(userId, user.email, candidate)
    if (entries.every(isOwn)) return SHOW_ALL

    const scope = await locate({ req, doc, docId })
    if (scope && isEventInScope(await resolveOwnedRegionIds(req, userId), userId, scope)) {
      return SHOW_ALL
    }
    return isOwn
  }
}

/**
 * An event's region and manager, read off the row when the read selected
 * both, else loaded.
 *
 * ⚠ The load is `overrideAccess: true` and selects the two columns the
 * decision reads, nothing else — it is a gate, never copied into the response.
 * A `select` that omits either (`?select[activityLog]=true`) is what reaches
 * it. It runs inside an `afterRead`, so it takes no `req`: joining a write's
 * open transaction from there can roll the write back (`src/collections/AGENTS.md`).
 * An uncommitted row then reads as absent, which shows no address.
 */
export async function eventAddressScope(
  req: PayloadRequest,
  event: Record<string, unknown> | null,
  eventId: number | null,
): Promise<EventScope | null> {
  if (event && 'region' in event && 'manager' in event) {
    return { regionId: relationId(event.region), managerId: relationId(event.manager) }
  }
  if (eventId == null) return null
  const loaded = await memoizeOnRequest(req, `logAddressEventScope:${eventId}`, () =>
    req.payload.findByID({
      collection: 'events',
      id: eventId,
      depth: 0,
      select: { region: true, manager: true },
      overrideAccess: true,
      disableErrors: true,
      trash: true,
    }),
  )
  if (!loaded) return null
  return { regionId: relationId(loaded.region), managerId: relationId(loaded.manager) }
}
