/**
 * The pure half of `send-atlas-migration-email.ts`: who gets each one-off
 * migration email, and what the welcome says they look after.
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

export interface CandidateService {
  id: number
  label: string
  legacyId?: null | number
  enabled?: boolean | null
  roles?: null | string[]
  site?: { domain?: null | string; track?: null | string } | null
  managers?: (null | number | { id: number })[] | null
}

export interface InstallRecipient {
  managerId: number
  email: string
  name: string
  service: { id: number; label: string; domain: string }
  /** The ledger's key: one email per manager per service. */
  key: string
}

/**
 * One install email per manager of each service the import created whose site
 * still runs the legacy widget: enabled, an atlas client, with a site to put the
 * map on, and no install begun — `site.track` is written the first time someone
 * picks a platform on the Install tab, so a set one means it is already in hand.
 * `adopted` names the services SahajCloud took over before the cutover
 * (`ADOPTED_CLIENT_LEGACY_IDS`), whose sites already run the new map.
 */
export function selectInstallRecipients(args: {
  managers: CandidateManager[]
  services: CandidateService[]
  adopted: ReadonlySet<number>
  alreadySent: ReadonlySet<string>
}): InstallRecipient[] {
  const managers = new Map(
    args.managers.filter((m) => m.type === 'manager').map((m) => [m.id, m] as const),
  )
  const recipients: InstallRecipient[] = []
  for (const service of args.services) {
    const domain = service.site?.domain?.trim()
    if (
      service.legacyId == null ||
      args.adopted.has(service.legacyId) ||
      !service.enabled ||
      !service.roles?.includes('sahaj-atlas-client') ||
      !domain ||
      service.site?.track
    )
      continue
    for (const ref of service.managers ?? []) {
      const manager = managers.get(typeof ref === 'number' ? ref : (ref?.id ?? NaN))
      if (!manager) continue
      const email = manager.email.trim().toLowerCase()
      const key = `${email} clients/${service.id}`
      if (args.alreadySent.has(key)) continue
      recipients.push({
        managerId: manager.id,
        email,
        name: manager.name?.trim() || email.split('@')[0]!,
        service: { id: service.id, label: service.label, domain },
        key,
      })
    }
  }
  return recipients.sort((a, b) => a.service.id - b.service.id || a.managerId - b.managerId)
}

function tally(ids: (null | number | undefined)[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const id of ids) if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}
