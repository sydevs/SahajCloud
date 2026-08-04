import type { CollectionBeforeChangeHook, FieldHook, PayloadRequest } from 'payload'

import type { EventQualityInput, EventQualityReport, TitleTemplateSet } from '@/lib/eventQuality'
import {
  buildEventQualityReport,
  countOpenDocumentIssues,
  localeForLanguage,
  QUALITY_CHECK_VERSION,
  qualityLocalesForEvent,
} from '@/lib/eventQuality'
import type { EventTitleSlot } from '@/lib/eventTitle/compose'
import { EVENT_TITLE_DEFAULTS, EVENT_TITLE_SLOTS } from '@/lib/eventTitle/compose'
import type { LocaleCode } from '@/lib/locales'

/** `req.context` keys — one in-flight load each, shared across a request. */
const TEMPLATES_CACHE_KEY = 'eventQualityTitleTemplates'
const PENDING_LOCALES_KEY = 'eventQualityPendingLocales'

/** Only what the per-locale tier needs, so the read can't recurse into this hook. */
const LOCALIZED_TITLE_SELECT = { title: true } as const

/**
 * Memoize an in-flight load on `req.context`, keyed by `key`.
 *
 * The **promise** is stored, not its resolved value: a bulk read can issue many
 * hooks concurrently, and a resolved-value cache stampedes under that — every
 * caller clears the "not cached yet" check before the first load settles. A
 * failed load is evicted so a later read in the same request can retry. Same
 * reasoning (and the same shape) as `resolveTitleTemplates` in ./eventTitle.
 */
function memoizeOnRequest<T>(req: PayloadRequest, key: string, load: () => Promise<T>): Promise<T> {
  const ctx = (req.context ?? {}) as Record<string, unknown>
  let inFlight = ctx[key] as Promise<T> | undefined
  if (!inFlight) {
    inFlight = load()
    ctx[key] = inFlight
    req.context = ctx
    void inFlight.catch(() => {
      if (ctx[key] === inFlight) delete ctx[key]
    })
  }
  return inFlight
}

/**
 * Auto-title templates for every locale, in one `locale: 'all'` read of the
 * Atlas translations global.
 *
 * The per-locale title tier has to know whether a stored title is the auto-fill
 * for *that locale* — comparing a German auto-title against the English
 * template would read it as hand-written prose and flag it. One read covers all
 * 19 locales; a per-locale read would be 19.
 */
async function loadTitleTemplates(
  req: PayloadRequest,
): Promise<Partial<Record<string, TitleTemplateSet>>> {
  return memoizeOnRequest(req, TEMPLATES_CACHE_KEY, async () => {
    try {
      const translations = await req.payload.findGlobal({
        slug: 'sy-atlas-translations',
        locale: 'all',
        depth: 0,
        req,
      })
      // With `locale: 'all'` a localized leaf reads as `{ en: {...}, de: {...} }`.
      const byLocale = (translations as { event?: { title?: Record<string, unknown> } }).event
        ?.title
      const resolved: Partial<Record<string, TitleTemplateSet>> = {}
      for (const [locale, stored] of Object.entries(byLocale ?? {})) {
        const templates = { ...EVENT_TITLE_DEFAULTS }
        for (const slot of EVENT_TITLE_SLOTS) {
          const value = (stored as Record<EventTitleSlot, unknown> | null)?.[slot]
          if (typeof value === 'string' && value.trim()) templates[slot] = value
        }
        resolved[locale] = templates
      }
      return resolved
    } catch (error) {
      req.payload.logger.debug({
        msg: 'Failed to read sy-atlas-translations event.title for quality checks; using defaults',
        error,
      })
      return {}
    }
  })
}

/**
 * Every locale's `title` for one event, in a single `locale: 'all'` read.
 *
 * The document handed to an `afterRead` hook carries only the locale it was
 * read in, so the translation tier — "which of my languages has no title" —
 * cannot be answered from it. The `select` is what keeps this from recursing:
 * with the report field unselected, its own `afterRead` never runs.
 */
