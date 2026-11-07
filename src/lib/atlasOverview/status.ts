/**
 * What is open on one row, and how it reads.
 *
 * ⚠ **The one place a status's wording lives.** Three surfaces show the same
 * list — the program home, the region home, the admin home — and a fourth
 * mails it, so a status spelled at each would be four chances to call the same
 * state four things. Everything here is pure: no Payload, no React, no clock
 * but the one passed in, so the whole table is unit-testable and the email and
 * the homes cannot disagree.
 *
 * It owes nothing to the verification ladder's own vocabulary. `reminded`,
 * `escalated` and `urgent` are three stages and one thing a manager has to do,
 * so they are one **Overdue** status at two ranks: `urgent` is the last
 * reminder before the listing comes off the map, and that is worth jumping the
 * queue for.
 */

import type { OpenItemFilter, OpenItemPill, OpenItemStatusKey } from './filters'

import { unpublishDate, type VerificationStage } from '@/lib/eventVerification/stages'
import { formatShortDate } from '@/lib/notifications/eventDetails'

/**
 * The stages a query treats as overdue: escalated or worse.
 *
 * ⚠ **Not the same set as the **Overdue** status above, and deliberately so.**
 * That one also carries `reminded`, because a manager who has been reminded has
 * something to do — but a reminded listing is still on the map and still counts
 * as healthy, and a region manager does not join another manager's event until
 * it escalates (`docs/rules/access.md`). So: this is the set two queries share
 * — the Healthy denominator and the region-manager scope — and the status table
 * is what a reader is told. Resist merging them; the difference is the point.
 */
export const OVERDUE_QUERY_STAGES = ['escalated', 'urgent', 'expired'] as const

/**
 * Whether a listing at this stage is one of the **programs** a reader is
 * counted.
 *
 * ⚠ **One definition, because two surfaces of one page show it.** The Total
 * programs tile and the Programs column beside it read the same scope, so
 * `stage !== 'finished'` written at each is two numbers a reader can watch
 * disagree about the same set — which is what the tile did, counting finished
 * listings the column excluded.
 */
export function isProgramStage(stage: string): boolean {
  return stage !== 'finished'
}

/** Programs in a stage-keyed count map: a tile's value, and its snapshot's. */
export function countPrograms(byStage: Record<string, number | undefined>): number {
  return Object.entries(byStage).reduce(
    (sum, [stage, n]) => (isProgramStage(stage) ? sum + (n ?? 0) : sum),
    0,
  )
}

/** Where a next step leads. The URL is the reader's to spell — see the loaders. */
export interface OpenItemTarget {
  collection: 'events' | 'regions' | 'user-submissions'
  id: number
}

export interface OpenItemStatus {
  key: OpenItemStatusKey
  /** The pill's text, or the text beside the tick for `up-to-date`. */
  label: string
  pill: OpenItemPill
  /** The line under the pill. Empty where the status says everything. */
  line: string
  /** Lower comes first. `OPEN_ITEM_STATUSES` is not this order — see below. */
  rank: number
  filter: OpenItemFilter | null
  /** Counts against progress. Recommendations never do: they are advice. */
  counts: boolean
  /** A link to an edit view that already exists. No endpoint is added. */
  action: { label: string; target: OpenItemTarget } | null
  /** When this status comes due, for the within-rank order. */
  deadline?: string | null
}

/** An event as the list reads it. */
export interface OpenItemEvent {
  id: number
  title: string
  verificationStage: VerificationStage
  /** The latest version is a draft. */
  draft: boolean
  createdAt: string
  updatedAt: string
  nextCheckAt?: null | string
  /** The last date the schedule runs — a finished listing's "Ended". */
  scheduleEnd?: null | string
  /** Whether the event names a manager. */
  hasManager: boolean
  /** The stored count (`Events.qualityOpenCount`), which a list read carries. */
  qualityOpenCount: number
  /**
   * The failed checks' labels, where the reader paid for them.
   *
   * ⚠ **Absent is not zero.** `qualityOpenCount` places the row, and the
   * labels come from a second read of the page's own rows — so the line falls
   * back to the count rather than claiming nothing is wrong.
   */
  recommendations?: string[]
  /** An open proposal targeting this event. */
  proposal?: null | { changedFields: string[]; id: number; receivedAt: string }
  /** The region an admin assigns a manager on. */
  region?: null | { id: number; name: string }
  /** Nothing up the region chain manages it — an admin's row only. */
  noRegionManager?: boolean
  /**
   * The reader manages this event themselves.
   *
   * Set on a region scope alone, where it does two jobs: it is the "Your
   * programs" filter, and it is what keeps a manager's own listings out of
   * their region email — those arrive in their program email.
   */
  ownEvent?: boolean
}

/** A proposal for a class the atlas does not hold yet. */
export interface OpenItemProposal {
  id: number
  title: string
  receivedAt: string
}

