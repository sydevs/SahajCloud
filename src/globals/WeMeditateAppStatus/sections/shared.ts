import type { BasePayload, PayloadRequest, TypedLocale } from 'payload'

import { isUploadAssigned, labelOf, type CheckResult } from '@/lib/status'
import { isRecord } from '@/lib/utilities/isRecord'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

// --- Locale scoping. Every read a section issues goes through these two. ---

/**
 * The `req` every read in this global hands to the Local API.
 *
 * `createLocalReq` assigns `locale` and `fallbackLocale` onto the request
 * object it is given, so a read that forwards `req` decides what the sections
 * running after it resolve — and the order Payload runs the virtual fields'
 * `afterRead` hooks in is what would pick the winner. A read naming no
 * `fallbackLocale` is no safer: Payload sanitises `undefined` back to the
 * locale's own fallback, so it undoes an earlier `fallbackLocale: false`.
 * Hence every read here takes a copy, whichever locale it names (#982).
 * `localeIsolatedReq` owns what a copy shares and what it does not.
 */
export function isolatedReq(req?: PayloadRequest): PayloadRequest | undefined {
  return req ? localeIsolatedReq(req) : undefined
}

/**
 * Row labels for a section whose documents carry a **localized** title.
 *
 * A check described "for this locale" reads `fallbackLocale: false`, so a
 * title nobody has translated arrives empty and `labelOf` renders the row as
 * `#42`. No check on this screen asks about a title, and an operator cannot
 * act on a row they cannot name — so labels come from their own read with
 * Payload's fallback left on, and a row keeps its English title until someone
 * translates it.
 */
export async function readFallbackLabels(
  payload: BasePayload,
  collection: 'pages' | 'user-choices',
  ids: Array<number | string>,
  locale: TypedLocale,
  req?: PayloadRequest,
): Promise<Map<number | string, string>> {
  if (ids.length === 0) return new Map()
  const { docs } = await payload.find({
    collection,
    where: { id: { in: ids } },
    locale,
    limit: 0,
    pagination: false,
    depth: 0,
    req: isolatedReq(req),
  })
  return new Map(docs.map((doc) => [doc.id, labelOf(doc)]))
}

// --- Per-project status-global config (persisted on the wm-app-status Configuration tab; extracted from the global's document by the virtualReadinessField factory). ---

export const DEFAULT_BASELINE_COUNTRY = 'GB'
const COUNTRY_CODE_RE = /^[A-Z]{2}$/

export type WeMeditateAppStatusConfig = {
  baselineCountry: string
  launchCriticalAppCardIds: Array<number | string>
}

export function extractWeMeditateAppStatusConfig(data: unknown): WeMeditateAppStatusConfig {
  if (!isRecord(data)) {
    return { baselineCountry: DEFAULT_BASELINE_COUNTRY, launchCriticalAppCardIds: [] }
  }
  const country =
    typeof data.baselineCountry === 'string' && COUNTRY_CODE_RE.test(data.baselineCountry)
      ? data.baselineCountry
      : DEFAULT_BASELINE_COUNTRY
  const launchCriticalRaw = Array.isArray(data.launchCriticalAppCards)
    ? data.launchCriticalAppCards
    : []
  const launchCriticalIds: Array<number | string> = []
  for (const raw of launchCriticalRaw) {
    if (typeof raw === 'number' || typeof raw === 'string') {
      launchCriticalIds.push(raw)
    } else if (isRecord(raw) && (typeof raw.id === 'number' || typeof raw.id === 'string')) {
      launchCriticalIds.push(raw.id)
    }
  }
  return { baselineCountry: country, launchCriticalAppCardIds: launchCriticalIds }
}

// --- Per-timing meditation fields on UserChoices. ---

export const PER_TIMING_FIELDS = {
  morning: 'morningMeditation',
  afternoon: 'afternoonMeditation',
  evening: 'eveningMeditation',
  night: 'nightMeditation',
} as const

export type Timing = keyof typeof PER_TIMING_FIELDS

/**
 * A meditation reference (populated at depth ≥ 1) satisfies "set and
 * published for this locale" when its `locale` matches the target and
 * its `_status` is `published`.
 */
export function meditationMatchesLocale(value: unknown, locale: string): boolean {
  if (!isRecord(value)) return false
  return value.locale === locale && value._status === 'published'
}

