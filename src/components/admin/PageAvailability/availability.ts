import type { Tone } from '@/components/admin/helpers/tones'
import type { PagePlacement, PageService } from '@/lib/pageServices'

/** One service that places the page, and what places it there. */
export interface ServicePlacement {
  service: PageService
  placement: PagePlacement
}

/** One row of the availability table: a service, where it stands, and why. */
export interface AvailabilityRow {
  service: PageService
  /** The service's name, which is the row's own title. */
  label: string
  /** Where the service stands, in one word the colour matches. */
  status: string
  tone: Tone
  /** What places the page there, where something does. */
  note?: string
}

/** The table, and the one line that says how to widen it. */
export interface PageAvailabilityReport {
  rows: AvailabilityRow[]
  hint?: string
}

/** The service's name, as the row's title reads it. */
const SERVICE: Record<PageService, string> = {
  web: 'Website',
  app: 'App',
}

/** The admin path an editor places a page from. */
const CONFIGURATION: Record<PageService, string> = {
  web: 'We Meditate Web › Configuration',
  app: 'We Meditate App › Configuration',
}

const because = (placement: PagePlacement): string =>
  placement.by === 'tag' ? `Tagged “${placement.tag}”` : 'Named in its configuration'

/**
 * Where a page is available, one row per service.
 *
 * A service that does not place the page is not waiting on publish, and a
 * placed page nobody published is served nowhere — so each row resolves to one
 * status in that order. A placed row also names what placed it, so taking the
 * page off that service is a single edit to find.
 */
export function pageAvailability(
  published: boolean,
  placed: readonly ServicePlacement[],
): PageAvailabilityReport {
  const services = Object.keys(SERVICE) as PageService[]
  const missing = services.filter((service) => !placed.some((entry) => entry.service === service))
  // Amber only where nothing places the page: a page one service carries and
  // the other does not is an ordinary page, not a state to colour as a problem.
  const unplaced: Tone = missing.length === services.length ? 'warning' : 'neutral'

  const rows = services.map((service): AvailabilityRow => {
    const entry = placed.find((candidate) => candidate.service === service)
    const label = SERVICE[service]
    if (!entry) return { service, label, status: 'Not placed', tone: unplaced }
    if (!published) {
      return {
        service,
        label,
        status: 'Not published',
        tone: 'warning',
        note: because(entry.placement),
      }
    }
    return { service, label, status: 'Available', tone: 'success', note: because(entry.placement) }
  })

  const hint = missing.length
    ? `Name it in ${missing
        .map((service) => CONFIGURATION[service])
        .join(' or ')}, or give it one of the Page tags listed there.`
    : undefined

  return { rows, hint }
}
