import type { PayloadRequest } from 'payload'

import { notificationFrequency } from '@/components/admin/NotificationPreferences/config'
import type { DigestEmailProps, DigestTileBlock } from '@/emails/DigestEmail'
import type { ItemTableRow, StatusPillStyle } from '@/emails/EmailLayout'
import {
  loadOpenItems,
  loadStatistics,
  type OpenItem,
  type OpenItemStatus,
  type OverviewScope,
  type StatTile,
} from '@/lib/atlasOverview'
import { type ManagerRole, MANAGER_ROLE_LABELS } from '@/lib/notifications/managerRoles'
import { formatLongDate } from '@/lib/notifications'
import { adminDocUrl, adminUrl } from '@/lib/utilities/adminUrl'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import type { Manager } from '@/payload-types'

import { isDue, windowStart } from './due'
import { registrationGroups } from './registrations'
import { watermarkFor } from './watermarks'

const DAY_MS = 24 * 60 * 60 * 1000
/** How far back an admin's closing line counts sign-ups the form turned away. */
const REFUSAL_WINDOW_DAYS = 7

/** The preference keys a digest reads, each its own section or part of one. */
export const DIGEST_KEYS = {
  openItems: 'open_items',
  proposals: 'new_proposals',
  refusals: 'refused_signups',
  registrations: 'event_registration',
  statistics: 'statistics',
} as const

/** One role's email, plus what the run needs to record afterwards. */
export interface BuiltDigest {
  /** Preference keys whose watermark this send advances. */
  advance: string[]
  /**
   * `null` when nothing was due or nothing had anything to say.
   *
   * ⚠ **A null email still advances its watermarks.** Otherwise a manager who
   * had a quiet month, or who had a section muted, would get everything since
   * the last send the first time it had something — which is the #1052 finding
   * about a muted admin receiving months of refusals labelled "the last day".
   */
  email: null | { props: DigestEmailProps; subject: string }
  /** Sections whose own query threw, counted and left out. */
  failed: number
}

/** Pills a home draws that an email must still draw as something. */
function pillFor(status: OpenItemStatus): StatusPillStyle {
  if (status.pill === 'error' || status.pill === 'warning' || status.pill === 'success') {
    return status.pill
  }
  // `check` and `always-white` are a tick and a bordered pill in the panel,
  // neither of which an email client can be relied on to draw — grey is what
  // both degrade to.
  return 'light-gray'
}

function toEmailRow(item: OpenItem): ItemTableRow {
  const placing = item.statuses.find((status) => status.rank === item.rank) ?? item.statuses[0]!
  const target = placing.action?.target
  return {
    action: placing.action
      ? {
          href: adminDocUrl(placing.action.target.collection, placing.action.target.id),
          label: placing.action.label,
        }
      : null,
    href: target
      ? adminDocUrl(target.collection, target.id)
      : adminDocUrl(item.row.kind === 'event' ? 'events' : 'user-submissions', item.row.id),
    statuses: item.statuses.map((status) => ({
      line: status.line || undefined,
      pillStyle: pillFor(status),
      text: status.label,
    })),
    title: item.row.title,
  }
}

const tileText = (tile: StatTile) => ({
  change:
    tile.change === null
      ? null
      : `${tile.change >= 0 ? '+' : ''}${tile.change} in 30 days`,
  label: tile.label,
  of: tile.of === undefined ? null : String(tile.of),
  value: String(tile.value),
})

/** The scope one role reads its own list through. */
function scopeFor(role: ManagerRole, managerId: number): OverviewScope {
  if (role === 'admin') return { role: 'admin' }
  if (role === 'region') return { managerId, role: 'region' }
  return { managerId, role: 'program' }
}

/** A proposal or refusal that arrived inside the window, for a "new since" section. */
function arrivedSince(item: OpenItem, since: Date): boolean {
  const at =
    item.row.kind === 'event' ? item.row.proposal?.receivedAt : item.row.receivedAt
  return at !== undefined && at !== null && new Date(at) > since
}

/**
 * Sign-ups the form turned away in the last week — an admin's closing line.
 *
 * Counted from `registration-refusals` at stage `request`, which is an hourly
 * counter rather than a row per refusal: anyone holding the published widget
 * key can be refused for free, so a flood moves a number.
 */
