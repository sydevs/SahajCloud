/**
 * What is open on one row, and how it reads.
 *
 * ⚠ **The one place a status's wording lives** — three homes and the digest
 * show the same list. Pure, with no clock but the one passed in.
 *
 * `reminded`, `escalated` and `urgent` are one **Overdue** status; `urgent`
 * ranks first because it is the last reminder before unpublishing.
 */

import type { OpenItemFilter, OpenItemPill } from './filters'

import { unpublishDate, type VerificationStage } from '@/lib/eventVerification/stages'
import { formatShortDate } from '@/lib/notifications/eventDetails'

/**
 * The stages a query treats as overdue: escalated or worse.
 *
 * ⚠ **Deliberately narrower than the Overdue status**, which also carries
 * `reminded`: a reminded listing still counts as healthy, and a region manager
 * does not join another manager's event until it escalates
 * (`docs/rules/access.md`). Resist merging them.
 */
export const OVERDUE_QUERY_STAGES = ['escalated', 'urgent', 'expired'] as const

/** ⚠ One definition, so the Total programs tile and the Programs column agree. */
export function isProgramStage(stage: string): boolean {
  return stage !== 'finished'
}

/** Programs in a stage-keyed count map. */
export function countPrograms(byStage: Record<string, number | undefined>): number {
  return Object.entries(byStage).reduce(
    (sum, [stage, n]) => (isProgramStage(stage) ? sum + (n ?? 0) : sum),
    0,
  )
}

export interface OpenItemTarget {
  collection: 'events' | 'regions' | 'user-submissions'
  id: number
}

export interface OpenItemStatus {
  key: OpenItemStatusKey
  /** The pill's text, or the text beside the tick for `up-to-date`. */
  label: string
  pill: OpenItemPill
  /** The line under the pill. */
  line: string
  /** Lower comes first. */
  rank: number
  filter: OpenItemFilter | null
  /** Counts against progress. Recommendations never do: they are advice. */
  counts: boolean
  action: { label: string; target: OpenItemTarget } | null
  /** When this status comes due, for the within-rank order. */
  deadline?: string | null
}

export interface OpenItemEvent {
  id: number
  title: string
  verificationStage: VerificationStage
  /** The latest version is a draft. */
  draft: boolean
  createdAt: string
  updatedAt: string
  nextCheckAt?: null | string
  scheduleEnd?: null | string
  hasManager: boolean
  qualityOpenCount: number
  /** ⚠ Absent is not zero: the labels are read for the page alone, so the line falls back to the count. */
  recommendations?: string[]
  proposal?: null | { changedFields: string[]; id: number; receivedAt: string }
  /** On an admin's row, the region nothing up the chain manages. */
  unmanagedRegionId?: number
  /** A region scope's "Your programs", which the region email also leaves out. */
  ownEvent?: boolean
}

export type OpenItemRow =
  | ({ kind: 'event' } & OpenItemEvent)
  | { kind: 'proposal'; id: number; title: string; receivedAt: string }
  | { kind: 'refusal'; id: number; title: string; reason: string; receivedAt: string }

/** One row, with every status it has and the one that places it. */
export interface OpenItem {
  row: OpenItemRow
  statuses: OpenItemStatus[]
  /** The status at the lowest rank. */
  placing: OpenItemStatus
  rank: number
  /** The soonest deadline among the statuses at `rank`. */
  deadline: null | string
  since: string
  counts: boolean
  filters: OpenItemFilter[]
}

const shortDate = (iso: null | string | undefined): string =>
  iso ? formatShortDate(iso) || '' : ''

