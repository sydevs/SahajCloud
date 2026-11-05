/**
 * The atlas verification floors, derived from the built data rather than
 * committed as constants.
 *
 * Verification is `actual >= expected`, so a stale constant fails in one of
 * two quiet ways: above what can be imported, every run fails; below it, the
 * check degrades into none. Each rule below mirrors the importer's own skip
 * for that collection, so the floor is exactly what a clean target ends with.
 */
import { UNIMPORTABLE_REGIONS } from './merges'
import { multiUseVenueIds } from '../helpers/venueRouter'
import { importDeletedAt } from '../helpers/verification'

/** The importer's email shape (`ATLAS_EMAIL_RE` in import.ts). */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface CountInput {
  managers: { legacyId: number }[]
  regions: { legacyId: number; level: string }[]
  venues: { legacyId: number }[]
  users: { legacyId: number; email: string | null }[]
  events: {
    legacyId: number
    managerId: number | null
    venueId: number | null
    areaId: number | null
    legacyData?: { archived_at?: string | null; verified_at?: string | null } | null
  }[]
  registrations: { userId: number | null; eventId: number }[]
  clients: { managerId: number | null }[]
}

export type AtlasExpectedCounts = Record<
  'managers' | 'regions' | 'users' | 'events' | 'user-submissions' | 'clients',
  number
>

export function deriveExpectedCounts(data: CountInput): AtlasExpectedCounts {
  const managerIds = new Set(data.managers.map((m) => m.legacyId))
  const venueIds = new Set(data.venues.map((v) => v.legacyId))
  const importableNodes = data.regions.filter(
    (r) => !UNIMPORTABLE_REGIONS.has(`${r.level}:${r.legacyId}`),
  )
  const areaIds = new Set(importableNodes.filter((r) => r.level === 'area').map((r) => r.legacyId))
  const sharedVenues = [...multiUseVenueIds(data.events)].filter((id) => venueIds.has(id))
  const shared = new Set(sharedVenues)

  // An event imports when its manager and region resolve. A trashed one is
  // created but invisible to `payload.count`, and Payload silently rolls back
  // a create pointing at a trashed doc, so its registrations never land.
  const counted = new Set<number>()
  for (const e of data.events) {
    if (e.managerId == null || !managerIds.has(e.managerId)) continue
    const hasRegion =
      e.venueId != null && shared.has(e.venueId) ? true : e.areaId != null && areaIds.has(e.areaId)
    if (!hasRegion || importDeletedAt(e.legacyData)) continue
    counted.add(e.legacyId)
  }

  const importableUsers = new Set(
    data.users.filter((u) => EMAIL_SHAPE.test((u.email ?? '').trim())).map((u) => u.legacyId),
  )
  const uniqueEmails = new Set(
    data.users
      .filter((u) => importableUsers.has(u.legacyId))
      .map((u) => (u.email ?? '').trim().toLowerCase()),
  )

  return {
    managers: data.managers.length,
    regions: importableNodes.length + sharedVenues.length,
    users: uniqueEmails.size,
    events: counted.size,
    'user-submissions': data.registrations.filter(
      (r) => r.userId != null && importableUsers.has(r.userId) && counted.has(r.eventId),
    ).length,
    clients: data.clients.filter((c) => c.managerId != null && managerIds.has(c.managerId)).length,
  }
}
