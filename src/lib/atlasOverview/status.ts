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

/** ⚠ One definition, so the Total events tile and the Programs column agree. */
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
  collection: 'clients' | 'events' | 'regions' | 'user-submissions'
  id: number
  /** A document view of its own, e.g. a service's Install tab. */
  view?: 'install'
}

export interface OpenItemStatus {
  key: OpenItemStatusKey
  /** The pill's text, or the text beside the tick for `up-to-date`. */
  label: string
  pill: OpenItemPill
  /** What the pill means here, one fact per line; a row shows only its placing status's. */
  lines: string[]
  /** Lower comes first. */
  rank: number
  filter: OpenItemFilter | null
  /** Counts against progress. Recommendations never do: they are advice. */
  counts: boolean
  action: { label: string; target: OpenItemTarget } | null
  /** The email's sentence for this row, where it depends on the row rather than the status. */
  prompt?: ActionPrompt
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
  /** "7:00 PM, Tuesdays, Vancouver" — when and where the event meets. */
  timing?: string
  hasManager: boolean
  qualityOpenCount: number
  /** ⚠ Absent is not zero: the labels are read for the page alone, so the line falls back to the count. */
  recommendations?: string[]
  proposal?: null | { changedFields: string[]; id: number; receivedAt: string }
  /** On an admin's row, the region nothing up the chain manages. */
  unmanagedRegionId?: number
  /** A region scope's "Your events", which the region email also leaves out. */
  ownEvent?: boolean
}

export type OpenItemRow =
  | ({ kind: 'event' } & OpenItemEvent)
  | { kind: 'proposal'; id: number; title: string; receivedAt: string }
  | { kind: 'refusal'; id: number; title: string; reason: string; receivedAt: string }
  | {
      kind: 'service'
      id: number
      title: string
      /** When the check this row reports last ran. */
      checkedAt: string
      /** Nightly checks in a row that did not find the map; 0 when the last one did. */
      misses: number
      /** The page the map belongs on. */
      pageUrl: null | string
      /** Whether the site still holds its region's links, which the third miss releases. */
      owned: boolean
      /** When the misses released the region, or `null`. */
      releasedAt: null | string
    }

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

/** How many changed fields a line names before it counts the rest. */
const FIELDS_NAMED = 3

/** "Address, Schedule, Title +2 more" — a proposal's top-level fields, kept to one short line. */
function fieldList(fields: string[]): string {
  const more = fields.length - FIELDS_NAMED
  return fields.slice(0, FIELDS_NAMED).join(', ') + (more > 0 ? ` +${more} more` : '')
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
    label: 'New event proposed',
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
  // In no filter: a service row sits only in a service's and an admin's list.
  // Ranked with Overdue: visitors to the site see no map at all.
  'map-not-found': {
    label: 'Map not found',
    pill: 'error',
    rank: 2,
    filter: null,
    counts: true,
  },
  'search-problem': {
    label: 'Search problem',
    pill: 'warning',
    rank: 3,
    filter: null,
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
  own: Pick<OpenItemStatus, 'action' | 'lines'> &
    Partial<Pick<OpenItemStatus, 'deadline' | 'label' | 'prompt' | 'rank'>>,
): OpenItemStatus {
  return { key, ...STATUS_TABLE[key], ...own }
}

function regionNote(event: OpenItemEvent): string[] {
  return event.unmanagedRegionId === undefined ? [] : ['No region manager']
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
        lines: [
          event.scheduleEnd ? `Ended ${shortDate(event.scheduleEnd)}` : 'The schedule has ended',
        ],
        action: null,
      }),
    ]
  }

  const statuses: OpenItemStatus[] = []

  if (stage === 'urgent' || stage === 'reminded' || stage === 'escalated') {
    // ⚠ From the stage's own check, not from now: the ladder's offsets start when it comes due.
    const due = unpublishDate(
      stage,
      event.nextCheckAt ? new Date(event.nextCheckAt) : now,
    ).toISOString()
    statuses.push(
      status('overdue', {
        lines: [`Unpublishes ${shortDate(due)}`, ...regionNote(event)],
        ...(stage === 'urgent' && { rank: 0 }),
        action: addRegionManager(event) ?? eventAction(event, 'Verify'),
        deadline: due,
      }),
    )
  }

  if (event.proposal) {
    statuses.push(
      status('change-proposed', {
        lines: [
          fieldList(event.proposal.changedFields),
          `Received ${shortDate(event.proposal.receivedAt)}`,
        ].filter(Boolean),
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
        lines: regionNote(event),
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
        lines: [
          event.recommendations?.length
            ? event.recommendations.join(', ')
            : `${count} thing${count === 1 ? '' : 's'} would make this listing easier to find`,
        ],
        action: eventAction(event, 'Improve listing'),
      }),
    )
  }

  if (event.draft) {
    statuses.push(
      status('draft', {
        lines: [`Last edited ${shortDate(event.updatedAt)}`],
        action: eventAction(event, 'Continue editing'),
      }),
    )
  }

  if (stage === 'expired') {
    statuses.push(
      status('expired', {
        lines: [
          event.nextCheckAt ? `Deleted on ${shortDate(event.nextCheckAt)}` : 'Unpublished',
          ...regionNote(event),
        ],
        action: addRegionManager(event) ?? eventAction(event, 'Verify'),
        deadline: event.nextCheckAt ?? null,
      }),
    )
  }

  if (statuses.length === 0) {
    statuses.push(
      status('up-to-date', {
        lines: event.nextCheckAt ? [`Next check ${shortDate(event.nextCheckAt)}`] : [],
        action: null,
      }),
    )
  }

  return statuses
}