/** What a status is, whichever row carries it. Overdue's rank is `reminded`'s; `urgent` jumps to 0. */
const STATUS_TABLE = {
  overdue: { label: 'Overdue', pill: 'error', rank: 2, filter: 'overdue', counts: true },
  'change-proposed': {
    label: 'Change proposed',
    pill: 'success',
    rank: 1,
    filter: 'review',
    counts: true,
  },
  'class-proposed': {
    label: 'New class proposed',
    pill: 'success',
    rank: 1,
    filter: 'review',
    counts: true,
  },
  // In no filter: only an admin's list holds these.
  'confirmed-spam-pending': {
    label: 'Flagged as spam',
    pill: 'success',
    rank: 1,
    filter: null,
    counts: true,
  },
  'no-manager': {
    label: 'No manager',
    pill: 'warning',
    rank: 3,
    filter: 'no-manager',
    counts: true,
  },
  // Advice, never a deadline.
  recommendations: {
    label: 'Recommendations',
    pill: 'always-white',
    rank: 4,
    filter: 'recommendations',
    counts: false,
  },
  draft: { label: 'Draft', pill: 'light-gray', rank: 5, filter: 'review', counts: true },
  expired: { label: 'Expired', pill: 'error', rank: 6, filter: 'overdue', counts: true },
  'up-to-date': { label: 'Up to date', pill: 'check', rank: 7, filter: null, counts: false },
  finished: { label: 'Finished', pill: 'light-gray', rank: 8, filter: null, counts: false },
} satisfies Record<string, Pick<OpenItemStatus, 'counts' | 'filter' | 'label' | 'pill' | 'rank'>>

export type OpenItemStatusKey = keyof typeof STATUS_TABLE

function status(
  key: OpenItemStatusKey,
  own: Pick<OpenItemStatus, 'action' | 'line'> &
    Partial<Pick<OpenItemStatus, 'deadline' | 'label' | 'rank'>>,
): OpenItemStatus {
  return { key, ...STATUS_TABLE[key], ...own }
}

function regionNote(event: OpenItemEvent): string {
  return event.unmanagedRegionId === undefined ? '' : ' · no region manager'
}

/** An admin's next step: nobody will verify a listing for a manager who does not exist. */
function addRegionManager(event: OpenItemEvent): OpenItemStatus['action'] {
  return event.unmanagedRegionId === undefined
    ? null
    : {
        label: 'Add region manager',
        target: { collection: 'regions', id: event.unmanagedRegionId },
      }
}

const eventAction = (event: OpenItemEvent, label: string): OpenItemStatus['action'] => ({
  label,
  target: { collection: 'events', id: event.id },
})

function eventStatuses(event: OpenItemEvent, now: Date): OpenItemStatus[] {
  const stage = event.verificationStage

  if (stage === 'finished') {
    return [
      status('finished', {
        line: event.scheduleEnd
          ? `Ended ${shortDate(event.scheduleEnd)}`
          : 'The schedule has ended',
        action: null,
      }),
    ]
  }

  const statuses: OpenItemStatus[] = []

  if (stage === 'urgent' || stage === 'reminded' || stage === 'escalated') {
    const due = unpublishDate(stage, now).toISOString()
    statuses.push(
      status('overdue', {
        line: `Unpublishes ${shortDate(due)}${regionNote(event)}`,
        ...(stage === 'urgent' && { rank: 0 }),
        action: addRegionManager(event) ?? eventAction(event, 'Verify'),
        deadline: due,
      }),
    )
  }

  if (event.proposal) {
    statuses.push(
      status('change-proposed', {
        line: [
          event.proposal.changedFields.join(', '),
          `received ${shortDate(event.proposal.receivedAt)}`,
        ]
          .filter(Boolean)
          .join(' · '),
        action: {
          label: 'Review',
          target: { collection: 'user-submissions', id: event.proposal.id },
        },
        deadline: event.proposal.receivedAt,
      }),
    )
  }

  // Not `denied`: the community voted it off the map, so adopting it is not the next step.
  if (stage === 'unverified' && !event.hasManager) {
    statuses.push(
      status('no-manager', {
        line: `Added ${shortDate(event.createdAt)}${regionNote(event)}`,
        action: addRegionManager(event) ?? eventAction(event, 'Assign manager'),
        deadline: null,
      }),
    )
  }

  if (event.qualityOpenCount > 0) {
    const count = event.qualityOpenCount
    statuses.push(
      status('recommendations', {
        label: `${count} recommendation${count === 1 ? '' : 's'}`,
        line: event.recommendations?.length
          ? event.recommendations.join(', ')
          : `${count} thing${count === 1 ? '' : 's'} would make this listing easier to find`,
        action: eventAction(event, 'Improve listing'),
      }),
    )
  }

  if (event.draft) {
    statuses.push(
      status('draft', {
        line: `Last edited ${shortDate(event.updatedAt)}`,
        action: eventAction(event, 'Continue editing'),
      }),
    )
  }

  if (stage === 'expired') {
    statuses.push(
      status('expired', {
        line: event.nextCheckAt
          ? `Deleted on ${shortDate(event.nextCheckAt)}${regionNote(event)}`
          : `Unpublished${regionNote(event)}`,
        action: addRegionManager(event) ?? eventAction(event, 'Verify'),
        deadline: event.nextCheckAt ?? null,
      }),
    )
  }

  if (statuses.length === 0) {
    statuses.push(
      status('up-to-date', {
        line: event.nextCheckAt ? `Next check ${shortDate(event.nextCheckAt)}` : '',
        action: null,
      }),
    )
  }

  return statuses
}