// --- Request-scoped memoizer for wm-app-config — Sections 4 + 5 both read it. Keyed on `${locale}:${depth}` so the two callers can request different depths without colliding. ---

const APP_CONFIG_CACHE_KEY = 'wmAppConfigCache'

/**
 * Load the `wm-app-config` global at most once per request per depth,
 * shared across the wm-app-status section reads.
 *
 * It refuses the English fallback, so `selfRealizationMeditation`,
 * `postRealizationLecture` and `vibeCheckTracks` answer about the read locale
 * alone. The Pages tab's relationships are not localized, so the flag leaves
 * the `pages` section unchanged. Both callers want that one policy, which is
 * why the memo key does not carry it.
 *
 * Why memoize the in-flight *promise* rather than the resolved value:
 * concurrent section callers (e.g. sections 1 + 2 both reading at depth 0)
 * can race to load. A resolved-value cache stampedes — all callers clear
 * the "not cached yet" check before the first load settles, so each issues
 * its own `findGlobal`. Storing the promise synchronously (no await between
 * check and store) means every later caller awaits the same one, collapsing
 * the load to exactly one per (locale, depth) pair.
 */
export async function getWmAppConfig(
  payload: BasePayload,
  locale: TypedLocale,
  depth: 0 | 1,
  req?: PayloadRequest,
): Promise<Record<string, unknown>> {
  const key = `${locale}:${depth}`
  const ctx = (req?.context ?? {}) as Record<string, unknown>
  const existing = ctx[APP_CONFIG_CACHE_KEY] as
    | Map<string, Promise<Record<string, unknown>>>
    | undefined

  if (existing?.has(key)) return existing.get(key)!

  const configPromise = payload.findGlobal({
    slug: 'wm-app-config',
    locale,
    fallbackLocale: false,
    depth,
    req: isolatedReq(req),
  }) as unknown as Promise<Record<string, unknown>>

  if (req) {
    const cache = existing ?? new Map<string, Promise<Record<string, unknown>>>()
    cache.set(key, configPromise)
    ctx[APP_CONFIG_CACHE_KEY] = cache
    req.context = ctx
  }
  return configPromise
}

// --- Lecture subtitle resolution — used by Section 3's lesson-referenced-subtitles. ---

export function lectureHasSubtitlesForLocale(
  lecture: Record<string, unknown>,
  locale: TypedLocale,
): boolean {
  const clipOverrides = Array.isArray(lecture.subtitles)
    ? (lecture.subtitles as Array<{ locale?: string; url?: string }>)
    : []
  if (
    clipOverrides.some((s) => s?.locale === locale && typeof s.url === 'string' && s.url.length > 0)
  ) {
    return true
  }

  // Clips have `metadata: null` and source NV metadata from their parent.
  let sourceMetadata = lecture.metadata
  if (
    !isRecord(sourceMetadata) &&
    isRecord(lecture.fullLecture) &&
    isRecord((lecture.fullLecture as Record<string, unknown>).metadata)
  ) {
    sourceMetadata = (lecture.fullLecture as Record<string, unknown>).metadata
  }
  if (!isRecord(sourceMetadata)) return false
  const subs = (sourceMetadata as { subtitles?: unknown }).subtitles
  if (!Array.isArray(subs)) return false
  return subs.some((s) => isRecord(s) && s.languageCode === locale && typeof s.url === 'string')
}

// --- App-card per-document checks (Section 7) — shared between launch-critical and other-cards groups since both apply the same four checks. ---

export function appCardChecks(card: Record<string, unknown>): CheckResult[] {
  const defaultView = isRecord(card.default) ? (card.default as Record<string, unknown>) : null
  return [
    { key: 'published', passed: card._status === 'published' },
    {
      key: 'title-set',
      passed:
        !!defaultView &&
        typeof defaultView.title === 'string' &&
        defaultView.title.trim().length > 0,
    },
    {
      key: 'subtitle-set',
      passed:
        !!defaultView &&
        typeof defaultView.subtitle === 'string' &&
        defaultView.subtitle.trim().length > 0,
    },
    {
      key: 'button-label-set',
      passed:
        !!defaultView &&
        typeof defaultView.buttonText === 'string' &&
        defaultView.buttonText.trim().length > 0,
    },
  ]
}

export type UserChoiceRow = Record<string, unknown>
export { isUploadAssigned }
