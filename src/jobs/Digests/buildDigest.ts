import type { PayloadRequest } from 'payload'

import {
  isSummaryFrequency,
  type NotificationKey,
  notificationFrequency,
  type SummaryFrequency,
} from '@/components/admin/NotificationPreferences/config'
import type {
  DigestEmailProps,
  DigestTileBlock,
  ItemTableRow,
  StatusPillStyle,
} from '@/emails/DigestEmail'
import { changeLabel } from '@/lib/atlasOverview/filters'
import { loadOpenItems } from '@/lib/atlasOverview/openItems'
import { SPAM_SIGNUPS_PATH, spamSignups } from '@/lib/atlasOverview/refusals'
import type { OverviewScope } from '@/lib/atlasOverview/scope'
import { loadStatistics, type StatTile } from '@/lib/atlasOverview/statistics'
import type { OpenItem, OpenItemStatus } from '@/lib/atlasOverview/status'
import { formatLongDate } from '@/lib/notifications'
import type { ManagerRole } from '@/lib/notifications/managerRoles'
import { adminDocUrl, adminUrl } from '@/lib/utilities/adminUrl'
import type { Manager } from '@/payload-types'

import { registrationGroups } from './registrations'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * When each pace sends, and how far back its window reaches with no watermark.
 *
 * ⚠ **One schedule, three paces**, decided from the same 07:00 UTC run: three
 * schedules would send a Weekly manager two emails on a Monday the 1st. Both
 * anchors are absolute — Monday, and the 1st — never "seven days since the last
 * one", which drifts on every missed run.
 *
 * ⚠ **Keyed by `SummaryFrequency`**, so a fourth cadence fails `tsc` here rather
 * than leaving every manager who picks it unmailed. `Immediate`, `Never` and a
 * retired pace are in no row, so are never due.
 */
const PACES: Record<SummaryFrequency, { days: number; due(now: Date): boolean }> = {
  Daily: { days: 1, due: () => true },
  Weekly: { days: 7, due: (now) => now.getUTCDay() === 1 },
  Monthly: { days: 30, due: (now) => now.getUTCDate() === 1 },
}

const paceOf = (frequency: string) => (isSummaryFrequency(frequency) ? PACES[frequency] : null)

export const isDue = (frequency: string, now: Date): boolean => paceOf(frequency)?.due(now) ?? false

/**
 * The start of a pace's window: the watermark, or one period back, whichever is
 * later.
 *
 * ⚠ **Clamped, and the clamp is the point.** A section turned back on after six
 * months would otherwise carry half a year of items labelled "new".
 */
export function windowStart(
  watermark: null | string | undefined,
  frequency: string,
  runStart: Date,
): Date {
  const floor = new Date(runStart.getTime() - (paceOf(frequency)?.days ?? 1) * DAY_MS)
  const mark = new Date(watermark ?? NaN)
  return mark > floor ? mark : floor
}

/** The month a statistics section is named for, e.g. "November". */
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })

/** What each role is called in a digest's heading and subject. */
const ROLE_LABELS: Record<ManagerRole, string> = {
  program: 'Your programs',
  region: 'Your regions',
  admin: 'Sahaj Atlas',
}

/** One role's email, plus what the run needs to record afterwards. */
export interface BuiltDigest {
  /** Preference keys whose watermark this send advances. */
  advance: string[]
  /**
   * `null` when nothing was due or nothing had anything to say.
   *
   * ⚠ **A null email still advances its watermarks**, or a quiet or muted
   * section would arrive as everything since the last send (#1052).
   */
  email: DigestEmailProps | null
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
  const { placing } = item
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
    line: placing.line || undefined,
    statuses: item.statuses.map((status) => ({ pillStyle: pillFor(status), text: status.label })),
    title: item.row.title,
  }
}

const tileText = (tile: StatTile) => ({
  change: tile.change === null ? null : changeLabel(tile.change),
  label: tile.label,
  of: tile.of === undefined ? null : String(tile.of),
  value: String(tile.value),
})

/** A proposal or refusal that arrived inside the window, for a "new since" section. */
function arrivedSince(item: OpenItem, since: Date): boolean {
  const at = item.row.kind === 'event' ? item.row.proposal?.receivedAt : item.row.receivedAt
  return at !== undefined && at !== null && new Date(at) > since
}

