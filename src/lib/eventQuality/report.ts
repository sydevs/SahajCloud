
import type {
  CheckContext,
  EventQualityInput,
  EventQualityReport,
  QualityCheck,
  QualityCheckResult,
  TitleTemplateSet,
} from './types'

import { EVENT_TITLE_DEFAULTS } from '@/lib/eventTitle/compose'
import type { LocaleCode } from '@/lib/locales'
import { DEFAULT_LOCALE, LOCALES } from '@/lib/locales'

import { isAutoFilledTitle } from './autoTitle'
import {
  DOCUMENT_SCOPE_CHECKS,
  STORED_COUNT_EXCLUDED,
  eventAddressPhrases,
  eventDescriptionText,
  PER_LOCALE_CHECKS,
} from './checks'
import { shouldSkipQualityChecks } from './skip'

export type BuildReportOptions = {
  /**
   * Locales to judge. Defaults to the event's own scope — see
   * `qualityLocalesForEvent`.
   */
  locales?: LocaleCode[]
  /**
   * Locales the event gained in the save currently in flight. Their
   * translation checks report `pending`: a title cannot exist yet for a
   * language chosen a moment ago.
   */
  pendingLocales?: readonly string[]
  /** Auto-title templates per locale; English defaults fill any gap. */
  templates?: Partial<Record<string, TitleTemplateSet>>
  /** "Now", for judging stale dates. Defaults to the current clock. */
  now?: Date
}

/**
 * Resolve an event `languages` entry (an ISO 639-1 code — the field offers all
 * ~183) onto one of the CMS's 19 locales.
 *
 * An exact match wins; failing that, a locale whose primary subtag matches, so
 * `pt` finds `pt-BR`. A language the CMS isn't translated into resolves to
 * nothing and is simply not judged — there is no locale for a seeker to be
 * missing a translation in.
 */
export function localeForLanguage(language: string): LocaleCode | null {
  const normalized = language.trim().toLowerCase()
  if (!normalized) return null
  const exact = LOCALES.find((locale) => locale.code.toLowerCase() === normalized)
  if (exact) return exact.code
  const byPrimarySubtag = LOCALES.find(
    (locale) => locale.code.toLowerCase().split('-')[0] === normalized,
  )
  return byPrimarySubtag?.code ?? null
}

/**
 * The locales an event is judged in: the default locale plus the locales its
 * own `languages` resolve to.
 *
 * Not all 19 — a listing conducted in German is not incomplete for having no
 * Armenian title, and judging every locale would show 18 failing checks on
 * nearly every event in the Atlas.
 */
export function qualityLocalesForEvent(event: EventQualityInput): LocaleCode[] {
  const locales: LocaleCode[] = [DEFAULT_LOCALE]
  const languages = Array.isArray(event.languages) ? event.languages : []
  for (const language of languages) {
    if (typeof language !== 'string') continue
    const locale = localeForLanguage(language)
    if (locale && !locales.includes(locale)) locales.push(locale)
  }
  return locales
}

/** The title stored for `locale`, off either a single-locale or `locale: 'all'` read. */
export function titleForLocale(
  title: EventQualityInput['title'],
  locale: LocaleCode,
  defaultLocale: LocaleCode = DEFAULT_LOCALE,
): string {
  if (title == null) return ''
  // A single-locale read yields a plain string; it can only speak for the
  // locale it was read in, which is the default locale in every caller here.
  if (typeof title === 'string') return locale === defaultLocale ? title.trim() : ''
  const value = title[locale]
  return typeof value === 'string' ? value.trim() : ''
}

/** Whether `title` is wording a manager typed, rather than the auto-fill. */
function isHandWrittenTitle(
  event: EventQualityInput,
  title: string,
  templates?: TitleTemplateSet,
): boolean {
  return title.length > 0 && !isAutoFilledTitle(title, event, templates ?? EVENT_TITLE_DEFAULTS)
}