/** A sign-up the spam check refused, waiting for an admin to agree or release it. */
export interface OpenItemRefusal {
  id: number
  title: string
  /** What screening concluded, already in a reader's words. */
  reason: string
  receivedAt: string
}

export type OpenItemRow =
  | ({ kind: 'event' } & OpenItemEvent)
  | ({ kind: 'proposal' } & OpenItemProposal)
  | ({ kind: 'refusal' } & OpenItemRefusal)

/** One row, with every status it has and the one that places it. */
export interface OpenItem {
  row: OpenItemRow
  statuses: OpenItemStatus[]
  /** The lowest rank among `statuses`. */
  rank: number
  /** The soonest deadline among the statuses at `rank`, if any. */
  deadline: null | string
  /** How long the row has been waiting, for the last tiebreak. */
  since: string
  /** Whether this row counts against progress. */
  counts: boolean
}

const shortDate = (iso: null | string | undefined): string =>
  iso ? formatShortDate(iso) || '' : ''

/** "· no region manager" on an admin's row, and nothing on anyone else's. */
function regionNote(event: OpenItemEvent): string {
  return event.noRegionManager ? ' · no region manager' : ''
}

/**
 * The overdue row's next step.
 *
 * An admin's is "Add region manager" on the region, because the thing an admin
 * can actually move is who looks after the area — nobody is going to verify a
 * listing for a manager who does not exist. Everyone else verifies the event,
 * which a republish does (`Events/hooks/syncVerificationOnSave.ts`) and which
 * the event page's own banner already asks for.
 */
function overdueAction(event: OpenItemEvent): OpenItemStatus['action'] {
  if (event.noRegionManager && event.region) {
    return { label: 'Add region manager', target: { collection: 'regions', id: event.region.id } }
  }
  return { label: 'Verify', target: { collection: 'events', id: event.id } }
}

/** The statuses an event row has, in no particular order. */
function eventStatuses(event: OpenItemEvent, now: Date): OpenItemStatus[] {
  const statuses: OpenItemStatus[] = []
  const stage = event.verificationStage

  if (stage === 'finished') {
    statuses.push({
      key: 'finished',
      label: 'Finished',
      pill: 'light-gray',
      line: event.scheduleEnd ? `Ended ${shortDate(event.scheduleEnd)}` : 'The schedule has ended',
      rank: 8,
      filter: null,
      counts: false,
      action: null,
    })
    return statuses
  }

  if (stage === 'urgent' || stage === 'reminded' || stage === 'escalated') {
    const due = unpublishDate(stage, now).toISOString()
    statuses.push({
      key: 'overdue',
      label: 'Overdue',
      pill: 'error',
      line: `Unpublishes ${shortDate(due)}${regionNote(event)}`,
      // `urgent` is the last reminder before the listing comes off the map, so
      // it outranks everything — including a proposal somebody is waiting on.
      rank: stage === 'urgent' ? 0 : 2,
      filter: 'overdue',
      counts: true,
      action: overdueAction(event),
      deadline: due,
    })
  }

  if (event.proposal) {
    statuses.push({
      key: 'change-proposed',
      label: 'Change proposed',
      pill: 'success',
      line: [
        event.proposal.changedFields.join(', '),
        `received ${shortDate(event.proposal.receivedAt)}`,
      ]
        .filter(Boolean)
        .join(' · '),
      rank: 1,
      filter: 'review',
      counts: true,
      action: {
        label: 'Review',
        target: { collection: 'user-submissions', id: event.proposal.id },
      },
      deadline: event.proposal.receivedAt,
    })
  }

  // `denied` is excluded: the community voted it off the map, so adopting it is
  // not the next step and listing it as unmanaged would ask for one.
  if (stage === 'unverified' && !event.hasManager) {
    statuses.push({
      key: 'no-manager',
      label: 'No manager',
      pill: 'warning',
      line: `Added ${shortDate(event.createdAt)}${regionNote(event)}`,
      rank: 3,
      filter: 'no-manager',
      counts: true,
      action:
        event.noRegionManager && event.region
          ? { label: 'Add region manager', target: { collection: 'regions', id: event.region.id } }
          : { label: 'Assign manager', target: { collection: 'events', id: event.id } },
      deadline: null,
    })
  }

  if (event.qualityOpenCount > 0) {
    const count = event.qualityOpenCount
    statuses.push({
      key: 'recommendations',
      label: `${count} recommendation${count === 1 ? '' : 's'}`,
      pill: 'always-white',
      line: event.recommendations?.length
        ? event.recommendations.join(', ')
        : `${count} thing${count === 1 ? '' : 's'} would make this listing easier to find`,
      rank: 4,
      filter: 'recommendations',
      // Advice, never a deadline: counting it would mean a manager who did
      // everything asked of them still read "80% on track".
      counts: false,
      action: { label: 'Improve listing', target: { collection: 'events', id: event.id } },
    })
  }

  if (event.draft) {
    statuses.push({
      key: 'draft',
      label: 'Draft',
      pill: 'light-gray',
      line: `Last edited ${shortDate(event.updatedAt)}`,
      rank: 5,
      filter: 'review',
      counts: true,
      action: { label: 'Continue editing', target: { collection: 'events', id: event.id } },
    })
  }

  if (stage === 'expired') {
    statuses.push({
      key: 'expired',
      label: 'Expired',
      pill: 'error',
      line: event.nextCheckAt
        ? `Deleted on ${shortDate(event.nextCheckAt)}${regionNote(event)}`
        : `Unpublished${regionNote(event)}`,
      rank: 6,
      filter: 'overdue',
      counts: true,
      action: overdueAction(event),
      deadline: event.nextCheckAt ?? null,
    })
  }

  if (statuses.length === 0) {
    statuses.push({
      key: 'up-to-date',
      label: 'Up to date',
      pill: 'check',
      line: event.nextCheckAt ? `Next check ${shortDate(event.nextCheckAt)}` : '',
      rank: 7,
      filter: null,
      counts: false,
      action: null,
    })
  }

  return statuses
}

