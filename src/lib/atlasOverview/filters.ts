/**
 * What a `'use client'` component may import from this folder: a leaf with no
 * runtime imports (`tests/unit/client-bundle-safety.spec.ts`).
 */

/** The tabs a filter row offers, beside All. */
export const OPEN_ITEM_FILTERS = ['overdue', 'review', 'no-manager', 'recommendations'] as const

export type OpenItemFilter = (typeof OPEN_ITEM_FILTERS)[number]

/** `check` is the tick rather than a pill: a grey "Up to date" pill reads like a problem. */
export type OpenItemPill = 'always-white' | 'check' | 'error' | 'light-gray' | 'success' | 'warning'

/** ⚠ One window for every 30-day comparison, so a region row and the tile beside it agree. */
export const WINDOW_DAYS = 30

/** How a tile's change reads, on the home and in the digest alike. */
export function changeLabel(change: number): string {
  return `${change >= 0 ? '+' : ''}${change} in ${WINDOW_DAYS} days`
}
