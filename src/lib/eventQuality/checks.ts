import type { CheckContext, EventQualityInput, QualityCheck } from './types'

import { addressPlaceName, firstAddressSegment } from '@/lib/eventTitle/compose'

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
 * Shortest description worth having, and the threshold `description.insufficient`
 * measures both an empty and a thin one against — "Meditation class" and
 * "Everyone welcome" are the two most common values in the legacy data, at 17
 * and 16 characters. Set generously: the check is advisory, and a manager who
 * wrote two real sentences should never see it.
 */
export const DESCRIPTION_MIN_LENGTH = 60

/** Photos worth having. Below this the listing shows a thin, unconvincing strip. */
export const MINIMUM_IMAGES = 3

/**
 * Bumped whenever a check's definition changes in a way that makes a stored
 * `qualityOpenCount` incomparable with a freshly computed one — a check added
 * or removed from the document scope, or an `evaluate` whose verdict moves.
 *
 * Stamped on every write, so it records which definition produced the count
 * sitting in the row. Nothing re-stamps rows in bulk: every event reaches the
 * database through a write that runs `stampEventQuality` (the Atlas import
 * included), so a stale row can only exist if it hasn't been saved since the
 * bump — and the next save fixes it.
 */
export const QUALITY_CHECK_VERSION = 4

/**
 * The event's description as plain text. Computed once per report and handed to
 * every check on the context — six checks read it, and each read would
 * otherwise walk the whole Lexical tree again.
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

/**
 * The v1 check set. Each entry owns its own label and description so the code
 * is the single source of truth — nothing here can ship unlabelled (a unit test
 * asserts it), and a localizable email can resolve the key against its own
 * copy later.
 *
 * Every `evaluate` returns **true when the listing fails**.
 *
 * Description checks are all vacuous on an empty description: only
 * `description.missing` fires for a blank one, rather than burying the manager
 * under six findings that all say the same thing.
 */
/** "a", "a and b", "a, b and c" — for naming several things in one sentence. */
function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? ''
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
}

/** "de" → "German", for naming a language in a sentence. */
function languageName(locale: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
  } catch {
    return locale
  }
}

/** What the description repeats that the listing already shows for itself. */
function redundantDescriptionParts(ctx: CheckContext): string[] {
  const text = ctx.descriptionText
  if (!text) return []
  const parts: string[] = []
  if (ctx.addressPhrases.some((phrase) => containsPhrase(text, phrase))) parts.push('the address')
  if (containsScheduleInfo(text)) parts.push('the day or time')
  if (containsContactInfo(text)) parts.push('a phone number or email')
  if (containsUrl(text)) parts.push('a web link')
  if (findStaleDates(text, ctx.currentYear).length > 0) parts.push('a date that has passed')
  return parts
}

/** The same, for a title a manager wrote. */
function redundantTitleParts(ctx: CheckContext): string[] {
  const title = ctx.title ?? ''
  if (!title) return []
  const parts: string[] = []
  const normalized = normalizeForComparison(title)
  if (ctx.addressPhrases.some((phrase) => normalizeForComparison(phrase) === normalized)) {
    parts.push('the address')
  }
  if (containsScheduleInfo(title)) parts.push('the day or time')
  if (containsContactInfo(title)) parts.push('contact details')
  if (findStaleDates(title, ctx.currentYear).length > 0) parts.push('a date that has passed')
  return parts
}

/**
 * Languages the event is run in that have no title, when at least one other
 * does. All-or-nothing is fine: none means the auto-title covers every
 * language, all means the manager finished the job.
 */
function untranslatedLanguages(ctx: CheckContext): string[] {
  // A language ticked in this very save can't have a translation yet.
  const judged = ctx.judgedLocales.filter((locale) => !ctx.pendingLocales.includes(locale))
  if (judged.length < 2) return []
  const withTitle = judged.filter((locale) => ctx.titleByLocale[locale])
  if (withTitle.length === 0 || withTitle.length === judged.length) return []
  return judged.filter((locale) => !ctx.titleByLocale[locale]).map(languageName)
}

/**
 * The check set — five findings, each one thing a manager can act on.
 *
 * Deliberately coarse. An earlier cut had thirteen, which meant a thin listing
 * showed six near-identical rows about its description; folding those into one
 * finding that *names* what it found says more in less space. `detail` is what
 * makes that work: the label stays constant, the sentence under it is specific.
 *
 * Every `evaluate` returns **true when the listing fails**.
 */