/** What each SEO check is, as a line names it. */
/**
 * What is wrong with a service's map, said in a volunteer's terms (#1055): which
 * page and which check is the Install tab's to say, and the row links there.
 *
 * ⚠ **A missing map outranks a search problem, and hides it.** The SEO checks
 * run only on a pass that found the map, so while it is missing their stored
 * result describes a page that is not there.
 */
function serviceStatuses(row: Extract<OpenItemRow, { kind: 'service' }>): OpenItemStatus[] {
  const action = {
    label: 'Review',
    target: { collection: 'clients' as const, id: row.id, view: 'install' as const },
  }
  const lines = [`Checked ${shortDate(row.checkedAt)}`]
  const link = 'Review it'

  if (row.misses > 0 && row.pageUrl) {
    const lead = { text: 'The map was not detected on ', link: 'your site', href: row.pageUrl }
    const prompt: ActionPrompt = row.releasedAt
      ? {
          lead,
          before: ', so we can no longer send search engines (Google) to your website. ',
          link,
          after: ', and contact us if you need help.',
        }
      : {
          lead,
          before: '. ',
          link,
          after: row.owned
            ? ' so that we can continue to send search engines (Google) to your website.'
            : '',
        }
    return [status('map-not-found', { lines, action, prompt })]
  }
  return [
    status('search-problem', {
      lines,
      action,
      prompt: { before: 'Google is unable to read your map embed. ', link, after: '' },
    }),
  ]
}

/** The document a row is, which its title links to. */
export function rowTarget(row: OpenItemRow): OpenItemTarget {
  if (row.kind === 'event') return { collection: 'events', id: row.id }
  if (row.kind === 'service') return { collection: 'clients', id: row.id, view: 'install' }
  return { collection: 'user-submissions', id: row.id }
}

/** A next step said as a sentence, for a surface with room for one: the link, then the rest. */
export interface ActionPrompt {
  /** A clause opening the sentence with a link of its own, to somewhere other than the CMS. */
  lead?: { href: string; link: string; text: string }
  /** Words ahead of the link, for a sentence that says what is wrong first. */
  before?: string
  link: string
  after: string
}

const PROMPTS: Partial<Record<OpenItemStatusKey, ActionPrompt>> = {
  overdue: { link: 'Verify this event', after: ' to keep it on the map.' },
  expired: { link: 'Verify this event', after: ' to put it back on the map before it is deleted.' },
  'change-proposed': { link: 'Review the proposed changes', after: ' and accept or reject them.' },
  'class-proposed': { link: 'Review the proposed event', after: ' and accept or reject it.' },
  'confirmed-spam-pending': {
    link: 'Review the sign-up',
    after: ' and confirm it as spam or release it.',
  },
  'no-manager': { link: 'Assign a manager', after: ' so someone keeps this listing up to date.' },
  recommendations: { link: 'Improve the listing', after: ' so it is easier to find.' },
  draft: { link: 'Finish the draft', after: ' and publish it.' },
}

/** The sentence for a status's next step, or `null` when it has none. */
export function actionPrompt(status: OpenItemStatus): ActionPrompt | null {
  if (!status.action) return null
  if (status.prompt) return status.prompt
  if (status.action.target.collection === 'regions') {
    return { link: 'Add a region manager', after: ' so someone looks after this region.' }
  }
  return PROMPTS[status.key] ?? { link: status.action.label, after: '.' }
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
      : row.kind === 'service'
        ? serviceStatuses(row)
        : row.kind === 'proposal'
          ? [
              status('class-proposed', {
                lines: [`Received ${shortDate(row.receivedAt)}`],
                action: review,
                deadline: row.receivedAt,
              }),
            ]
          : [
              status('confirmed-spam-pending', {
                lines: [
                  row.reason.charAt(0).toUpperCase() + row.reason.slice(1),
                  `Received ${shortDate(row.receivedAt)}`,
                ],
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
    since:
      row.kind === 'event'
        ? row.createdAt
        : row.kind === 'service'
          ? row.checkedAt
          : row.receivedAt,
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
