import type { EventQualityInput, TitleTemplateSet } from './types'

import {
  addressPlaceName,
  composeEventTitle,
  EVENT_TITLE_DEFAULTS,
  EVENT_TITLE_SLOTS,
} from '@/lib/eventTitle/compose'

import { escapeRegExp, normalizeForComparison } from './heuristics'

/**
 * Whether `title` fills the shape of `template` with *some* place — the fallback
 * for an event with no address at all, whose auto-title is composed from its
 * region instead (`resolveTitlePlace` in the Events title hook). This module
 * holds the region's id, not its name, so the exact string can't be rebuilt;
 * matching the template around `%{place}` is what's left. A template without the
 * placeholder yields the bare place, which no shape can distinguish from prose.
 */
function matchesTemplateShape(template: string, normalizedTitle: string): boolean {
  const normalizedTemplate = normalizeForComparison(template)
  if (!normalizedTemplate.includes('%{place}')) return false
  const pattern = normalizedTemplate.split('%{place}').map(escapeRegExp).join('(.+)')
  return new RegExp(`^${pattern}$`).test(normalizedTitle)
}

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
 *
 * An event with **no address** — an online one — is auto-titled from its region
 * instead, which recomposition can't reach. Those fall back to matching the
 * template's shape, so the panel doesn't credit a manager for a title we wrote.
 */
export function isAutoFilledTitle(
  title: string,
  event: EventQualityInput,
  templates: TitleTemplateSet = EVENT_TITLE_DEFAULTS,
): boolean {
  const normalized = normalizeForComparison(title)
  if (!normalized) return false

  const templateSets = [templates, EVENT_TITLE_DEFAULTS]
  for (const templateSet of templateSets) {
    for (const slot of EVENT_TITLE_SLOTS) {
      const composed = composeEventTitle(templateSet[slot], event.address)
      if (composed && normalizeForComparison(composed) === normalized) return true
    }
  }

  // Only for the address-less case: an event that *has* a venue keeps the exact
  // comparison, so "Evening Meditation at the pub down the road" is still judged
  // as the prose it is when the listing says Friends Meeting House.
  if (addressPlaceName(event.address)) return false
  return templateSets.some((set) =>
    EVENT_TITLE_SLOTS.some((slot) => matchesTemplateShape(set[slot], normalized)),
  )
}
