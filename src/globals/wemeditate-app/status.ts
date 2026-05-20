import type {
  GlobalConfig,
  BasePayload,
  SelectField,
  PayloadRequest,
  TypedLocale,
} from 'payload'

import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

import { adminOnlyCondition, adminOnlyFieldAccess } from '@/lib/access'
import { countLecturesForAudiences, resolveAudienceIds } from '@/lib/audiences/resolve'
import {
  aggregateGroup,
  collectRelationshipIds,
  containsRelationship,
  documentsGroup,
  findFieldByName,
  isRecord,
  isUploadAssigned,
  labelOf,
  refId,
  richTextHasContent,
  summarize,
  virtualReadinessField,
  type CheckResult,
  type DocumentReport,
  type ReadinessGroup,
  type ReadinessReport,
} from '@/lib/status'

import { APP_REQUIRED_PAGE_FIELDS, VIBE_CHECK_IDENTIFIERS } from './config'
import translationsSchema from './translationsSchema.json' with { type: 'json' }

// =============================================================================
// Per-project config — extracted from the global's own document by the
// virtualReadinessField factory and threaded into each compute function.
// =============================================================================

const DEFAULT_BASELINE_COUNTRY = 'GB'

export type WeMeditateAppStatusConfig = {
  baselineCountry: string
  launchCriticalAppCardIds: Array<number | string>
}

export function extractWeMeditateAppStatusConfig(data: unknown): WeMeditateAppStatusConfig {
  if (!isRecord(data)) {
    return { baselineCountry: DEFAULT_BASELINE_COUNTRY, launchCriticalAppCardIds: [] }
  }
  const country =
    typeof data.baselineCountry === 'string' && data.baselineCountry.length === 2
      ? data.baselineCountry
      : DEFAULT_BASELINE_COUNTRY
  const launchCriticalRaw = Array.isArray(data.launchCriticalAppCards)
    ? data.launchCriticalAppCards
    : []
  const launchCriticalIds = launchCriticalRaw
    .map(refId)
    .filter((id): id is number | string => id !== null)
  return { baselineCountry: country, launchCriticalAppCardIds: launchCriticalIds }
}

// =============================================================================
// Request-scoped memoizer for wm-app-config — Sections 4 + 5 both read it.
// Keyed on `${locale}:${depth}` so the two callers can request different
// depths without colliding.
// =============================================================================

const APP_CONFIG_CACHE_KEY = 'wmAppConfigCache'

async function getWmAppConfig(
  payload: BasePayload,
  locale: TypedLocale,
  depth: 0 | 1,
  req?: PayloadRequest,
): Promise<Record<string, unknown>> {
  const key = `${locale}:${depth}`
  const ctx = (req?.context ?? {}) as Record<string, unknown>
  const existing = ctx[APP_CONFIG_CACHE_KEY] as
    | Map<string, Record<string, unknown>>
    | undefined

  if (existing?.has(key)) return existing.get(key)!

  const config = (await payload.findGlobal({
    slug: 'wm-app-config',
    locale,
    depth,
    req,
  })) as unknown as Record<string, unknown>

  if (req) {
    const cache = existing ?? new Map<string, Record<string, unknown>>()
    cache.set(key, config)
    ctx[APP_CONFIG_CACHE_KEY] = cache
    req.context = ctx
  }
  return config
}

// =============================================================================
// Section 1 — UserChoices
// =============================================================================

const PER_TIMING_FIELDS = {
  morning: 'morningMeditation',
  afternoon: 'afternoonMeditation',
  evening: 'eveningMeditation',
  night: 'nightMeditation',
} as const

type Timing = keyof typeof PER_TIMING_FIELDS

function meditationMatchesLocale(value: unknown, locale: string): boolean {
  if (!isRecord(value)) return false
  return value.locale === locale && value._status === 'published'
}

type UserChoiceRow = Record<string, unknown>