async function loadLocalizedTitles(
  req: PayloadRequest,
  id: number | string,
): Promise<Record<string, string>> {
  return memoizeOnRequest(req, `eventQualityTitles:${id}`, async () => {
    const doc = await req.payload.findByID({
      collection: 'events',
      id,
      locale: 'all',
      depth: 0,
      select: LOCALIZED_TITLE_SELECT,
      req,
    })
    const title = (doc as { title?: unknown }).title
    return title && typeof title === 'object' ? (title as Record<string, string>) : {}
  })
}

/**
 * Locales the event gained in the save currently in flight, stashed by
 * `stampEventQuality` for the `afterRead` that follows it in the same request.
 */
function pendingLocalesFor(req: PayloadRequest, id: number | string): string[] {
  const ctx = (req.context ?? {}) as Record<string, unknown>
  const byId = ctx[PENDING_LOCALES_KEY] as Record<string, string[]> | undefined
  return byId?.[String(id)] ?? []
}

function rememberPendingLocales(req: PayloadRequest, id: unknown, locales: LocaleCode[]): void {
  if (id == null || locales.length === 0) return
  const ctx = (req.context ?? {}) as Record<string, unknown>
  const byId = (ctx[PENDING_LOCALES_KEY] as Record<string, string[]> | undefined) ?? {}
  byId[String(id)] = locales
  ctx[PENDING_LOCALES_KEY] = byId
  req.context = ctx
}

/**
 * `afterRead` for the virtual `qualityReport` field.
 *
 * Skipped entirely on a list read (`findMany`): the report needs two extra
 * queries, and paying them 25 times to render a list nobody reads the report in
 * would be the one thing that makes this feature expensive. The list view sorts
 * on the stored `qualityOpenCount` instead.
 */
export const computeEventQualityReport: FieldHook = async ({ data, req, findMany }) => {
  if (findMany) return null
  const event = (data ?? {}) as EventQualityInput & { id?: number | string }
  const id = event.id
  if (id == null) return null

  // Cheap exit before either query — a skipped report needs neither.
  const skipped = buildEventQualityReport(event, { locales: [] })
  if (skipped.skipped) return skipped

  const [templates, titles] = await Promise.all([
    loadTitleTemplates(req),
    loadLocalizedTitles(req, id),
  ])

  return buildEventQualityReport(
    { ...event, title: titles },
    {
      locales: qualityLocalesForEvent(event),
      pendingLocales: pendingLocalesFor(req, id),
      templates,
    },
  ) satisfies EventQualityReport
}

/**
 * Collection-level `beforeChange` stamping the two stored columns.
 *
 * Collection-level, not a field hook, on purpose: Payload materialises `{}` for
 * a group an incoming patch omits, so a field hook computing from its own
 * sibling data would NULL the column on every unrelated write — the trap
 * documented for `computeLastDate` in `.claude/rules/collections.md`. Computing
 * from `{ ...originalDoc, ...data }` means a partial patch recomputes against
 * the whole document, an unrelated patch is a no-op, and any write back-fills a
 * row that predates the column.
 */
export const stampEventQuality: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const merged = { ...(originalDoc ?? {}), ...data } as EventQualityInput & { id?: unknown }

  // A language chosen in this very save cannot have a translation yet, so the
  // afterRead that follows reports those locales as pending rather than failing.
  const before = new Set(qualityLocalesForEvent((originalDoc ?? {}) as EventQualityInput))
  const added = Array.isArray(data?.languages)
    ? (data.languages as unknown[])
        .map((language) => (typeof language === 'string' ? localeForLanguage(language) : null))
        .filter((locale): locale is LocaleCode => !!locale && !before.has(locale))
    : []
  rememberPendingLocales(req, originalDoc?.id ?? merged.id, added)

  return {
    ...data,
    qualityOpenCount: countOpenDocumentIssues(merged),
    qualityCheckVersion: QUALITY_CHECK_VERSION,
  }
}
