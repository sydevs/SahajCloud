import type { BasePayload, PayloadRequest, TypedLocale } from 'payload'

import { isUploadAssigned, type CheckResult } from '@/lib/status'
import { isRecord } from '@/lib/utilities/isRecord'

// =============================================================================
// Per-project status-global config (persisted on the wm-app-status Configuration
// tab; extracted from the global's document by the virtualReadinessField factory).
// =============================================================================

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

// =============================================================================
// Per-timing meditation fields on UserChoices.
// =============================================================================

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

// =============================================================================
// Request-scoped memoizer for wm-app-config — Sections 4 + 5 both read it.
// Keyed on `${locale}:${depth}` so the two callers can request different
// depths without colliding.
// =============================================================================

const APP_CONFIG_CACHE_KEY = 'wmAppConfigCache'

/**
 * Load the `wm-app-config` global at most once per request per depth,
 * shared across the wm-app-status section reads.
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
    depth,
    req,
  }) as unknown as Promise<Record<string, unknown>>

  if (req) {
    const cache = existing ?? new Map<string, Promise<Record<string, unknown>>>()
    cache.set(key, configPromise)
    ctx[APP_CONFIG_CACHE_KEY] = cache
    req.context = ctx
  }
  return configPromise
}

// =============================================================================
// Lecture subtitle resolution — used by Section 3's lesson-referenced-subtitles.
// =============================================================================

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

// =============================================================================
// App-card per-document checks (Section 7) — shared between launch-critical
// and other-cards groups since both apply the same four checks.
// =============================================================================

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