export async function computeUserChoicesReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  _config: WeMeditateAppStatusConfig,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  // Depth 1 hydrates per-timing meditation references so we can inspect locale + _status.
  const { docs } = await payload.find({
    collection: 'user-choices',
    locale,
    limit: 0,
    pagination: false,
    depth: 1,
    req,
  })
  const rows = docs as unknown as UserChoiceRow[]

  const buildPerTimingChecks = (choice: UserChoiceRow): CheckResult[] => {
    const timings = Array.isArray(choice.timings) ? (choice.timings as string[]) : []
    return timings
      .filter((t): t is Timing => t in PER_TIMING_FIELDS)
      .map((t) => ({
        key: `meditation-${t}-published`,
        passed: meditationMatchesLocale(choice[PER_TIMING_FIELDS[t]], locale),
      }))
  }

  const toDocReport = (choice: UserChoiceRow): DocumentReport => ({
    id: choice.id as number | string,
    label: labelOf(choice as { id: number | string; title?: unknown }),
    checks: buildPerTimingChecks(choice),
  })

  const featuredDocs = rows
    .filter((c) => c.isFeatured === true && c.type !== 'duration')
    .map(toDocReport)
  const durationDocs = rows.filter((c) => c.type === 'duration').map(toDocReport)

  const NON_FEATURED_THRESHOLD = 4
  const countForTiming = (timing: Timing) =>
    rows.filter((c) => {
      if (c.isFeatured) return false
      if (c.type !== 'mood' && c.type !== 'goal') return false
      const timings = Array.isArray(c.timings) ? (c.timings as string[]) : []
      if (!timings.includes(timing)) return false
      return meditationMatchesLocale(c[PER_TIMING_FIELDS[timing]], locale)
    }).length

  const groups: ReadinessGroup[] = [
    documentsGroup('featured', featuredDocs),
    documentsGroup('duration', durationDocs),
    aggregateGroup('non-featured-morning', countForTiming('morning'), NON_FEATURED_THRESHOLD),
    aggregateGroup('non-featured-afternoon', countForTiming('afternoon'), NON_FEATURED_THRESHOLD),
    aggregateGroup('non-featured-evening', countForTiming('evening'), NON_FEATURED_THRESHOLD),
    aggregateGroup('non-featured-night', countForTiming('night'), NON_FEATURED_THRESHOLD),
  ]

  return { groups, ...summarize(groups) }
}

// =============================================================================
// Section 2 — Lessons (Path Steps)
// =============================================================================

const REQUIRED_UNIT_COUNT = 3

function getUnitOptions(payload: BasePayload): string[] {
  const lessonsConfig = payload.collections['lessons']?.config
  if (!lessonsConfig) return []
  const unitField = findFieldByName(lessonsConfig.fields, 'unit') as SelectField | undefined
  if (!unitField || !Array.isArray(unitField.options)) return []
  return unitField.options.map((o) => (typeof o === 'string' ? o : o.value))
}

function unitGroupKey(unitLabel: string): string {
  return unitLabel.toLowerCase().replace(/\s+/g, '-')
}

export async function computeLessonsReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  _config: WeMeditateAppStatusConfig,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  const unitOptions = getUnitOptions(payload)
  const { docs: lessons } = await payload.find({
    collection: 'lessons',
    locale,
    limit: 0,
    pagination: false,
    depth: 0,
    req,
  })

  const groups: ReadinessGroup[] = unitOptions.map((unit, index) => {
    const unitLessons = lessons.filter((l) => l.unit === unit)
    const documents: DocumentReport[] = unitLessons.map((lesson) => ({
      id: lesson.id,
      label: labelOf(lesson as { id: number | string; title?: unknown }),
      checks: [
        {
          key: 'panels-set',
          passed: Array.isArray(lesson.panels) && lesson.panels.length >= 1,
        },
        { key: 'intro-audio-set', passed: isUploadAssigned(lesson.introAudio) },
        { key: 'meditation-set', passed: refId(lesson.meditation) !== null },
        { key: 'article-localized', passed: richTextHasContent(lesson.article) },
        {
          key: 'article-has-lecture-link',
          passed: containsRelationship(lesson.article, 'lectures'),
        },
        { key: 'icon-set', passed: isUploadAssigned(lesson.icon) },
      ],
    }))
    return documentsGroup(unitGroupKey(unit), documents, index >= REQUIRED_UNIT_COUNT)
  })

  return { groups, ...summarize(groups) }
}

