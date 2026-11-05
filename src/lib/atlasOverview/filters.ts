/**
 * The open-items vocabulary, in a leaf with no runtime imports.
 *
 * ⚠ **Separate from `status.ts` because the homes' client components need
 * it.** That file builds each status's wording, which means formatting a date,
 * which means `@/lib/notifications/eventDetails` — a server module that reaches
 * `@/lib/env/server`. A `'use client'` component importing the filter names
 * through it would ship the whole email layer to the browser, and the build
 * would fail on the deploy rather than in CI
 * (`src/AGENTS.md`, "That barrel hazard is not hypothetical").
 *
 * The lines themselves are built on the server in both consumers, so nothing
 * in the browser needs `status.ts` at all.
 */

/** The tabs a filter row offers, beside All. A status in no filter is unfiltered. */
export const OPEN_ITEM_FILTERS = ['overdue', 'review', 'no-manager', 'recommendations'] as const

export type OpenItemFilter = (typeof OPEN_ITEM_FILTERS)[number]

export const OPEN_ITEM_FILTER_LABELS: Record<OpenItemFilter, string> = {
  'no-manager': 'No manager',
  overdue: 'Overdue',
  recommendations: 'Recommendations',
  review: 'To review',
}

/** Every status, as a key a filter, a test and a translation can all name. */
export const OPEN_ITEM_STATUSES = [
  'overdue',
  'change-proposed',
  'class-proposed',
  'confirmed-spam-pending',
  'no-manager',
  'recommendations',
  'draft',
  'expired',
  'up-to-date',
  'finished',
] as const

export type OpenItemStatusKey = (typeof OPEN_ITEM_STATUSES)[number]

/**
 * How a status is drawn.
 *
 * `check` is the tick rather than a pill — the one status that is not a
 * problem, and a grey pill saying "Up to date" reads like one.
 */
export type OpenItemPill =
  | 'always-white'
  | 'check'
  | 'error'
  | 'light-gray'
  | 'success'
  | 'warning'
