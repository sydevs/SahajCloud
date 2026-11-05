import type { PayloadRequest } from 'payload'

import {
  type NotificationKey,
  notificationFrequency,
} from '@/components/admin/NotificationPreferences/config'
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
import { refusedAtTheForm } from '@/lib/atlasOverview/refusals'
import { changeLabel } from '@/lib/atlasOverview/statistics'
import { formatLongDate } from '@/lib/notifications'
import { type ManagerRole, MANAGER_ROLE_LABELS } from '@/lib/notifications/managerRoles'
import { adminDocUrl, adminUrl } from '@/lib/utilities/adminUrl'
import type { Manager } from '@/payload-types'

import { isDue, windowStart } from './due'
import { registrationGroups } from './registrations'
import { watermarkFor } from './watermarks'

/** How far back an admin's closing line counts sign-ups the form turned away. */

/**
 * The preference keys a digest reads, each its own section or part of one.
 *
 * Typed against the vocabulary rather than inferred, so a typo here is a
 * compile error instead of a section that resolves to `Never` and never sends.
 */
export const DIGEST_KEYS: Record<string, NotificationKey> = {
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
  change: tile.change === null ? null : changeLabel(tile.change),
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
  const at = item.row.kind === 'event' ? item.row.proposal?.receivedAt : item.row.receivedAt
  return at !== undefined && at !== null && new Date(at) > since
}

/**
 * Sign-ups the form turned away in the last week — an admin's closing line.
 *
 * Counted from `registration-refusals` at stage `request`, which is an hourly
 * counter rather than a row per refusal: anyone holding the published widget
 * key can be refused for free, so a flood moves a number.
 */
async function refusalNote(
  req: PayloadRequest,
  now: Date,
): Promise<null | { href: string; text: string }> {
  const refused = await refusedAtTheForm({ now, overrideAccess: true, req })
  if (!refused) return null
  return { href: adminUrl('/collections/registration-refusals'), text: refused.text }
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

  const scope = scopeFor(role, manager.id)
  const advance: string[] = []
  const parts: string[] = []
  let failed = 0

  /**
   * Run one section, counting and skipping a failure rather than letting it
   * empty the email.
   *
   * ⚠ **One wrapper, because `failed` is what rides out in the task's output.**
   * Written per section, a fourth was one copy-paste away from catching an
   * error without counting it — and the job row would then read green while the
   * email was silently short a section, which is the failure this rule exists
   * to prevent.
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

  /** A section's "new since" bound: its watermark, or one period back. */
  const since = (key: NotificationKey) =>
    windowStart(watermarkFor(manager, role, key), pace(key), runStart)

  const statistics: DigestTileBlock[] = []
  if (due(DIGEST_KEYS.statistics)) {
    await section('statistics', async () => {
      const stats = await loadStatistics({ now: runStart, overrideAccess: true, req, scope })
      if (stats.health.length) {
        statistics.push({ heading: 'Verification health', tiles: stats.health.map(tileText) })
      }
      // No Most registered in email: a tile naming one listing is a thing to
      // click, and this is the one surface where clicking costs a page load.
      statistics.push({ heading: 'Analytics', tiles: stats.analytics.map(tileText) })
      advance.push(DIGEST_KEYS.statistics)
      parts.push(
        `${formatLongDate(runStart.toISOString()).split(' ').slice(1).join(' ')} analytics`,
      )
    })
  }

  let openItems: DigestEmailProps['openItems']
  let closingNote: DigestEmailProps['closingNote'] = null
  const wholeList = due(DIGEST_KEYS.openItems)
  const newProposals = due(DIGEST_KEYS.proposals)
  const newRefusals = role === 'admin' && due(DIGEST_KEYS.refusals)

  if (wholeList || newProposals || newRefusals) {
    await section('open items', async () => {
      const result = await loadOpenItems({ now: runStart, overrideAccess: true, req, scope })
      const items = result.items.filter((item) => {
        // A region email leaves out the manager's own listings: those are the
        // program email's, and one manager holding both roles would otherwise
        // read every one of them twice.
        if (role === 'region' && item.row.kind === 'event' && item.row.ownEvent) return false
        if (wholeList) return true
        if (newProposals && arrivedSince(item, since(DIGEST_KEYS.proposals))) return true
        return Boolean(
          newRefusals &&
          item.row.kind === 'refusal' &&
          arrivedSince(item, since(DIGEST_KEYS.refusals)),
        )
      })

      if (items.length) {
        openItems = { rows: items.map(toEmailRow) }
        parts.push(`${items.length} open item${items.length === 1 ? '' : 's'}`)
      }
      if (wholeList) advance.push(DIGEST_KEYS.openItems)
      if (newProposals) advance.push(DIGEST_KEYS.proposals)
      if (newRefusals) advance.push(DIGEST_KEYS.refusals)
      if (role === 'admin' && openItems) closingNote = await refusalNote(req, runStart)
    })
  }

  let registrations: DigestEmailProps['registrations']
  if (role === 'program' && due(DIGEST_KEYS.registrations)) {
    await section('registrations', async () => {
      const groups = await registrationGroups({
        managerId: manager.id,
        req,
        runStart,
        since: since(DIGEST_KEYS.registrations),
      })
      if (groups.length) {
        registrations = groups
        const total = groups.reduce((sum, group) => sum + group.rows.length, 0)
        parts.push(`${total} new registration${total === 1 ? '' : 's'}`)
      }
      advance.push(DIGEST_KEYS.registrations)
    })
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