// =============================================================================
// Section 3 — Lectures
// =============================================================================

const PRIORITY_USERCHOICE_THRESHOLD = 10
const BASELINE_AUDIENCE_THRESHOLD = 20

function lectureHasSubtitlesForLocale(
  lecture: Record<string, unknown>,
  locale: TypedLocale,
): boolean {
  const clipOverrides = Array.isArray(lecture.subtitles)
    ? (lecture.subtitles as Array<{ locale?: string; url?: string }>)
    : []
  if (
    clipOverrides.some(
      (s) => s?.locale === locale && typeof s.url === 'string' && s.url.length > 0,
    )
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
  return subs.some(
    (s) => isRecord(s) && s.languageCode === locale && typeof s.url === 'string',
  )
}

export async function computeLecturesReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  config: WeMeditateAppStatusConfig,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  // Priority/user-choice aggregate — one DB count.
  const priorityCount = await payload.count({
    collection: 'lectures',
    where: {
      and: [{ priority: { greater_than: 0 } }, { userChoices: { exists: true } }],
    },
    locale,
    req,
  })

  // Baseline-audience aggregate — resolve audience IDs then count overlapping lectures.
  const baselineAudienceIds = await resolveAudienceIds(
    payload,
    {
      pathProgress: 0,
      meditationsPerWeek: 0,
      totalMeditationsViewed: 0,
      totalLecturesViewed: 0,
      country: config.baselineCountry,
    },
    req,
  )
  const baselineLectureCount = await countLecturesForAudiences(payload, {
    audiences: baselineAudienceIds,
    locale,
    req,
  })

  // User-choice coverage — one bulk fetch of every lecture that points at a
  // user-choice, then aggregate covered IDs in JS. Avoids N+1 counts.
  const [{ docs: userChoices }, { docs: lecturesWithUserChoices }] = await Promise.all([
    payload.find({
      collection: 'user-choices',
      locale,
      limit: 0,
      pagination: false,
      depth: 0,
      req,
    }),
    payload.find({
      collection: 'lectures',
      where: { userChoices: { exists: true } },
      select: { userChoices: true },
      locale,
      limit: 0,
      pagination: false,
      depth: 0,
      req,
    }),
  ])

  const coveredUserChoiceIds = new Set<number | string>()
  for (const lec of lecturesWithUserChoices) {
    const refs = (lec as { userChoices?: unknown }).userChoices
    if (!Array.isArray(refs)) continue
    for (const r of refs) {
      const id = refId(r)
      if (id !== null) coveredUserChoiceIds.add(id)
    }
  }

  const userChoiceCoverage: DocumentReport[] = userChoices.map((choice) => ({
    id: choice.id,
    label: labelOf(choice as { id: number | string; title?: unknown }),
    checks: [{ key: 'has-lecture', passed: coveredUserChoiceIds.has(choice.id) }],
  }))

  // Lesson-referenced subtitles — walk every lesson's `article`, collect the
  // referenced lecture IDs, then one fetch by id list at depth 1 for clip→parent.
  const { docs: lessons } = await payload.find({
    collection: 'lessons',
    locale,
    limit: 0,
    pagination: false,
    depth: 0,
    req,
  })
  const referencedLectureIds = Array.from(
    new Set(lessons.flatMap((l) => collectRelationshipIds(l.article, 'lectures'))),
  )
  let referencedLectures: Record<string, unknown>[] = []
  if (referencedLectureIds.length > 0) {
    const { docs } = await payload.find({
      collection: 'lectures',
      where: { id: { in: referencedLectureIds } },
      locale,
      limit: 0,
      pagination: false,
      depth: 1,
      req,
    })
    referencedLectures = docs as unknown as Record<string, unknown>[]
  }
  const subtitleDocs: DocumentReport[] = referencedLectures.map((lecture) => ({
    id: lecture.id as number,
    label: labelOf(lecture as { id: number | string; title?: unknown }),
    checks: [
      {
        key: 'subtitles-available',
        passed: lectureHasSubtitlesForLocale(lecture, locale),
      },
    ],
  }))

  const groups: ReadinessGroup[] = [
    aggregateGroup(
      'priority-with-userchoice',
      priorityCount.totalDocs,
      PRIORITY_USERCHOICE_THRESHOLD,
    ),
    aggregateGroup('baseline-audience', baselineLectureCount, BASELINE_AUDIENCE_THRESHOLD),
    documentsGroup('user-choice-coverage', userChoiceCoverage),
    documentsGroup('lesson-referenced-subtitles', subtitleDocs),
  ]

  return { groups, ...summarize(groups) }
}

