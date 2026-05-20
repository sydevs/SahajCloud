import type {
  GlobalConfig,
  BasePayload,
  JSONField,
  SelectField,
  PayloadRequest,
  TypedLocale,
} from 'payload'

import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

import { adminOnlyCondition, adminOnlyFieldAccess } from '@/lib/access'
import {
  countLecturesForAudiences,
  resolveAudienceIds,
} from '@/lib/audiences/resolve'

import { APP_REQUIRED_PAGE_FIELDS, VIBE_CHECK_IDENTIFIERS } from './config'
import translationsSchema from './translationsSchema.json' with { type: 'json' }

// =============================================================================
// Types — shared report shape
// =============================================================================

export type CheckResult = {
  key: string
  passed: boolean
}

export type DocumentReport = {
  id: number | string
  label: string
  checks: CheckResult[]
}

export type ReadinessGroup =
  | {
      type: 'documents'
      key: string
      optional?: boolean
      documents: DocumentReport[]
      summary: { total: number; passing: number }
    }
  | {
      type: 'aggregate'
      key: string
      optional?: boolean
      passed: boolean
      actual: number
      threshold: number
    }

export type ReadinessReport = {
  groups: ReadinessGroup[]
  summary: { total: number; passing: number }
  optionalSummary?: { total: number; passing: number }
}

// =============================================================================
// Helpers — group construction, lexical walker, content emptiness
// =============================================================================

function isGroupPassing(group: ReadinessGroup): boolean {
  if (group.type === 'aggregate') return group.passed
  return group.documents.every((d) => d.checks.every((c) => c.passed))
}

function documentsGroup(
  key: string,
  documents: DocumentReport[],
  optional = false,
): ReadinessGroup {
  return {
    type: 'documents',
    key,
    ...(optional ? { optional: true } : {}),
    documents,
    summary: {
      total: documents.length,
      passing: documents.filter((d) => d.checks.every((c) => c.passed)).length,
    },
  }
}

function aggregateGroup(
  key: string,
  actual: number,
  threshold: number,
  optional = false,
): ReadinessGroup {
  return {
    type: 'aggregate',
    key,
    ...(optional ? { optional: true } : {}),
    passed: actual >= threshold,
    actual,
    threshold,
  }
}