/**
 * Every status a row has.
 *
 * A row shows all of them and is placed by the lowest rank, because an event
 * can be two problems at once and hiding one behind the other is how the
 * second never gets fixed.
 */
export function openItemStatus(row: OpenItemRow, now: Date): OpenItemStatus[] {
  if (row.kind === 'event') return eventStatuses(row, now)

  if (row.kind === 'proposal') {
    return [
      {
        key: 'class-proposed',
        label: 'New class proposed',
        pill: 'success',
        line: `Received ${shortDate(row.receivedAt)}`,
        rank: 1,
        filter: 'review',
        counts: true,
        action: { label: 'Review', target: { collection: 'user-submissions', id: row.id } },
        deadline: row.receivedAt,
      },
    ]
  }

  return [
    {
      key: 'confirmed-spam-pending',
      label: 'Flagged as spam',
      pill: 'success',
      line: [row.reason, shortDate(row.receivedAt)].filter(Boolean).join(' · '),
      rank: 1,
      // In no filter: an admin's list is the only one that holds these, and a
      // tab for one kind of row would read as a fifth kind of problem.
      filter: null,
      counts: true,
      action: { label: 'Review', target: { collection: 'user-submissions', id: row.id } },
      deadline: row.receivedAt,
    },
  ]
}

/** When the row first needed somebody, for the last tiebreak. */
function waitingSince(row: OpenItemRow): string {
  return row.kind === 'event' ? row.createdAt : row.receivedAt
}

/** One row with its statuses resolved and its sort keys derived. */
export function openItem(row: OpenItemRow, now: Date): OpenItem {
  const statuses = openItemStatus(row, now)
  const rank = Math.min(...statuses.map((status) => status.rank))
  const deadlines = statuses
    .filter((status) => status.rank === rank && status.deadline)
    .map((status) => status.deadline as string)
    .sort()
  return {
    row,
    statuses,
    rank,
    deadline: deadlines[0] ?? null,
    since: waitingSince(row),
    counts: statuses.some((status) => status.counts),
  }
}

/**
 * Most urgent first: by rank, then the soonest deadline, then the longest wait.
 *
 * A row with no deadline at a rank sorts after the ones that have one — a
 * listing nobody has adopted is not on a clock, and a listing that is should
 * not be pushed down the page by it.
 */
export function sortOpenItems(items: OpenItem[]): OpenItem[] {
  return [...items].sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.deadline ?? '￿').localeCompare(b.deadline ?? '￿') ||
      a.since.localeCompare(b.since),
  )
}

/** Which filters a row belongs to. */
export function openItemFilters(item: OpenItem): OpenItemFilter[] {
  return [
    ...new Set(
      item.statuses
        .map((status) => status.filter)
        .filter((filter): filter is OpenItemFilter => filter !== null),
    ),
  ]
}

export interface OverviewProgress {
  /** Rows that count against progress — "N to go". */
  open: number
  /** Everything that could have been open. */
  total: number
  /** Whole per cent, 100 when there is nothing to do. */
  percent: number
  /** The line both the home and the email show. */
  label: string
}

/**
 * How much of the scope is on track.
 *
 * ⚠ **`total` is not the row count.** It is what the scope holds that could
 * need something — its unfinished events, plus the new-class proposals a
 * region manager is asked about — so a change proposal is counted on the event
 * it changes rather than as a second thing to do. Recommendations are outside
 * both halves: `counts: false` keeps them out of `open`, and nothing adds them
 * to `total`.
 */
export function overviewProgress(open: number, total: number): OverviewProgress {
  const percent = total > 0 ? Math.round(((total - open) / total) * 100) : 100
  return {
    open,
    total,
    percent,
    label: `${percent}% on track · ${open} to go`,
  }
}
