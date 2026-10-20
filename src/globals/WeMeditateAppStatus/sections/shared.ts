import type { BasePayload, PayloadRequest, TypedLocale } from 'payload'

import { isUploadAssigned, type CheckResult } from '@/lib/status'
import { isRecord } from '@/lib/utilities/isRecord'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

// --- Locale scoping. `runSection` gives each section its own request; these cover the reads inside one. ---

/**
 * A copy for a read that names a different locale or fallback than the read
 * beside it — `prepare` runs several concurrently, and `createLocalReq`
 * assigns both onto whatever request it is handed (#982). An omitted
 * `fallbackLocale` is not the safe choice: Payload sanitises `undefined` back
 * to the locale's own fallback, undoing a `fallbackLocale: false` next to it.
 */
export function isolatedReq(req?: PayloadRequest): PayloadRequest | undefined {
  return req ? localeIsolatedReq(req) : undefined
}

/**
 * The title each row would show with the locale fallback on, for a section
 * whose documents carry a **localized** title. `DocumentReport.label` owns why
 * a label and a check want opposite policies.
 *
 * Omit `ids` where the section reads the whole collection — a `where` built
 * from its rows would only force this read to wait for them.
 */
export async function readFallbackTitles(
  payload: BasePayload,
  collection: 'pages' | 'user-choices',
  options: { locale: TypedLocale; req?: PayloadRequest; ids?: Array<number | string> },
): Promise<Map<number | string, unknown>> {
  const { ids, locale, req } = options
  if (ids?.length === 0) return new Map()
  const { docs } = await payload.find({
    collection,
    ...(ids ? { where: { id: { in: ids } } } : {}),
    locale,
    limit: 0,
    pagination: false,
    depth: 0,
    select: { title: true },
    req: isolatedReq(req),
  })
  return new Map(docs.map((doc) => [doc.id, doc.title]))
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

// --- wm-app-config, read by the appConfig and pages sections. ---

/**
 * Load the `wm-app-config` global at most once per request per depth. The key
 * carries the depth because the two callers ask for different ones;
 * `memoizeOnRequest` owns why the in-flight promise is what gets memoized.
 *
 * It refuses the locale fallback, so `selfRealizationMeditation`,
 * `postRealizationLecture` and `vibeCheckTracks` answer about the read locale
 * alone. The Pages tab's relationships are not localized, so the flag leaves
 * the `pages` section unchanged — which is why one policy serves both callers
 * and the key does not carry it.
 */
export function getWmAppConfig(
  payload: BasePayload,
  locale: TypedLocale,
  depth: 0 | 1,
  req?: PayloadRequest,
): Promise<Record<string, unknown>> {
  const load = () =>
    payload.findGlobal({
      slug: 'wm-app-config',
      locale,
      fallbackLocale: false,
      depth,
      req: isolatedReq(req),
    }) as unknown as Promise<Record<string, unknown>>

  return req ? memoizeOnRequest(req, `wmAppConfig:${locale}:${depth}`, load) : load()
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