export const EVENT_QUALITY_CHECKS: readonly QualityCheck[] = [
  {
    key: 'description.missing',
    tier: 'completeness',
    scope: 'document',
    label: 'Add a description',
    passedLabel: 'Has a description',
    description:
      'Encourage seekers to join with an inviting message. Help them feel comfortable by giving information about what they should expect and how to find the room.',
    evaluate: ({ descriptionText }) => descriptionText.length < DESCRIPTION_MIN_LENGTH,
  },
  {
    key: 'description.quality',
    tier: 'description',
    scope: 'document',
    label: 'Improve the event description',
    passedLabel: 'Has a good quality description',
    description:
      'The listing already shows this on its own, and a copy in the description goes stale as soon as the real field changes.',
    evaluate: (ctx) => redundantDescriptionParts(ctx).length > 0,
    detail: (ctx) =>
      `The description repeats ${joinPhrases(redundantDescriptionParts(ctx))}. The listing already shows this on its own, and a copy here goes stale as soon as the real field changes.`,
  },
  {
    key: 'title.quality',
    tier: 'title',
    scope: 'perLocale',
    requiresHandWrittenTitle: true,
    label: 'Improve the event title',
    passedLabel: 'Has a good quality title',
    localeLabel: 'Improve the %{language} event title',
    localePassedLabel: 'Has a good quality %{language} title',
    description:
      'The listing already shows this on its own, and a copy in the title goes stale as soon as the real field changes.',
    evaluate: (ctx) =>
      redundantTitleParts(ctx).length > 0 || GENERIC_TITLE_RE.test((ctx.title ?? '').trim()),
    detail: (ctx) => {
      const parts = redundantTitleParts(ctx)
      if (parts.length === 0) {
        return 'The title says nothing the listing doesn’t already. Leave it blank and it fills in from the venue, in every language.'
      }
      return `The title repeats ${joinPhrases(parts)}. The listing already shows this on its own, and a copy here goes stale as soon as the real field changes.`
    },
  },
  {
    key: 'images.insufficient',
    tier: 'completeness',
    scope: 'document',
    label: 'Add photos',
    passedLabel: 'Has 3+ photos',
    description:
      'Add a few photos of the room or the group meditating to attract more seekers.',
    evaluate: ({ event }) =>
      !Array.isArray(event.images) || event.images.length < MINIMUM_IMAGES,
  },
  {
    key: 'translations.missing',
    tier: 'translation',
    scope: 'document',
    dependsOnLocales: true,
    label: 'Missing translations',
    passedLabel: 'Title & description are translated',
    // Only a hand-written title can go untranslated: a blank one is composed
    // per locale from that locale's own template, so it is never left English.
    description: 'A title written in one language shows in that language to everyone else.',
    evaluate: (ctx) => untranslatedLanguages(ctx).length > 0,
    detail: (ctx) => `Translation for the title is missing in ${joinPhrases(untranslatedLanguages(ctx))}.`,
  },
]

/** Every label the panel renders, keyed for `admin.custom`. */
export const EVENT_QUALITY_CHECK_METADATA: Record<
  string,
  {
    label: string
    passedLabel: string
    localeLabel?: string
    localePassedLabel?: string
    description: string
    tier: QualityCheck['tier']
  }
> = Object.fromEntries(
  EVENT_QUALITY_CHECKS.map(
    ({ key, label, passedLabel, localeLabel, localePassedLabel, description, tier }) => [
      key,
      { label, passedLabel, localeLabel, localePassedLabel, description, tier },
    ],
  ),
)

/** Document-scope checks — the ones `qualityOpenCount` counts. */
export const DOCUMENT_SCOPE_CHECKS = EVENT_QUALITY_CHECKS.filter(
  (check) => check.scope === 'document',
)

/** Keys kept out of the stored `qualityOpenCount` — see `dependsOnLocales`. */
export const STORED_COUNT_EXCLUDED = new Set(
  EVENT_QUALITY_CHECKS.filter((check) => check.dependsOnLocales).map((check) => check.key),
)

/** Per-locale checks — evaluated once per locale in scope. */
export const PER_LOCALE_CHECKS = EVENT_QUALITY_CHECKS.filter((check) => check.scope === 'perLocale')
