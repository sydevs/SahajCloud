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
export const QUALITY_CHECK_VERSION = 3

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

const hasValue = (value: unknown): boolean =>
  typeof value === 'string' ? value.trim().length > 0 : value != null

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
/** "a", "a and b", "a, b and c" — for naming several problems in one sentence. */
function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? ''
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
}

/** Everything in the description that the listing already renders elsewhere. */
function redundantDescriptionParts(ctx: CheckContext): string[] {
  const text = ctx.descriptionText
  if (!text) return []
  const parts: string[] = []
  if (ctx.addressPhrases.some((phrase) => containsPhrase(text, phrase))) {
    parts.push('the address, which appears above with a map')
  }
  if (containsScheduleInfo(text)) {
    parts.push('the day and time, which the schedule keeps right on its own')
  }
  if (containsContactInfo(text)) {
    parts.push('the phone number or email, which belong in the contact fields')
  }
  if (containsUrl(text)) parts.push('the web link, which renders here as dead text')
  if (findStaleDates(text, ctx.currentYear).length > 0) parts.push('the date that has passed')
  return parts
}

/** Everything wrong with a hand-written title. */
function unhelpfulTitleParts(ctx: CheckContext): string[] {
  const title = ctx.title ?? ''
  if (!title) return []
  const parts: string[] = []
  if (GENERIC_TITLE_RE.test(title.trim())) parts.push('it only says "Meditation"')
  const normalized = normalizeForComparison(title)
  if (ctx.addressPhrases.some((phrase) => normalizeForComparison(phrase) === normalized)) {
    parts.push('it is just the address')
  }
  if (containsScheduleInfo(title)) parts.push('it names a day or time the schedule already shows')
  return parts
}

/**
 * The v1 check set — six findings, each one thing a manager can act on.
 *
 * Deliberately coarse. An earlier cut had thirteen, which meant a thin listing
 * showed six near-identical rows about its description; folding those into one
 * finding that *names* what it found says more in less space. `detail` is what
 * makes that work: the label stays constant, the sentence under it is specific.
 *
 * Every `evaluate` returns **true when the listing fails**.
 */
export const EVENT_QUALITY_CHECKS: readonly QualityCheck[] = [
  // ── Completeness (document scope) ──────────────────────────────────────────
  {
    key: 'description.insufficient',
    tier: 'completeness',
    scope: 'document',
    label: 'Describe what to expect',
    passedLabel: 'Describes what to expect',
    description:
      'Two or three sentences: who comes, what happens in a session, and what to bring.',
    evaluate: ({ descriptionText }) => descriptionText.length < DESCRIPTION_MIN_LENGTH,
    detail: ({ descriptionText }) =>
      descriptionText.length === 0
        ? 'Nothing here yet. Two or three sentences: who comes, what happens in a session, and what to bring.'
        : 'Too short to tell a seeker much. Add who comes, what happens in a session, and whether a beginner will feel at home.',
  },
  {
    key: 'images.missing',
    tier: 'completeness',
    scope: 'document',
    label: 'Add a photo',
    passedLabel: 'Has a photo',
    description: 'A photo of the room or the group draws far more interest than none.',
    evaluate: ({ event }) => !Array.isArray(event.images) || event.images.length === 0,
  },
  {
    key: 'contact.none',
    tier: 'completeness',
    scope: 'document',
    label: 'Add a way to get in touch',
    passedLabel: 'Seekers can get in touch',
    description:
      'Add a phone number or an email, so someone unsure about coming can ask first.',
    evaluate: ({ event }) =>
      !hasValue(event.contactPhone) &&
      !hasValue(event.contactEmail) &&
      !hasValue(event.website) &&
      !hasValue(event.onlineUrl),
  },

  // ── Description quality (document scope) ───────────────────────────────────
  {
    key: 'description.redundant',
    tier: 'description',
    scope: 'document',
    label: 'Trim what the listing already shows',
    passedLabel: 'Description adds to the listing',
    description: 'Use the space for what the other fields can’t say.',
    evaluate: (ctx) => redundantDescriptionParts(ctx).length > 0,
    detail: (ctx) => `Take out ${joinPhrases(redundantDescriptionParts(ctx))}.`,
  },

  // ── Title quality (per locale, hand-written titles only) ───────────────────
  {
    key: 'title.unhelpful',
    tier: 'title',
    scope: 'perLocale',
    requiresHandWrittenTitle: true,
    label: 'Clear the title and let it fill in',
    passedLabel: 'Title adds to the listing',
    localeLabel: 'Clear the %{language} title and let it fill in',
    localePassedLabel: 'The %{language} title adds to the listing',
    description:
      'An empty title becomes "Evening Meditation at «venue»" — named, and translated into every language.',
    evaluate: (ctx) => unhelpfulTitleParts(ctx).length > 0,
    detail: (ctx) =>
      `Right now ${joinPhrases(unhelpfulTitleParts(ctx))}. Clearing it gives you the venue name in every language instead.`,
  },

  // ── Translation coverage (per locale) ──────────────────────────────────────
  {
    key: 'translation.title.missing',
    tier: 'translation',
    scope: 'perLocale',
    label: 'Translate the title',
    passedLabel: 'Title is translated',
    localeLabel: 'Translate the title into %{language}',
    localePassedLabel: 'Title is translated into %{language}',
    description:
      'A custom title shows here in English — clearing it in every language fills each one in from the venue instead.',
    // Only a hand-written title can go untranslated: a blank one is composed
    // per locale from that locale's own template, so it is never left English.
    evaluate: ({ defaultTitleIsHandWritten, title }) => defaultTitleIsHandWritten && !title,
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

/** Per-locale checks — evaluated once per locale in scope. */
export const PER_LOCALE_CHECKS = EVENT_QUALITY_CHECKS.filter((check) => check.scope === 'perLocale')
