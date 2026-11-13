/**
 * The pure half of `send-atlas-migration-email.ts`: who gets the one-off
 * migration email, and what it says they look after.
 * shortcut: a one-off for the Atlas cutover, delete it with the script.
 */

export interface CandidateManager {
  id: number
  email: string
  name?: null | string
  type?: null | string
  legacyId?: null | number
}

export interface MigrationRecipient {
  id: number
  email: string
  name: string
  holds: { events: number; regions: number; services: number }
}

/**
 * Atlas managers named on at least one live event (not finished, not trashed),
 * region or service, minus anyone the ledger already holds.
 *
 * Only managers the import created (`legacyId` set): a SahajCloud-only account
 * never used the old CMS, so "it has moved" is not news to it. An admin ran the
 * migration and an inactive manager cannot sign in, so neither is mailed.
 */
export function selectRecipients(args: {
  managers: CandidateManager[]
  /** One entry per live event, naming its manager. */
  liveEventManagers: (null | number | undefined)[]
  /** One entry per region, naming its managers. */
  regionManagers: (null | number | undefined)[][]
  /** One entry per service (a site embedding the map), naming its managers. */
  serviceManagers?: (null | number | undefined)[][]
  alreadySent: ReadonlySet<string>
}): MigrationRecipient[] {
  const events = tally(args.liveEventManagers)
  const regions = tally(args.regionManagers.flat())
  const services = tally((args.serviceManagers ?? []).flat())

  return args.managers
    .filter((manager) => manager.legacyId != null && manager.type === 'manager')
    .map((manager) => ({
      id: manager.id,
      email: manager.email.trim().toLowerCase(),
      name: manager.name?.trim() || manager.email.split('@')[0]!,
      holds: {
        events: events.get(manager.id) ?? 0,
        regions: regions.get(manager.id) ?? 0,
        services: services.get(manager.id) ?? 0,
      },
    }))
    .filter(({ holds }) => holds.events > 0 || holds.regions > 0 || holds.services > 0)
    .filter(({ email }) => !args.alreadySent.has(email))
    .sort((a, b) => a.id - b.id)
}

function tally(ids: (null | number | undefined)[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const id of ids) if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}