// =============================================================================
// Section 4 — Pages (bulk-fetch all required pages in one query)
// =============================================================================

export async function computePagesReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  _config: WeMeditateAppStatusConfig,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  // Resolve the page ids the report cares about — 6 from wm-app-config's
  // Pages tab + every subtle-system-node's `page` relationship.
  const [appConfig, { docs: nodes }] = await Promise.all([
    getWmAppConfig(payload, locale, 0, req),
    payload.find({
      collection: 'subtle-system-nodes',
      locale,
      limit: 0,
      pagination: false,
      depth: 1,
      req,
    }),
  ])

  const corePageIds = APP_REQUIRED_PAGE_FIELDS.map((fieldName) => refId(appConfig[fieldName]))
  const nodePageIds = nodes.map((n) =>
    refId((n as unknown as Record<string, unknown>).page),
  )

  const allIds = Array.from(
    new Set(
      [...corePageIds, ...nodePageIds].filter(
        (id): id is number | string => id !== null,
      ),
    ),
  )

  const pages =
    allIds.length === 0
      ? []
      : (
          await payload.find({
            collection: 'pages',
            where: { id: { in: allIds } },
            locale,
            limit: 0,
            pagination: false,
            depth: 0,
            req,
          })
        ).docs
  const pagesById = new Map<number | string, Record<string, unknown>>(
    pages.map((p) => [p.id, p as unknown as Record<string, unknown>]),
  )

  function reportForPage(id: number | string | null): DocumentReport | null {
    if (id === null) return null
    const page = pagesById.get(id)
    if (!page) return null
    return {
      id: page.id as number | string,
      label: labelOf(page as { id: number | string; title?: unknown }),
      checks: [
        { key: 'published', passed: page._status === 'published' },
        { key: 'content-localized', passed: richTextHasContent(page.content) },
      ],
    }
  }

  const coreDocs = corePageIds
    .map(reportForPage)
    .filter((r): r is DocumentReport => r !== null)
  const nodeDocs = nodePageIds
    .map(reportForPage)
    .filter((r): r is DocumentReport => r !== null)

  const groups: ReadinessGroup[] = [
    documentsGroup('core-pages', coreDocs),
    documentsGroup('subtle-system-pages', nodeDocs),
  ]

  return { groups, ...summarize(groups) }
}

// =============================================================================
// Section 5 — App Configuration (wm-app-config)
// =============================================================================

type WmAppConfigSlice = {
  selfRealizationMeditation?: unknown
  postRealizationLecture?: unknown
  vibeCheckTracks?: unknown
}

