import type { EventQualityInput, QualityCheck } from './types'

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
 * Shortest description worth having. Below this a listing says nothing a
 * structured field doesn't already say — "Meditation class" and "Everyone
 * welcome" are the two most common values in the legacy data, at 17 and 16
 * characters. Set generously: the check is advisory, and a manager who wrote
 * two real sentences should never see it.
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
export const QUALITY_CHECK_VERSION = 2

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
export const EVENT_QUALITY_CHECKS: readonly QualityCheck[] = [
  // ── Completeness (document scope) ──────────────────────────────────────────
  {
    key: 'description.missing',
    tier: 'completeness',
    scope: 'document',
    label: 'Add a description',
    passedLabel: 'Has a description',
    description:
      'Seekers decide from this — say who comes, what an evening is like, and what to bring.',
    evaluate: ({ descriptionText }) => descriptionText.length === 0,
  },
  {
    key: 'images.missing',
    tier: 'completeness',
    scope: 'document',
    label: 'Add a photo',
    passedLabel: 'Has a photo',
    description: 'A photo of the room or the group draws noticeably more interest than none.',
    evaluate: ({ event }) => !Array.isArray(event.images) || event.images.length === 0,
  },
  {
    key: 'contact.none',
    tier: 'completeness',
    scope: 'document',
    label: 'Add a way to get in touch',
    passedLabel: 'Seekers can get in touch',
    description:
      'There is no phone, email, website or online link, so a seeker with a question has nowhere to send it.',
    evaluate: ({ event }) =>
      !hasValue(event.contactPhone) &&
      !hasValue(event.contactEmail) &&
      !hasValue(event.website) &&
      !hasValue(event.onlineUrl),
  },

  // ── Title quality (per locale, hand-written titles only) ───────────────────
  {
    key: 'title.generic',
    tier: 'title',
    scope: 'perLocale',
    requiresHandWrittenTitle: true,
    label: 'Give the title something of its own to say',
    passedLabel: 'Title says something specific',
    localeLabel: 'Give the %{language} title something of its own to say',
    localePassedLabel: 'The %{language} title says something specific',
    description:
      'Name the audience, language or format — or clear the field, and the venue name fills in automatically and translates itself.',
    evaluate: ({ title }) => !!title && GENERIC_TITLE_RE.test(title.trim()),
  },
  {
    key: 'title.restatesAddress',
    tier: 'title',
    scope: 'perLocale',
    requiresHandWrittenTitle: true,
    label: 'Say something the address doesn’t already say',
    passedLabel: 'Title adds to the address',
    localeLabel: 'Make the %{language} title say something the address doesn’t',
    localePassedLabel: 'The %{language} title adds to the address',
    description:
      'The venue, street and city are already shown from the address, so the title spends the most prominent line repeating them.',
    evaluate: ({ addressPhrases, title }) => {
      if (!title) return false
      const normalized = normalizeForComparison(title)
      return addressPhrases.some((phrase) => normalizeForComparison(phrase) === normalized)
    },
  },
  {
    key: 'title.restatesSchedule',
    tier: 'title',
    scope: 'perLocale',
    requiresHandWrittenTitle: true,
    label: 'Take the day or time out of the title',
    passedLabel: 'Title leaves the timing to the schedule',
    localeLabel: 'Take the day or time out of the %{language} title',
    localePassedLabel: 'The %{language} title leaves the timing to the schedule',
    description:
      'The schedule already shows it, and keeps it right when it changes — a day typed into the title goes stale silently.',
    evaluate: ({ title }) => !!title && containsScheduleInfo(title),
  },

  // ── Description quality (document scope) ───────────────────────────────────
  {
    key: 'description.repeatsAddress',
    tier: 'description',
    scope: 'document',
    label: 'Take the address out of the description',
    passedLabel: 'Description doesn’t repeat the address',
    description: 'The listing already shows the address above the description, with a map.',
    evaluate: ({ addressPhrases, descriptionText }) =>
      descriptionText.length > 0 &&
      addressPhrases.some((phrase) => containsPhrase(descriptionText, phrase)),
  },
  {
    key: 'description.repeatsSchedule',
    tier: 'description',
    scope: 'document',
    label: 'Take the day and time out of the description',
    passedLabel: 'Description doesn’t repeat the schedule',
    description:
      'The schedule stays correct when you edit it; the same day typed into prose quietly doesn’t.',
    evaluate: ({ descriptionText }) =>
      descriptionText.length > 0 && containsScheduleInfo(descriptionText),
  },
  {
    key: 'description.repeatsContact',
    tier: 'description',
    scope: 'document',
    label: 'Move the phone number or email into the contact fields',
    passedLabel: 'Contact details are in their own fields',
    description:
      'Written into the description they aren’t clickable, and the listing can’t offer them as a way to make contact.',
    evaluate: ({ descriptionText }) =>
      descriptionText.length > 0 && containsContactInfo(descriptionText),
  },
  {
    key: 'description.containsUrl',
    tier: 'description',
    scope: 'document',
    label: 'Move the link into the Website or Online URL field',
    passedLabel: 'No stray links in the description',
    description: 'A web address typed into the description renders as dead, unclickable text.',
    evaluate: ({ descriptionText }) => descriptionText.length > 0 && containsUrl(descriptionText),
  },
  {
    key: 'description.staleDate',
    tier: 'description',
    scope: 'document',
    label: 'Remove the date that has passed',
    passedLabel: 'No dates that have gone stale',
    description:
      'A past date makes a live listing look abandoned — move a real one-off date into the schedule instead.',
    evaluate: ({ currentYear, descriptionText }) =>
      findStaleDates(descriptionText, currentYear).length > 0,
  },
  {
    key: 'description.tooShort',
    tier: 'description',
    scope: 'document',
    label: 'Say more about what to expect',
    passedLabel: 'Description says enough to go on',
    description:
      'Two or three sentences: who comes, what happens in a session, whether it suits a complete beginner, and what to bring.',
    evaluate: ({ descriptionText }) =>
      descriptionText.length > 0 && descriptionText.length < DESCRIPTION_MIN_LENGTH,
  },

  // ── Translation coverage (per locale) ──────────────────────────────────────
  {
    key: 'translation.title.missing',
    tier: 'translation',
    scope: 'perLocale',
    label: 'Add a title in this language',
    passedLabel: 'Has a title in this language',
    // "in %{language}" rather than "a %{language} title": the latter renders
    // "Add a English title" for every vowel-initial language name.
    localeLabel: 'Add a title in %{language}',
    localePassedLabel: 'Has a title in %{language}',
    description:
      'This event is listed as being run in this language, but a seeker browsing in it sees the English title.',
    evaluate: ({ title }) => !title,
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