function summarize(groups: ReadinessGroup[]): {
  summary: ReadinessReport['summary']
  optionalSummary?: ReadinessReport['optionalSummary']
} {
  const required = groups.filter((g) => !g.optional)
  const optional = groups.filter((g) => !!g.optional)
  const summary = {
    total: required.length,
    passing: required.filter(isGroupPassing).length,
  }
  if (optional.length === 0) return { summary }
  return {
    summary,
    optionalSummary: {
      total: optional.length,
      passing: optional.filter(isGroupPassing).length,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Walks a Lexical rich-text value (root + children) and returns true when any
 * descendant is a `relationship` node pointing at the supplied collection.
 */
function containsLectureRelationship(value: unknown): boolean {
  if (!isRecord(value)) return false
  const root = (value as { root?: unknown }).root
  if (!isRecord(root)) return false
  const rootChildren = (root as { children?: unknown }).children
  if (!Array.isArray(rootChildren)) return false

  const visit = (node: unknown): boolean => {
    if (!isRecord(node)) return false
    if (node.type === 'relationship' && node.relationTo === 'lectures') return true
    const children = (node as { children?: unknown }).children
    if (Array.isArray(children)) return children.some(visit)
    return false
  }

  return rootChildren.some(visit)
}

/**
 * Collects every lecture ID referenced by `relationship` nodes whose
 * `relationTo === 'lectures'` in a Lexical tree. Used by Section 3's
 * `lesson-referenced-subtitles` group to enumerate lectures linked from
 * lessons' `article` fields.
 */
function collectLectureRelationshipIds(value: unknown): number[] {
  if (!isRecord(value)) return []
  const root = (value as { root?: unknown }).root
  if (!isRecord(root)) return []
  const rootChildren = (root as { children?: unknown }).children
  if (!Array.isArray(rootChildren)) return []

  const found = new Set<number>()
  const visit = (node: unknown): void => {
    if (!isRecord(node)) return
    if (node.type === 'relationship' && node.relationTo === 'lectures') {
      const v = (node as { value?: unknown }).value
      if (typeof v === 'number') found.add(v)
      else if (isRecord(v) && typeof v.id === 'number') found.add(v.id)
    }
    const children = (node as { children?: unknown }).children
    if (Array.isArray(children)) children.forEach(visit)
  }
  rootChildren.forEach(visit)
  return Array.from(found)
}

/**
 * Treats a Lexical rich-text value as "non-empty" if its root has at least
 * one child node carrying real content (text, embedded relationship,
 * block, etc.).
 */
function richTextHasContent(value: unknown): boolean {
  if (!isRecord(value)) return false
  const root = (value as { root?: unknown }).root
  if (!isRecord(root)) return false
  const rootChildren = (root as { children?: unknown }).children
  if (!Array.isArray(rootChildren) || rootChildren.length === 0) return false

  const visit = (node: unknown): boolean => {
    if (!isRecord(node)) return false
    const t = (node as { type?: unknown }).type
    if (t === 'relationship' || t === 'upload' || t === 'block' || t === 'image') return true
    const text = (node as { text?: unknown }).text
    if (typeof text === 'string' && text.trim().length > 0) return true
    const children = (node as { children?: unknown }).children
    return Array.isArray(children) && children.some(visit)
  }

  return rootChildren.some(visit)
}

function refId(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (isRecord(value)) {
    const v = (value as { id?: unknown }).id
    if (typeof v === 'number' || typeof v === 'string') return v
  }
  return null
}

function isUploadAssigned(value: unknown): boolean {
  return refId(value) !== null
}

function labelOf(doc: { id: number | string; title?: unknown; name?: unknown }): string {
  if (typeof doc.title === 'string' && doc.title.trim().length > 0) return doc.title
  if (typeof doc.name === 'string' && doc.name.trim().length > 0) return doc.name
  return `#${doc.id}`
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
  const docLocale = (value as { locale?: unknown }).locale
  const status = (value as { _status?: unknown })._status
  return docLocale === locale && status === 'published'
}

export async function computeUserChoicesReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  // Depth 1 hydrates per-timing meditation references so we can inspect locale + _status.
  const { docs: choices } = await payload.find({
    collection: 'user-choices',
    locale,
    limit: 0,
    pagination: false,
    depth: 1,
    req,
  })

  const buildPerTimingChecks = (choice: Record<string, unknown>) => {
    const timings = Array.isArray(choice.timings) ? (choice.timings as string[]) : []
    return timings
      .filter((t): t is Timing => t in PER_TIMING_FIELDS)
      .map((t) => {
        const med = choice[PER_TIMING_FIELDS[t]]
        return {
          key: `meditation-${t}-published`,
          passed: meditationMatchesLocale(med, locale),
        }
      })
  }

  const featuredDocs: DocumentReport[] = choices
    .filter((c) => c.isFeatured === true && c.type !== 'duration')
    .map((c) => ({
      id: c.id,
      label: labelOf(c as { id: number | string; title?: unknown }),
      checks: buildPerTimingChecks(c as unknown as Record<string, unknown>),
    }))

  const durationDocs: DocumentReport[] = choices
    .filter((c) => c.type === 'duration')
    .map((c) => ({
      id: c.id,
      label: labelOf(c as { id: number | string; title?: unknown }),
      checks: buildPerTimingChecks(c as unknown as Record<string, unknown>),
    }))

  const NON_FEATURED_THRESHOLD = 4
  const countForTiming = (timing: Timing) =>
    choices.filter((c) => {
      if (c.isFeatured) return false
      if (c.type !== 'mood' && c.type !== 'goal') return false
      const timings = Array.isArray(c.timings) ? (c.timings as string[]) : []
      if (!timings.includes(timing)) return false
      const med = (c as unknown as Record<string, unknown>)[PER_TIMING_FIELDS[timing]]
      return meditationMatchesLocale(med, locale)
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

function findFieldByName(fields: unknown[], name: string): unknown {
  for (const field of fields) {
    if (!isRecord(field)) continue
    if (field.name === name) return field
    // Recurse into common container types
    if (Array.isArray(field.fields)) {
      const found = findFieldByName(field.fields, name)
      if (found) return found
    }
    if (field.type === 'tabs' && Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
        if (isRecord(tab) && Array.isArray(tab.fields)) {
          const found = findFieldByName(tab.fields, name)
          if (found) return found
        }
      }
    }
  }
  return undefined
}

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
          passed: containsLectureRelationship(lesson.article),
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
const DEFAULT_BASELINE_COUNTRY = 'GB'

// req.context flag set while a compute function is reading the status
// global's own config-tab fields. The per-field afterRead hooks check this
// flag and short-circuit when set so we don't recursively re-enter the
// computations during the inner findGlobal call.
const STATUS_RECURSION_CONTEXT_KEY = 'wmAppStatusRecursing'

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

  // For clips with metadata: null, fall back to the populated parent.
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

async function fetchStatusGlobalRaw(
  payload: BasePayload,
  locale: TypedLocale,
  req?: PayloadRequest,
): Promise<Record<string, unknown> | null> {
  // Setting this context flag short-circuits the per-field afterRead hooks
  // (see `virtualReadinessField`), preventing infinite recursion when a
  // compute function needs to read its own global's config-tab fields.
  const ctx = req?.context ?? {}
  const prev = (ctx as Record<string, unknown>)[STATUS_RECURSION_CONTEXT_KEY]
  if (req) {
    req.context = ctx
    ;(req.context as Record<string, unknown>)[STATUS_RECURSION_CONTEXT_KEY] = true
  }
  try {
    return (await payload.findGlobal({
      slug: 'wm-app-status',
      locale,
      depth: 0,
      req,
    })) as unknown as Record<string, unknown> | null
  } finally {
    if (req) {
      ;(req.context as Record<string, unknown>)[STATUS_RECURSION_CONTEXT_KEY] = prev
    }
  }
}

async function getBaselineCountry(
  payload: BasePayload,
  locale: TypedLocale,
  req?: PayloadRequest,
): Promise<string> {
  const status = await fetchStatusGlobalRaw(payload, locale, req)
  const country = status?.baselineCountry
  if (typeof country === 'string' && country.length === 2) return country
  return DEFAULT_BASELINE_COUNTRY
}

export async function computeLecturesReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  // Priority/user-choice aggregate — single count via DB
  const priorityCount = await payload.count({
    collection: 'lectures',
    where: {
      and: [{ priority: { greater_than: 0 } }, { userChoices: { exists: true } }],
    },
    locale,
    req,
  })

  // Baseline-audience aggregate — resolve audience IDs then count overlapping lectures.
  const baselineCountry = await getBaselineCountry(payload, locale, req)
  const baselineAudienceIds = await resolveAudienceIds(
    payload,
    {
      pathProgress: 0,
      meditationsPerWeek: 0,
      totalMeditationsViewed: 0,
      totalLecturesViewed: 0,
      country: baselineCountry,
    },
    req,
  )
  const baselineLectureCount = await countLecturesForAudiences(payload, {
    audiences: baselineAudienceIds,
    locale,
    req,
  })

  // User-choice coverage — one row per user choice, check has-lecture via reverse join.
  const { docs: userChoices } = await payload.find({
    collection: 'user-choices',
    locale,
    limit: 0,
    pagination: false,
    depth: 0,
    req,
  })
  const userChoiceCoverage: DocumentReport[] = await Promise.all(
    userChoices.map(async (choice) => {
      const count = await payload.count({
        collection: 'lectures',
        where: { userChoices: { in: [choice.id] } },
        locale,
        req,
      })
      return {
        id: choice.id,
        label: labelOf(choice as { id: number | string; title?: unknown }),
        checks: [{ key: 'has-lecture', passed: count.totalDocs > 0 }],
      }
    }),
  )

  // Lesson-referenced subtitles — collect lecture IDs referenced by lessons' article (Lexical).
  const { docs: lessons } = await payload.find({
    collection: 'lessons',
    locale,
    limit: 0,
    pagination: false,
    depth: 0,
    req,
  })
  const referencedLectureIds = Array.from(
    new Set(lessons.flatMap((l) => collectLectureRelationshipIds(l.article))),
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
// Section 4 — Pages
// =============================================================================

async function pageCheck(
  payload: BasePayload,
  pageId: number | string | null,
  locale: TypedLocale,
  req?: PayloadRequest,
): Promise<DocumentReport | null> {
  if (pageId === null || pageId === undefined) return null
  try {
    const page = (await payload.findByID({
      collection: 'pages',
      id: pageId,
      locale,
      depth: 0,
      req,
    })) as unknown as Record<string, unknown>
    return {
      id: page.id as number,
      label: labelOf(page as { id: number | string; title?: unknown }),
      checks: [
        { key: 'published', passed: page._status === 'published' },
        { key: 'content-localized', passed: richTextHasContent(page.content) },
      ],
    }
  } catch {
    return null
  }
}

export async function computePagesReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  // Core pages — read from wm-app-config Pages tab
  const config = (await payload.findGlobal({
    slug: 'wm-app-config',
    depth: 0,
    locale,
    req,
  })) as unknown as Record<string, unknown>
  const corePageReports = await Promise.all(
    APP_REQUIRED_PAGE_FIELDS.map((fieldName) =>
      pageCheck(payload, refId(config[fieldName]), locale, req),
    ),
  )
  const coreDocs = corePageReports.filter((r): r is DocumentReport => r !== null)

  // Subtle system pages — derived from subtle-system-nodes collection
  const { docs: nodes } = await payload.find({
    collection: 'subtle-system-nodes',
    locale,
    limit: 0,
    pagination: false,
    depth: 1,
    req,
  })
  const nodePageReports = await Promise.all(
    nodes.map((n) =>
      pageCheck(payload, refId((n as unknown as Record<string, unknown>).page), locale, req),
    ),
  )
  const nodeDocs = nodePageReports.filter((r): r is DocumentReport => r !== null)

  const groups: ReadinessGroup[] = [
    documentsGroup('core-pages', coreDocs),
    documentsGroup('subtle-system-pages', nodeDocs),
  ]

  return { groups, ...summarize(groups) }
}

// =============================================================================
// Section 5 — App Configuration (wm-app-config)
// =============================================================================

export async function computeAppConfigReadiness(
  payload: BasePayload,
  locale: TypedLocale,
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  const config = (await payload.findGlobal({
    slug: 'wm-app-config',
    locale,
    depth: 1,
    req,
  })) as unknown as Record<string, unknown>

  // Self-realization meditation — single 1-row group
  const meditationRef = config.selfRealizationMeditation
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

  // Post-realization lecture — single 1-row group
  const lectureRef = config.postRealizationLecture
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

  // Vibe-check tracks — one row per identifier
  const tracks = Array.isArray(config.vibeCheckTracks)
    ? (config.vibeCheckTracks as Array<Record<string, unknown>>)
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
  req?: PayloadRequest,
): Promise<ReadinessReport> {
  const status = await fetchStatusGlobalRaw(payload, locale, req)

  const launchCriticalRaw = Array.isArray(status?.launchCriticalAppCards)
    ? (status!.launchCriticalAppCards as unknown[])
    : []
  const launchCriticalIds = launchCriticalRaw
    .map(refId)
    .filter((id): id is number | string => id !== null)

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
    launchCriticalIds.length > 0
      ? { id: { not_in: launchCriticalIds } }
      : undefined
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
// Field factory + global config
// =============================================================================

countries.registerLocale(enLocale)

const COUNTRY_OPTIONS = Object.entries(countries.getNames('en'))
  .map(([value, label]) => ({ label: label as string, value }))
  .sort((a, b) => a.label.localeCompare(b.label))

type ComputeFn = (
  payload: BasePayload,
  locale: TypedLocale,
  req?: PayloadRequest,
) => Promise<ReadinessReport>

function virtualReadinessField(name: string, compute: ComputeFn): JSONField {
  return {
    name,
    type: 'json',
    virtual: true,
    localized: true,
    admin: {
      readOnly: true,
      description: `Computed launch-readiness report for the ${name} section in the current locale.`,
    },
    hooks: {
      afterRead: [
        async ({ req }) => {
          const locale = req.locale
          if (!locale || locale === 'all') return null
          // Short-circuit when a compute function is reading this same
          // global's config-tab fields — see fetchStatusGlobalRaw.
          if ((req.context as Record<string, unknown>)?.[STATUS_RECURSION_CONTEXT_KEY]) return null
          return compute(req.payload, locale, req)
        },
      ],
    },
  }
}

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
            virtualReadinessField('userChoices', computeUserChoicesReadiness),
            virtualReadinessField('lessons', computeLessonsReadiness),
            virtualReadinessField('lectures', computeLecturesReadiness),
            virtualReadinessField('pages', computePagesReadiness),
            virtualReadinessField('appConfig', computeAppConfigReadiness),
            virtualReadinessField('translations', computeTranslationsReadiness),
            virtualReadinessField('appCards', computeAppCardsReadiness),
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