/**
 * One row with every status it has, placed by the lowest rank — an event can
 * be two problems at once, and hiding one is how it never gets fixed.
 */
export function openItem(row: OpenItemRow, now: Date): OpenItem {
  const review = {
    label: 'Review',
    target: { collection: 'user-submissions' as const, id: row.id },
  }
  const statuses =
    row.kind === 'event'
      ? eventStatuses(row, now)
      : row.kind === 'proposal'
        ? [
            status('class-proposed', {
              line: `Received ${shortDate(row.receivedAt)}`,
              action: review,
              deadline: row.receivedAt,
            }),
          ]
        : [
            status('confirmed-spam-pending', {
              line: [row.reason, shortDate(row.receivedAt)].filter(Boolean).join(' · '),
              action: review,
              deadline: row.receivedAt,
            }),
          ]

  const rank = Math.min(...statuses.map((s) => s.rank))
  const deadlines = statuses
    .filter((s) => s.rank === rank && s.deadline)
    .map((s) => s.deadline as string)
    .sort()
  return {
    row,
    statuses,
    placing: statuses.find((s) => s.rank === rank)!,
    rank,
    deadline: deadlines[0] ?? null,
    since: row.kind === 'event' ? row.createdAt : row.receivedAt,
    counts: statuses.some((s) => s.counts),
    filters: [...new Set(statuses.flatMap((s) => (s.filter === null ? [] : [s.filter])))],
  }
}

/**
 * Most urgent first: by rank, then the soonest deadline, then the longest wait.
 * A row with no deadline sorts after those with one at its rank.
 */
export function sortOpenItems(items: OpenItem[]): OpenItem[] {
  return [...items].sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.deadline ?? '￿').localeCompare(b.deadline ?? '￿') ||
      a.since.localeCompare(b.since),
  )
}

export interface OverviewProgress {
  /** Rows that count against progress — "N to go". */
  open: number
  total: number
  /** Whole per cent, 100 when there is nothing to do. */
  percent: number
  /** The meter's line on the home. */
  label: string
}

/**
 * How much of the scope is on track.
 *
 * ⚠ **`total` is not the row count**: it is the scope's unfinished events plus
 * new-class proposals, so a change proposal counts on the event it changes.
 */
export function overviewProgress(open: number, total: number): OverviewProgress {
  const percent = total > 0 ? Math.round(((total - open) / total) * 100) : 100
  return { open, total, percent, label: `${percent}% on track · ${open} to go` }
}
