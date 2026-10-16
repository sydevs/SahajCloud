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
 * The locale half is `meditations`, the one collection here whose rows each
 * belong to a single locale. The mechanism, and what a wrong locale costs, are
 * in the Preload pattern in seeds/lib/AGENTS.md.
 */
import type { CollectionSlug, Payload, TypedLocale } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BaseImporter, Logger, ValidationReport, type BaseImportOptions } from '../../seeds/lib'
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
  let sharedImageId: number

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

    // One image and one narrator for all three fixtures below: each
    // `createMeditation` would otherwise upload its own resized thumbnail.
    const thumbnail = (await testData.createMediaImage(payload, { alt: 'Probe thumbnail' })).id
    const narrator = (await testData.createNarrator(payload, { name: 'Probe Narrator' })).id
    sharedImageId = thumbnail

    const english = await testData.createMeditation(
      payload,
      { narrator, thumbnail },
      {
        label: 'Preload Probe English',
        locale: 'en',
      },
    )
    englishLabel = english.label

    const czech = await testData.createMeditation(
      payload,
      { narrator, thumbnail },
      {
        label: 'Preload Probe Czech',
        locale: 'cs',
      },
    )
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

    /**
     * `albums.title` and `songs.title` are localized, and `wemeditate` preloads
     * both by `title`. Under `'all'` Payload returns a per-locale object there,
     * which `String()` would collapse onto one `[object Object]` key — every
     * row colliding, so every lookup but one misses and `upsert` creates a
     * duplicate. Merging the locales instead would answer a `cs` existence
     * question with an `en` row, which skips creating the `cs` one. Neither is
     * an answer, so the preload refuses the key and says so.
     */
    it("refuses a localized natural key under 'all'", async () => {
      // Through the fixture helper: `albums` also requires `artist` and an
      // `artwork` upload, verified against src/collections/Albums/Albums.ts.
      const album = await testData.createAlbum(payload, {
        title: 'Preload Probe Album',
        artwork: sharedImageId,
      })
      await payload.update({
        collection: 'albums',
        id: album.id,
        locale: 'cs',
        // `artist` is required AND localized, so writing a second locale has
        // to supply it — the English value does not satisfy validation there.
        data: { title: 'Preload Probe Album CS', artist: 'Test Artist' },
      })

      const probe = new PreloadProbe(payload)
      const cache = await probe.preload('albums', 'title', 'all')

      expect(cache.size).toBe(0)
      expect(probe.seesKey('albums', '[object Object]')).toBe(false)
      expect(probe.warnings().join('\n')).toContain('localized')
    })

    it('does not warn when one call states the locale the other inherits', async () => {
      const probe = new PreloadProbe(payload)
      await probe.preload('meditations', 'label')
      await probe.preload('meditations', 'label', 'en')

      // Both read English rows, so a mixed pair of call sites is not a conflict.
      expect(probe.warnings()).toEqual([])
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