export async function computeAppConfigReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  _config: WeMeditateAppStatusConfig,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  const appConfig = (await getWmAppConfig(payload, locale, 1, req)) as WmAppConfigSlice

  // Self-realization meditation — single 1-row group.
  const meditationRef = appConfig.selfRealizationMeditation
  const realizationPassed = meditationMatchesLocale(meditationRef, locale)
  const selfRealizationDocs: DocumentReport[] = [
    {
      id: refId(meditationRef) ?? 'unset',
      label: realizationPassed
        ? labelOf(meditationRef as { id: number | string; title?: unknown })
        : 'Self-realization meditation',
      checks: [{ key: 'set-and-published', passed: realizationPassed }],
    },
  ]

  // Post-realization lecture — single 1-row group.
  const lectureRef = appConfig.postRealizationLecture
  const lecturePassed = refId(lectureRef) !== null
  const postRealizationDocs: DocumentReport[] = [
    {
      id: refId(lectureRef) ?? 'unset',
      label: lecturePassed
        ? labelOf(lectureRef as { id: number | string; title?: unknown })
        : 'Post-realization lecture',
      checks: [{ key: 'set-and-exists', passed: lecturePassed }],
    },
  ]

  // Vibe-check tracks — one row per identifier.
  const tracks = Array.isArray(appConfig.vibeCheckTracks)
    ? (appConfig.vibeCheckTracks as Array<Record<string, unknown>>)
    : []
  const vibeCheckDocs: DocumentReport[] = VIBE_CHECK_IDENTIFIERS.map((id) => {
    const match = tracks.find((t) => t.identifier === id.value)
    return {
      id: id.value,
      label: id.label,
      checks: [
        { key: 'present', passed: !!match },
        { key: 'audio-set', passed: !!match && isUploadAssigned(match.audio) },
        { key: 'subtitles-set', passed: !!match && isUploadAssigned(match.subtitles) },
      ],
    }
  })

  const groups: ReadinessGroup[] = [
    documentsGroup('self-realization-meditation', selfRealizationDocs),
    documentsGroup('post-realization-lecture', postRealizationDocs),
    documentsGroup('vibe-check-tracks', vibeCheckDocs),
  ]

  return { groups, ...summarize(groups) }
}

// =============================================================================
// Section 6 — Translations (wm-app-translations)
// =============================================================================

type TranslationSchemaTab = {
  type: 'object'
  description?: string
  properties?: Record<string, unknown>
}

function countLeafKeys(group: TranslationSchemaTab): number {
  return group.properties ? Object.keys(group.properties).length : 0
}

function countNonEmptyKeys(
  group: TranslationSchemaTab,
  data: Record<string, unknown> | null | undefined,
): number {
  if (!data || !group.properties) return 0
  return Object.keys(group.properties).filter((key) => {
    const value = data[key]
    return typeof value === 'string' && value.trim().length > 0
  }).length
}

export async function computeTranslationsReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  _config: WeMeditateAppStatusConfig,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  const translations = (await payload.findGlobal({
    slug: 'wm-app-translations',
    locale,
    fallbackLocale: false,
    depth: 0,
    req,
  })) as unknown as Record<string, unknown>

  const tabProperties = (translationsSchema as { properties?: Record<string, TranslationSchemaTab> })
    .properties
  const tabEntries: Array<[string, TranslationSchemaTab]> = tabProperties
    ? Object.entries(tabProperties)
    : []

  const aggregateGroups: ReadinessGroup[] = tabEntries.map(([tabSlug, tabSchema]) => {
    const total = countLeafKeys(tabSchema)
    const filled = countNonEmptyKeys(
      tabSchema,
      translations[tabSlug] as Record<string, unknown> | undefined,
    )
    return aggregateGroup(`translations-${tabSlug}`, filled, total)
  })

  const lastReviewedAt =
    typeof translations.lastReviewedAt === 'string' ? translations.lastReviewedAt : null
  const manualReviewGroup = documentsGroup('manual-review', [
    {
      id: locale,
      label: lastReviewedAt ?? 'Never reviewed',
      checks: [{ key: 'reviewed-this-cycle', passed: lastReviewedAt !== null }],
    },
  ])

  const groups: ReadinessGroup[] = [...aggregateGroups, manualReviewGroup]
  return { groups, ...summarize(groups) }
}

// =============================================================================
// Section 7 — App Cards
// =============================================================================

