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
 * or removed from the document scope, or an `evaluate` whose verdict moves. The
 * backfill script uses it to find rows written by an older definition.
 */
export const QUALITY_CHECK_VERSION = 1

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
    description:
      'A seeker deciding whether to come reads the description first. Say who the class is for and what an evening looks like.',
    evaluate: ({ descriptionText }) => descriptionText.length === 0,
  },
  {
    key: 'images.missing',
    tier: 'completeness',
    scope: 'document',
    label: 'Add a photo',
    description:
      'Listings with a photo of the room or the group get noticeably more interest than listings without one.',
    evaluate: ({ event }) => !Array.isArray(event.images) || event.images.length === 0,
  },
  {
    key: 'website.missing',
    tier: 'completeness',
    scope: 'document',
    label: 'Add a website',
    description: 'Without a link there is nowhere for a seeker to read more about the programme.',
    evaluate: ({ event }) => !hasValue(event.website),
  },
  {
    key: 'contact.none',
    tier: 'completeness',
    scope: 'document',
    label: 'Add a way to get in touch',
    description:
      'This listing offers no phone, no email, no website and no online link — a seeker with a question has no way to ask it.',
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
    description:
      'A title that only says "Meditation" is strictly worse than leaving it blank: the auto-title names the venue and translates itself. Name the audience, the language, the format, or clear the field.',
    evaluate: ({ title }) => !!title && GENERIC_TITLE_RE.test(title.trim()),
  },
  {
    key: 'title.restatesAddress',
    tier: 'title',
    scope: 'perLocale',
    requiresHandWrittenTitle: true,
    label: 'The title only repeats the address',
    description:
      'The listing already renders the venue, street and city from the address. A title that repeats one of them spends the most prominent line saying nothing new.',
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
    label: 'The title repeats the schedule',
    description:
      'The listing renders the weekday and time from the schedule, and keeps them right when the schedule changes. A day or time written into the title goes stale silently.',
    evaluate: ({ title }) => !!title && containsScheduleInfo(title),
  },

  // ── Description quality (document scope) ───────────────────────────────────
  {
    key: 'description.repeatsAddress',
    tier: 'description',
    scope: 'document',
    label: 'The description repeats the address',
    description:
      'The address is already rendered above the description, with a map. Repeating it in prose costs the reader a paragraph and tells them nothing.',
    evaluate: ({ addressPhrases, descriptionText }) =>
      descriptionText.length > 0 &&
      addressPhrases.some((phrase) => containsPhrase(descriptionText, phrase)),
  },
  {
    key: 'description.repeatsSchedule',
    tier: 'description',
    scope: 'document',
    label: 'The description repeats the schedule',
    description:
      'The weekday and time come from the schedule, which stays correct when the schedule is edited. The same information typed into prose does not.',
    evaluate: ({ descriptionText }) =>
      descriptionText.length > 0 && containsScheduleInfo(descriptionText),
  },
  {
    key: 'description.repeatsContact',
    tier: 'description',
    scope: 'document',
    label: 'Move the phone number or email out of the description',
    description:
      'A phone number or address in prose is unclickable and invisible to the contact fields. Put it in Contact Phone or Contact Email and it renders as a real link.',
    evaluate: ({ descriptionText }) =>
      descriptionText.length > 0 && containsContactInfo(descriptionText),
  },
  {
    key: 'description.containsUrl',
    tier: 'description',
    scope: 'document',
    label: 'Move the link out of the description',
    description:
      'A URL typed into the description renders as dead, unclickable text. It belongs in Website, or in Online URL for a link attendees join through.',
    evaluate: ({ descriptionText }) =>
      descriptionText.length > 0 && containsUrl(descriptionText),
  },
  {
    key: 'description.staleDate',
    tier: 'description',
    scope: 'document',
    label: 'The description names a date that has passed',
    description:
      'A date in the past makes a live listing look abandoned. Remove it, or move a real one-off date into the schedule.',
    evaluate: ({ currentYear, descriptionText }) =>
      findStaleDates(descriptionText, currentYear).length > 0,
  },
  {
    key: 'description.tooShort',
    tier: 'description',
    scope: 'document',
    label: 'Say a little more',
    description: `A description under ${DESCRIPTION_MIN_LENGTH} characters rarely says anything the structured fields don't. Two sentences about who comes and what happens is enough.`,
    evaluate: ({ descriptionText }) =>
      descriptionText.length > 0 && descriptionText.length < DESCRIPTION_MIN_LENGTH,
  },

  // ── Translation coverage (per locale) ──────────────────────────────────────
  {
    key: 'translation.title.missing',
    tier: 'translation',
    scope: 'perLocale',
    label: 'Add a title in this language',
    description:
      'This event is listed as being conducted in this language, but has no title for it — a seeker browsing in that language sees the English one.',
    evaluate: ({ title }) => !title,
  },
]

/** Label + description for every key, for the admin panel's `admin.custom`. */
export const EVENT_QUALITY_CHECK_METADATA: Record<
  string,
  { label: string; description: string; tier: QualityCheck['tier'] }
> = Object.fromEntries(
  EVENT_QUALITY_CHECKS.map(({ key, label, description, tier }) => [
    key,
    { label, description, tier },
  ]),
)

/** Document-scope checks — the ones `qualityOpenCount` counts. */
export const DOCUMENT_SCOPE_CHECKS = EVENT_QUALITY_CHECKS.filter(
  (check) => check.scope === 'document',
)

/** Per-locale checks — evaluated once per locale in scope. */
export const PER_LOCALE_CHECKS = EVENT_QUALITY_CHECKS.filter((check) => check.scope === 'perLocale')
