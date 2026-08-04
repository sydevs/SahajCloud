import type { EventQualityInput, TitleTemplateSet } from './types'

import {
  composeEventTitle,
  EVENT_TITLE_DEFAULTS,
  EVENT_TITLE_SLOTS,
} from '@/lib/eventTitle/compose'

import { normalizeForComparison } from './heuristics'

/**
 * Whether `title` is the auto-fill rather than something a manager wrote.
 *
 * This is the load-bearing judgement of the whole title tier. The auto-title is
 * *built* from the address — "Morning Meditation at «Venue»" — and #605
 * deliberately blanked 78 generic titles precisely so they'd fall back to it. A
 * rule that flagged "the title restates the address" without this guard would
 * fail the majority of listings, flagging the exact state we set out to create.
 *
 * Detection is by **recomposition**: rebuild the auto-title from the event's own
 * address and compare. Every slot is tried, not just the one the current
 * schedule implies — a schedule edited from an evening to a morning slot leaves
 * the stored title on the old template, and that title is still auto-filled.
 * The locale's own templates are tried alongside the English defaults, so a
 * German auto-title isn't mistaken for hand-written prose.
 */
export function isAutoFilledTitle(
  title: string,
  event: EventQualityInput,
  templates: TitleTemplateSet = EVENT_TITLE_DEFAULTS,
): boolean {
  const normalized = normalizeForComparison(title)
  if (!normalized) return false

  for (const templateSet of [templates, EVENT_TITLE_DEFAULTS]) {
    for (const slot of EVENT_TITLE_SLOTS) {
      const composed = composeEventTitle(templateSet[slot], event.address)
      if (composed && normalizeForComparison(composed) === normalized) return true
    }
  }
  return false
}