/**
 * Run one check, attaching the specific problems it found when it fails.
 * `detail` is only consulted on failure — a passing check has nothing to name.
 */
function resolve(check: QualityCheck, ctx: CheckContext): Omit<QualityCheckResult, 'key'> {
  if (!check.evaluate(ctx)) return { status: 'passed' }
  const detail = check.detail?.(ctx)
  return detail ? { status: 'failed', detail } : { status: 'failed' }
}

/**
 * Build the full multi-locale listing-quality report for an event.
 *
 * Pure: everything it needs — the locale scope, the per-locale auto-title
 * templates, the clock — is passed in, so the whole check set is unit-testable
 * without a Payload bootstrap.
 */
export function buildEventQualityReport(
  event: EventQualityInput,
  options: BuildReportOptions = {},
): EventQualityReport {
  const reason = shouldSkipQualityChecks(event)
  if (reason) return { skipped: true, reason }

  const currentYear = (options.now ?? new Date()).getUTCFullYear()
  const locales = options.locales ?? qualityLocalesForEvent(event)
  const pending = new Set(options.pendingLocales ?? [])
  // Both walk a structure every time they're read, and several checks want
  // them — so they're computed once here and passed down.
  const shared = {
    event,
    currentYear,
    descriptionText: eventDescriptionText(event),
    addressPhrases: eventAddressPhrases(event),
    // Whether the *default* locale's title is one a manager typed. A blank
    // title is composed per locale from that locale's own template, so it is
    // never left untranslated — only a hand-written one can be.
    defaultTitleIsHandWritten: isHandWrittenTitle(
      event,
      titleForLocale(event.title, DEFAULT_LOCALE),
      options.templates?.[DEFAULT_LOCALE],
    ),
    // The translation check is document-scope — it reports one finding naming
    // every language that's missing a title, rather than a row per language —
    // so it needs the whole map, not just the locale in hand.
    judgedLocales: locales,
    pendingLocales: [...pending],
    titleByLocale: Object.fromEntries(
      locales.map((locale) => [locale, titleForLocale(event.title, locale)]),
    ),
  }

  const document: QualityCheckResult[] = DOCUMENT_SCOPE_CHECKS.map((check) => ({
    key: check.key,
    ...resolve(check, shared),
  }))

  const perLocale: Record<string, QualityCheckResult[]> = {}
  for (const locale of locales) {
    const templates = options.templates?.[locale] ?? EVENT_TITLE_DEFAULTS
    const title = titleForLocale(event.title, locale)
    // A check that judges the manager's own wording stays silent when the
    // title is the auto-fill (or absent) — see `requiresHandWrittenTitle`.
    const handWritten = isHandWrittenTitle(event, title, templates)

    perLocale[locale] = PER_LOCALE_CHECKS.filter(
      (check) => handWritten || !check.requiresHandWrittenTitle,
    ).map((check) => ({
      key: check.key,
      // A locale added in this very save cannot have a translation yet.
      ...(pending.has(locale)
        ? { status: 'pending' as const }
        : resolve(check, { ...shared, locale, title, templates })),
    }))
  }

  return {
    skipped: false,
    document,
    perLocale,
    locales,
    // Document scope, and only the checks that don't read localized data — the
    // stored column is written by a hook that sees one locale, so counting a
    // cross-locale check there would disagree with the report on every
    // multilingual event. See the ticket's design note (#609).
    openCount: document.filter(
      (result) =>
        result.status === 'failed' && !STORED_COUNT_EXCLUDED.has(result.key),
    ).length,
  }
}

/**
 * The stored `qualityOpenCount` for an event — the count a `beforeChange` can
 * compute from the document it already has, with no extra read.
 */
export function countOpenDocumentIssues(event: EventQualityInput, now?: Date): number {
  // An empty locale list is how a caller asks for document scope only — there
  // is nothing per-locale to evaluate, so nothing per-locale is computed.
  const report = buildEventQualityReport(event, { locales: [], now })
  return report.skipped ? 0 : report.openCount
}
