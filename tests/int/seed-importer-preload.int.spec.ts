/**
 * `BaseImporter.preloadCollection` must see soft-deleted documents.
 *
 * The preload cache answers "does this natural key already exist?" — and a trashed
 * doc still occupies its key. Payload appends a `deletedAt exists: false` filter to
 * every find unless `trash: true` is passed, so without it the cache misses a
 * trashed row; `upsert` then takes its `isPreloaded && !preloadedDoc` branch and
 * calls `payload.create` directly (there is no fallback find), producing a
 * duplicate on every re-seed while the trashed original lingers.
 *
 * This bit Files/Images in production: `CleanupOrphanedMedia` trashes orphans, so a
 * later storyblok/meditations seed re-uploaded them instead of finding the trashed
 * row. `events` is used here because it's trash-enabled and needs no upload
 * fixture — the `preloadCollection` code path is shared by every collection, so the
 * mechanism is identical.
 */
import type { CollectionSlug, Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BaseImporter, Logger, type BaseImportOptions } from '../../seeds/lib'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Minimal concrete importer exposing the two protected members under test.
 * `run()` is deliberately not used — it owns the whole lifecycle (config load,
 * cache dirs, reporting); this only needs `payload` + `logger`.
 */
class PreloadProbe extends BaseImporter {
  protected readonly importName = 'Preload Probe'
  protected readonly cacheDir = '/tmp/seed-preload-probe'

  constructor(payload: Payload, options: Partial<BaseImportOptions> = {}) {
    super({ dryRun: false, clearCache: false, ...options })
    this.payload = payload
    this.logger = new Logger()
  }

  protected async import(): Promise<void> {
    // Unused: the probe drives preloadCollection directly.
  }

  preload(collection: CollectionSlug, naturalKey: string) {
    return this.preloadCollection(collection, naturalKey)
  }

  seesKey(collection: CollectionSlug, key: string): boolean {
    return this.hasPreloaded(collection, key)
  }
}

describe('BaseImporter preload is trash-aware', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let liveLegacyId: number
  let trashedLegacyId: number
  let trashedId: number

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
  })

  afterAll(async () => {
    await cleanup()
  })

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