async function refusedAtTheForm(
  req: PayloadRequest,
  now: Date,
): Promise<null | { href: string; text: string }> {
  const since = new Date(now.getTime() - REFUSAL_WINDOW_DAYS * DAY_MS)
  const { docs } = await req.payload.find({
    collection: 'registration-refusals',
    where: {
      and: [{ stage: { equals: 'request' } }, { hour: { greater_than: since.toISOString() } }],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req: localeIsolatedReq(req),
    select: { count: true },
  })
  const total = docs.reduce((sum, row) => sum + (row.count ?? 0), 0)
  if (total === 0) return null
  return {
    href: adminUrl('/collections/registration-refusals'),
    text: `${total} sign-up${total === 1 ? '' : 's'} blocked at the form in the last ${REFUSAL_WINDOW_DAYS} days`,
  }
}

/**
 * Build one manager's email for one role, holding only what is due.
 *
 * ⚠ **A section that throws is counted and left out**, never allowed to empty
 * the email: a manager whose statistics query fails should still get their open
 * items. The count rides out in the run's output so a silently degraded email
 * is visible in the job row.
 *
 * ⚠ **Open items is one list, however many paces contribute to it.** At the
 * `open_items` pace it is the whole list; at the `new_proposals` pace the
 * proposals that arrived since that key's own watermark join it, and for an
 * admin the refused sign-ups do the same at theirs. Three sections would mean
 * one listing appearing twice in one email, under two headings.
 */
export async function buildDigest(args: {
  manager: Manager
  req: PayloadRequest
  role: ManagerRole
  runStart: Date
}): Promise<BuiltDigest> {
  const { manager, req, role, runStart } = args
  const prefs = manager.notificationPreferences
  const pace = (key: string) => notificationFrequency(prefs, key)
  const due = (key: string) => isDue(pace(key), runStart)

  const scope = scopeFor(role, manager.id)
  const advance: string[] = []
  const parts: string[] = []
  let failed = 0

  const statistics: DigestTileBlock[] = []
  if (due(DIGEST_KEYS.statistics)) {
    try {
      const stats = await loadStatistics({ now: runStart, overrideAccess: true, req, scope })
      if (stats.health.length) {
        statistics.push({ heading: 'Verification health', tiles: stats.health.map(tileText) })
      }
      // No Most registered in email: a tile naming one listing is a thing to
      // click, and this is the one surface where clicking costs a page load.
      statistics.push({ heading: 'Analytics', tiles: stats.analytics.map(tileText) })
      advance.push(DIGEST_KEYS.statistics)
      parts.push(`${formatLongDate(runStart.toISOString()).split(' ').slice(1).join(' ')} analytics`)
    } catch (error) {
      failed += 1
      req.payload.logger.warn({
        error: error instanceof Error ? error.message : String(error),
        managerId: manager.id,
        msg: 'SendDigests: statistics section failed — left out',
        role,
      })
    }
  }

  let openItems: DigestEmailProps['openItems']
  let closingNote: DigestEmailProps['closingNote'] = null
  const wholeList = due(DIGEST_KEYS.openItems)
  const newProposals = due(DIGEST_KEYS.proposals)
  const newRefusals = role === 'admin' && due(DIGEST_KEYS.refusals)

  if (wholeList || newProposals || newRefusals) {
    try {
      const result = await loadOpenItems({ now: runStart, overrideAccess: true, req, scope })
      const items = result.items.filter((item) => {
        // A region email leaves out the manager's own listings: those are the
        // program email's, and one manager holding both roles would otherwise
        // read every one of them twice.
        if (role === 'region' && item.row.kind === 'event' && item.row.ownEvent) return false
        if (wholeList) return true
        if (
          newProposals &&
          arrivedSince(
            item,
            windowStart(
              watermarkFor(manager, role, DIGEST_KEYS.proposals),
              pace(DIGEST_KEYS.proposals),
              runStart,
            ),
          )
        ) {
          return true
        }
        return Boolean(
          newRefusals &&
            item.row.kind === 'refusal' &&
            arrivedSince(
              item,
              windowStart(
                watermarkFor(manager, role, DIGEST_KEYS.refusals),
                pace(DIGEST_KEYS.refusals),
                runStart,
              ),
            ),
        )
      })

      if (items.length) {
        openItems = { rows: items.map(toEmailRow) }
        parts.push(`${items.length} open item${items.length === 1 ? '' : 's'}`)
      }
      if (wholeList) advance.push(DIGEST_KEYS.openItems)
      if (newProposals) advance.push(DIGEST_KEYS.proposals)
      if (newRefusals) advance.push(DIGEST_KEYS.refusals)
      if (role === 'admin' && openItems) closingNote = await refusedAtTheForm(req, runStart)
    } catch (error) {
      failed += 1
      req.payload.logger.warn({
        error: error instanceof Error ? error.message : String(error),
        managerId: manager.id,
        msg: 'SendDigests: open items section failed — left out',
        role,
      })
    }
  }

  let registrations: DigestEmailProps['registrations']
  if (role === 'program' && due(DIGEST_KEYS.registrations)) {
    try {
      const since = windowStart(
        watermarkFor(manager, role, DIGEST_KEYS.registrations),
        pace(DIGEST_KEYS.registrations),
        runStart,
      )
      const groups = await registrationGroups({ managerId: manager.id, req, runStart, since })
      if (groups.length) {
        registrations = groups
        const total = groups.reduce((sum, group) => sum + group.rows.length, 0)
        parts.push(`${total} new registration${total === 1 ? '' : 's'}`)
      }
      advance.push(DIGEST_KEYS.registrations)
    } catch (error) {
      failed += 1
      req.payload.logger.warn({
        error: error instanceof Error ? error.message : String(error),
        managerId: manager.id,
        msg: 'SendDigests: registrations section failed — left out',
        role,
      })
    }
  }

  // Nothing to say is not an email.
  if (!statistics.length && !openItems && !registrations) return { advance, email: null, failed }

  const summary = parts.join(' · ')
  return {
    advance,
    email: {
      props: {
        closingNote,
        dashboardUrl: adminUrl('/'),
        date: formatLongDate(runStart.toISOString()),
        heading: MANAGER_ROLE_LABELS[role],
        notificationsUrl: adminUrl('/account'),
        openItems,
        recipientName: manager.name || null,
        registrations,
        statistics: statistics.length ? statistics : undefined,
        summary,
      },
      subject: `${MANAGER_ROLE_LABELS[role]}: ${summary}`,
    },
    failed,
  }
}