function appCardChecks(card: Record<string, unknown>): CheckResult[] {
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

export async function computeAppCardsReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  config: WeMeditateAppStatusConfig,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  const launchCriticalIds = config.launchCriticalAppCardIds

  let launchCriticalCards: Record<string, unknown>[] = []
  if (launchCriticalIds.length > 0) {
    const { docs } = await payload.find({
      collection: 'app-cards',
      where: { id: { in: launchCriticalIds } },
      locale,
      draft: true,
      limit: 0,
      pagination: false,
      depth: 0,
      req,
    })
    launchCriticalCards = docs as unknown as Record<string, unknown>[]
  }

  const launchCriticalDocs: DocumentReport[] = launchCriticalCards.map((card) => ({
    id: card.id as number,
    label: labelOf(card as { id: number | string; title?: unknown; name?: unknown }),
    checks: appCardChecks(card),
  }))

  const otherCardsQuery =
    launchCriticalIds.length > 0 ? { id: { not_in: launchCriticalIds } } : undefined
  const { docs: otherCardDocs } = await payload.find({
    collection: 'app-cards',
    where: otherCardsQuery,
    locale,
    draft: true,
    limit: 0,
    pagination: false,
    depth: 0,
    req,
  })
  const otherDocs: DocumentReport[] = (
    otherCardDocs as unknown as Record<string, unknown>[]
  ).map((card) => ({
    id: card.id as number,
    label: labelOf(card as { id: number | string; title?: unknown; name?: unknown }),
    checks: appCardChecks(card),
  }))

  const groups: ReadinessGroup[] = [
    documentsGroup('launch-critical-cards', launchCriticalDocs),
    documentsGroup('other-cards', otherDocs, true),
  ]

  return { groups, ...summarize(groups) }
}

// =============================================================================
// Global config
// =============================================================================

countries.registerLocale(enLocale)

const COUNTRY_OPTIONS = Object.entries(countries.getNames('en'))
  .map(([value, label]) => ({ label: label as string, value }))
  .sort((a, b) => a.label.localeCompare(b.label))

export const WeMeditateAppStatus: GlobalConfig = {
  slug: 'wm-app-status',
  admin: {
    group: 'WeMeditate App',
  },
  label: 'Launch Readiness',
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Status',
          description:
            'Per-locale launch-readiness report. Each section is recomputed when the global is read.',
          fields: [
            virtualReadinessField(
              'userChoices',
              computeUserChoicesReadiness,
              extractWeMeditateAppStatusConfig,
            ),
            virtualReadinessField(
              'lessons',
              computeLessonsReadiness,
              extractWeMeditateAppStatusConfig,
            ),
            virtualReadinessField(
              'lectures',
              computeLecturesReadiness,
              extractWeMeditateAppStatusConfig,
            ),
            virtualReadinessField(
              'pages',
              computePagesReadiness,
              extractWeMeditateAppStatusConfig,
            ),
            virtualReadinessField(
              'appConfig',
              computeAppConfigReadiness,
              extractWeMeditateAppStatusConfig,
            ),
            virtualReadinessField(
              'translations',
              computeTranslationsReadiness,
              extractWeMeditateAppStatusConfig,
            ),
            virtualReadinessField(
              'appCards',
              computeAppCardsReadiness,
              extractWeMeditateAppStatusConfig,
            ),
          ],
        },
        {
          label: 'Configuration',
          description: 'Readiness configuration. Admin-only.',
          admin: { condition: adminOnlyCondition },
          fields: [
            {
              name: 'launchCriticalAppCards',
              type: 'relationship',
              relationTo: 'app-cards',
              hasMany: true,
              access: { update: adminOnlyFieldAccess },
              admin: {
                description:
                  'App cards that must be ready before launch. All other app cards roll up under the optional "other-cards" group.',
              },
            },
            {
              name: 'baselineCountry',
              type: 'select',
              options: COUNTRY_OPTIONS,
              localized: true,
              required: true,
              defaultValue: DEFAULT_BASELINE_COUNTRY,
              access: { update: adminOnlyFieldAccess },
              admin: {
                description:
                  'Baseline country used to resolve the new-user audience set for this locale.',
              },
            },
          ],
        },
      ],
    },
  ],
}
