/**
 * The open-items vocabulary, in a leaf with no runtime imports.
 *
 * Separate from `status.ts` so a `'use client'` component can take a filter
 * name without the status table, whose job is server-side: the lines are built
 * on the server in both consumers, so nothing in the browser needs it.
 *
 * ⚠ **What client code must not reach is the folder's barrel, not this file's
 * siblings** — deep-import the module you want. The story is in `src/AGENTS.md`
 * ("That barrel hazard is not hypothetical"), and
 * `tests/unit/client-bundle-safety.spec.ts` holds it.
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
export type OpenItemPill = 'always-white' | 'check' | 'error' | 'light-gray' | 'success' | 'warning'
