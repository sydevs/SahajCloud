/**
 * What `BaseImporter.preloadCollection` must see: soft-deleted documents, and
 * the locale it was asked for.
 *
 * The preload cache answers "does this natural key already exist?" — and a trashed
 * doc still occupies its key. Payload appends a `deletedAt exists: false` filter to
 * every find unless `trash: true` is passed, so without it the cache misses a
 * trashed row. `upsert` then takes its `isPreloaded && !preloadedDoc` branch and
 * calls `payload.create` directly (there is no fallback find), producing a
 * duplicate on every re-seed while the trashed original lingers.
 *
 * This bit Files/Images in production: `CleanupOrphanedMedia` trashes orphans, so a
 * later storyblok/meditations seed re-uploaded them instead of finding the trashed
 * row. `events` is used here because it is trash-enabled and needs no upload
 * fixture — the `preloadCollection` code path is shared by every collection, so the
 * mechanism is identical.
 *
 * The locale half is `meditations`, which is the one collection here whose
 * rows each belong to a single locale: `filterMeditationsByLocale` appends
 * `{ locale: { equals: req.locale } }` to every find, and a Local API read
 * naming no locale resolves the default `en`. So a cache built with no locale
 * holds English rows only, and `upsert` sends every other locale's row to
 * `payload.create` with no fallback find — `label` is not unique, so a re-seed
 * duplicates rather than erroring.
 */
import type { CollectionSlug, Payload, TypedLocale } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BaseImporter, Logger, ValidationReport, type BaseImportOptions } from '../../seeds/lib'
import {
  EXPECTED_COUNTS,
  getCountableCollections,
  type ScriptName,
} from '../../seeds/lib/expectedCounts'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Minimal concrete importer exposing the two protected members under test.
 * `run()` is deliberately not used — it owns the whole lifecycle (config load,
 * cache dirs, reporting). This supplies the three members it would have set by
 * the time `setup()` preloads: the report included, since a preload can warn.
 */
class PreloadProbe extends BaseImporter {
  protected readonly importName = 'Preload Probe'
  protected readonly cacheDir = '/tmp/seed-preload-probe'

  constructor(payload: Payload, options: Partial<BaseImportOptions> = {}) {
    super({ dryRun: false, clearCache: false, ...options })
    this.payload = payload
    this.logger = new Logger()
    this.report = new ValidationReport()
  }

  protected async import(): Promise<void> {
    // Unused: the probe drives preloadCollection directly.
  }

  preload(collection: CollectionSlug, naturalKey: string, locale?: TypedLocale | 'all') {
    return this.preloadCollection(collection, naturalKey, undefined, locale)
  }

  warnings(): string[] {
    return this.report.getWarnings()
  }

  seesKey(collection: CollectionSlug, key: string): boolean {
    return this.hasPreloaded(collection, key)
  }
}

