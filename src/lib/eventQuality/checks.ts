import type { CheckContext, EventQualityInput, QualityCheck, RedundancyKind } from './types'

import { addressPlaceName, firstAddressSegment } from '@/lib/eventTitle/compose'

import { EVENT_QUALITY_COPY, fillCopy, REDUNDANCY_PHRASES } from './copy'
import {
  containsContactInfo,
  containsPhrase,
  containsScheduleInfo,
  containsUrl,
  findStaleDates,
  GENERIC_TITLE_RE,
  lexicalPlainText,
  normalizeForComparison,
} from './heuristics'

/**
 * Shortest description worth having — "Meditation class" and "Everyone welcome"
 * are the two most common values in the legacy data, at 17 and 16 characters.
 * Set generously: the check is advisory, and a manager who wrote two real
 * sentences should never see it.
 */
export const DESCRIPTION_MIN_LENGTH = 60

/** Photos worth having. Below this the listing shows a thin, unconvincing strip. */
export const MINIMUM_IMAGES = 3

/**
 * Bumped whenever a check's definition changes in a way that makes a stored
 * `qualityOpenCount` incomparable with a freshly computed one.
 *
 * Stamped on every write, so it records which definition produced the count in
 * the row. Nothing re-stamps rows in bulk: every event reaches the database
 * through a write that runs `stampEventQuality` (the Atlas import included), so
 * a stale row can only exist if it hasn't been saved since the bump — and the
 * next save fixes it.
 */
export const QUALITY_CHECK_VERSION = 5

/**
 * The event's description as plain text. Computed once per report and handed to
 * every check on the context — several read it, and each read would otherwise
 * walk the whole Lexical tree again.
 */
export function eventDescriptionText(event: EventQualityInput): string {
  return lexicalPlainText(event.description).trim()
}

/**
 * Non-empty strings the address already renders on the listing. Computed once
 * per report for the same reason as the description text above.
 */
export function eventAddressPhrases(event: EventQualityInput): string[] {
  const address = (event.address ?? {}) as Record<string, unknown>
  const candidates = [
    addressPlaceName(address),
    firstAddressSegment(address.street),
    typeof address.city === 'string' ? address.city : '',
  ]
  return candidates.filter((value) => value.trim().length > 0)
}

/** "a", "a and b", "a, b and c" — for naming several things in one sentence. */
function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? ''
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
}

/** Turn the kinds found into the sentence the panel shows. */
function redundancyDetail(template: string, kinds: RedundancyKind[]): string {
  return fillCopy(template, {
    problems: joinPhrases(kinds.map((kind) => REDUNDANCY_PHRASES[kind])),
  })
}

/** What `text` repeats that the listing already shows for itself. */
function redundantParts(text: string, ctx: CheckContext): RedundancyKind[] {
  if (!text) return []
  const kinds: RedundancyKind[] = []
  if (ctx.addressPhrases.some((phrase) => containsPhrase(text, phrase))) kinds.push('address')
  if (containsScheduleInfo(text)) kinds.push('schedule')
  if (containsContactInfo(text)) kinds.push('contact')
  if (containsUrl(text)) kinds.push('link')
  if (findStaleDates(text, ctx.currentYear).length > 0) kinds.push('staleDate')
  return kinds
}

/**
 * A title is judged the same way, except that being *only* the address counts
 * where merely mentioning it wouldn't — a title has one line to earn.
 */
function redundantTitleParts(ctx: CheckContext): RedundancyKind[] {
  const title = ctx.title
  if (!title) return []
  const kinds: RedundancyKind[] = redundantParts(title, ctx).filter((kind) => kind !== 'address')
  const normalized = normalizeForComparison(title)
  if (ctx.addressPhrases.some((phrase) => normalizeForComparison(phrase) === normalized)) {
    kinds.unshift('address')
  }
  return kinds
}

/**
 * The check set — four findings, each one thing a manager can act on.
 *
 * Deliberately coarse. An earlier cut had thirteen, which meant a thin listing
 * showed six near-identical rows about its description; folding those into one
 * finding that *names* what it found says more in less space. `detail` is what
 * makes that work: the label stays constant, the sentence under it is specific.
 *
 * All wording lives in `copy.ts`. Every `evaluate` returns **true when the
 * listing fails**.
 */
export const EVENT_QUALITY_CHECKS: readonly QualityCheck[] = [
  {
    key: 'description.missing',
    ...EVENT_QUALITY_COPY['description.missing'],
    evaluate: ({ descriptionText }) => descriptionText.length < DESCRIPTION_MIN_LENGTH,
  },
  {
    key: 'description.quality',
    ...EVENT_QUALITY_COPY['description.quality'],
    // Nothing to say about the quality of a description that isn't there —
    // `description.missing` is already making that point, and two rows about
    // the same empty field is one too many.
    skipWhenFailed: 'description.missing',
    evaluate: (ctx) => redundantParts(ctx.descriptionText, ctx).length > 0,
    detail: (ctx) =>
      redundancyDetail(
        EVENT_QUALITY_COPY['description.quality'].detail,
        redundantParts(ctx.descriptionText, ctx),
      ),
  },
  {
    key: 'title.quality',
    ...EVENT_QUALITY_COPY['title.quality'],
    // Skipped for a blank or auto-filled title: the auto-title is generated
    // from the venue by design, so there is no wording of the manager's to
    // judge — and #605 blanked 78 titles precisely to reach that state.
    requiresHandWrittenTitle: true,
    evaluate: (ctx) =>
      redundantTitleParts(ctx).length > 0 || GENERIC_TITLE_RE.test((ctx.title ?? '').trim()),
    detail: (ctx) => {
      const kinds = redundantTitleParts(ctx)
      return kinds.length === 0
        ? EVENT_QUALITY_COPY['title.quality'].genericDetail
        : redundancyDetail(EVENT_QUALITY_COPY['title.quality'].detail, kinds)
    },
  },
  {
    key: 'images.insufficient',
    ...EVENT_QUALITY_COPY['images.insufficient'],
    evaluate: ({ event }) => !Array.isArray(event.images) || event.images.length < MINIMUM_IMAGES,
  },
]

/** Every label the panel renders, keyed for `admin.custom`. */
export const EVENT_QUALITY_CHECK_METADATA: Record<
  string,
  { label: string; passedLabel: string; description: string }
> = Object.fromEntries(
  EVENT_QUALITY_CHECKS.map(({ key, label, passedLabel, description }) => [
    key,
    { label, passedLabel, description },
  ]),
)