/** Sign-ups filed as spam in the last week — an admin's closing line. */
async function spamNote(
  req: PayloadRequest,
  now: Date,
): Promise<null | { href: string; text: string }> {
  const spam = await spamSignups({ now, overrideAccess: true, req })
  if (!spam) return null
  return { href: adminUrl(SPAM_SIGNUPS_PATH), text: spam.text }
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
  const pace = (key: NotificationKey) => notificationFrequency(prefs, key)
  const due = (key: NotificationKey) => isDue(pace(key), runStart)
  /** A section's "new since" bound: its watermark, or one period back. */
  const since = (key: NotificationKey) =>
    windowStart(manager.digestWatermarks?.[role]?.[key], pace(key), runStart)

  const scope: OverviewScope = role === 'admin' ? { role } : { managerId: manager.id, role }
  const advance: string[] = []
  const parts: string[] = []
  let failed = 0

  /**
   * ⚠ **One wrapper, because `failed` rides out in the task's output.** A
   * per-section catch is one copy-paste from a green job row over an email
   * silently short a section.
   */
  const section = async (name: string, run: () => Promise<void>): Promise<void> => {
    try {
      await run()
    } catch (error) {
      failed += 1
      req.payload.logger.warn({
        error: error instanceof Error ? error.message : String(error),
        managerId: manager.id,
        msg: `SendDigests: ${name} section failed — left out`,
        role,
      })
    }
  }

  const statistics: DigestTileBlock[] = []
  if (due('statistics')) {
    await section('statistics', async () => {
      const stats = await loadStatistics({ now: runStart, overrideAccess: true, req, scope })
      if (stats.health.length) {
        statistics.push({ heading: 'Verification health', tiles: stats.health.map(tileText) })
      }
      // No Most registered in email: a tile naming one listing is a thing to
      // click, and this is the one surface where clicking costs a page load.
      statistics.push({ heading: 'Analytics', tiles: stats.analytics.map(tileText) })
      advance.push('statistics')
      parts.push(`${MONTH.format(runStart)} analytics`)
    })
  }

  let openItems: DigestEmailProps['openItems']
  let closingNote: DigestEmailProps['closingNote'] = null
  const wholeList = due('open_items')
  const newProposals = due('new_proposals')
  const newRefusals = role === 'admin' && due('refused_signups')

  if (wholeList || newProposals || newRefusals) {
    await section('open items', async () => {
      const result = await loadOpenItems({ now: runStart, overrideAccess: true, req, scope })
      const items = result.items.filter((item) => {
        // A region email leaves out the manager's own listings: those are the
        // program email's, and one manager holding both roles would otherwise
        // read every one of them twice.
        if (role === 'region' && item.row.kind === 'event' && item.row.ownEvent) return false
        if (wholeList) return true
        if (newProposals && arrivedSince(item, since('new_proposals'))) return true
        return Boolean(
          newRefusals &&
          item.row.kind === 'refusal' &&
          arrivedSince(item, since('refused_signups')),
        )
      })

      if (items.length) {
        openItems = { rows: items.map(toEmailRow) }
        parts.push(`${items.length} open item${items.length === 1 ? '' : 's'}`)
      }
      if (wholeList) advance.push('open_items')
      if (newProposals) advance.push('new_proposals')
      if (newRefusals) advance.push('refused_signups')
      if (role === 'admin' && openItems) closingNote = await spamNote(req, runStart)
    })
  }

  let registrations: DigestEmailProps['registrations']
  if (role === 'program' && due('event_registration')) {
    await section('registrations', async () => {
      const groups = await registrationGroups({
        managerId: manager.id,
        req,
        runStart,
        since: since('event_registration'),
      })
      if (groups.length) {
        registrations = groups
        const total = groups.reduce((sum, group) => sum + group.rows.length, 0)
        parts.push(`${total} new registration${total === 1 ? '' : 's'}`)
      }
      advance.push('event_registration')
    })
  }

  // Nothing to say is not an email.
  if (!statistics.length && !openItems && !registrations) return { advance, email: null, failed }

  return {
    advance,
    email: {
      closingNote,
      dashboardUrl: adminUrl('/'),
      date: formatLongDate(runStart.toISOString()),
      heading: ROLE_LABELS[role],
      notificationsUrl: adminUrl('/account'),
      openItems,
      recipientName: manager.name || null,
      registrations,
      statistics: statistics.length ? statistics : undefined,
      summary: parts.join(' · '),
    },
    failed,
  }
}