describe('BaseImporter.preloadCollection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let liveLegacyId: number
  let trashedLegacyId: number
  let trashedId: number
  let englishLabel: string
  let czechLabel: string

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const live = await testData.createEvent(payload, {
      title: 'Live Event',
      legacyId: 900001,
    } as never)
    liveLegacyId = live.legacyId as number

    const doomed = await testData.createEvent(payload, {
      title: 'Trashed Event',
      legacyId: 900002,
    } as never)
    trashedId = doomed.id
    trashedLegacyId = doomed.legacyId as number

    // Trashing is setting `deletedAt` — `payload.delete` is a *hard* delete even on
    // a `trash: true` collection (its own `trash` arg only gates which docs are
    // deletable). Same mechanism the ExpireEvents job uses to trash an event.
    await payload.update({
      collection: 'events',
      id: trashedId,
      data: { deletedAt: new Date().toISOString() },
      context: { skipVerifyHook: true },
      overrideAccess: true,
    })

    const english = await testData.createMeditation(payload, undefined, {
      label: 'Preload Probe English',
      locale: 'en',
    })
    englishLabel = english.label

    const czech = await testData.createMeditation(payload, undefined, {
      label: 'Preload Probe Czech',
      locale: 'cs',
    })
    czechLabel = czech.label
  })

  afterAll(async () => {
    await cleanup()
  })

  it('confirms the fixtures really are one locale each', async () => {
    const { docs } = await payload.find({
      collection: 'meditations',
      where: { label: { in: [englishLabel, czechLabel] } },
      locale: 'all',
      overrideAccess: true,
    })
    expect(docs.map((d) => d.locale).sort()).toEqual(['cs', 'en'])
  })

  describe('is trash-aware', () => {
    it('confirms the fixture really is soft-deleted, not gone', async () => {
      const trashed = await payload.findByID({
        collection: 'events',
        id: trashedId,
        overrideAccess: true,
        trash: true,
      })
      expect(trashed.deletedAt).toBeTruthy()

      // …and invisible to a default find, which is what broke the preload.
      const { docs } = await payload.find({
        collection: 'events',
        where: { legacyId: { equals: trashedLegacyId } },
        overrideAccess: true,
      })
      expect(docs).toHaveLength(0)
    })

    it('caches a trashed doc, so a re-seed updates rather than duplicates it', async () => {
      const probe = new PreloadProbe(payload)
      await probe.preload('events', 'legacyId')

      expect(probe.seesKey('events', String(liveLegacyId))).toBe(true)
      // The regression: without `trash: true` this is false and upsert creates a
      // second row for legacyId 900002 on every subsequent run.
      expect(probe.seesKey('events', String(trashedLegacyId))).toBe(true)
    })

    it('still finds it in update mode', async () => {
      const probe = new PreloadProbe(payload, { updateMode: true })
      await probe.preload('events', 'legacyId')
      expect(probe.seesKey('events', String(trashedLegacyId))).toBe(true)
    })
  })

  /**
   * `getDatabaseCounts` in the seed route derives its collection list from
   * `getCountableCollections`, so a metadata slug that names a logical step
   * rather than a collection makes `payload.count` throw — and the route then
   * returns no counts at all, failing verification on every floor. `atlas`'s
   * `pictures` is that case, declared `notACollection`. Nothing but a real
   * Payload can say whether a slug is one.
   */
  describe('every countable collection a script declares is real', () => {
    const scripts = Object.keys(EXPECTED_COUNTS) as ScriptName[]

    scripts.forEach((script) => {
      it(`counts every collection ${script} declares`, async () => {
        const collections = getCountableCollections(script)

        for (const slug of collections) {
          const { totalDocs } = await payload.count({
            collection: slug as CollectionSlug,
            overrideAccess: true,
          })
          expect(totalDocs).toBeGreaterThanOrEqual(0)
        }
      })
    })
  })

  describe('reads the locale it is given', () => {
    it('sees English alone when no locale is passed', async () => {
      const probe = new PreloadProbe(payload)
      await probe.preload('meditations', 'label')

      expect(probe.seesKey('meditations', englishLabel)).toBe(true)
      // The gap: `req.locale` resolves to `en`, so the hook narrows the cache
      // and every other locale's row reads as absent.
      expect(probe.seesKey('meditations', czechLabel)).toBe(false)
    })

    it("sees every locale under 'all'", async () => {
      const probe = new PreloadProbe(payload)
      await probe.preload('meditations', 'label', 'all')

      expect(probe.seesKey('meditations', englishLabel)).toBe(true)
      expect(probe.seesKey('meditations', czechLabel)).toBe(true)
    })

    it('warns rather than silently answering under the first locale', async () => {
      const probe = new PreloadProbe(payload)
      await probe.preload('meditations', 'label', 'en')
      await probe.preload('meditations', 'label', 'all')

      // One cache per collection, so the second call cannot widen the first.
      expect(probe.seesKey('meditations', czechLabel)).toBe(false)
      expect(probe.warnings().join('\n')).toContain('meditations')
    })
  })
})
