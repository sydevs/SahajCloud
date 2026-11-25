/**
 * `reconcileEnglishDefaults` against a real database.
 *
 * This is the half of the English-defaults mechanism a unit spec cannot reach:
 * two UPDATE statements over a global's localized table and its version table,
 * where every guard is SQL. It replaced a hand-written data migration per key
 * (#1218), and the migrations it replaced were never replayed by any lane —
 * `push: !isProduction` builds every test schema — so this is the first time
 * copy reaching a database that predates its key is checked at all.
 *
 * The version row is not an extra: `updateGlobal` loads the document it is
 * about to write from the `latest: true` version, so a key written only to the
 * main row is deleted again by the next ordinary save. The last case is what
 * holds that.
 */

import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TRANSLATIONS_TARGETS } from '@/globals'
import {
  reconcileEnglishDefaults,
  type TranslationsTarget,
} from '@/lib/translations/englishDefaults'

import { createTestEnvironment } from '../utils/testHelpers'

const SLUG = 'wm-web-translations'
const KEY = 'wisdom_sidetext'

describe('reconcileEnglishDefaults', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  /** The `blocks.general` blob as one locale holds it. */
  async function blocksGeneral(locale: 'en' | 'fr'): Promise<Record<string, unknown>> {
    const doc = await payload.findGlobal({ slug: SLUG, locale, fallbackLocale: false, depth: 0 })
    const blocks = (doc as { blocks?: { general?: Record<string, unknown> } }).blocks
    return blocks?.general ?? {}
  }

  async function writeBlocksGeneral(
    locale: 'en' | 'fr',
    general: Record<string, string>,
  ): Promise<void> {
    await payload.updateGlobal({ slug: SLUG, locale, data: { blocks: { general } } })
  }

  it('adds a declared key English does not hold, keeping the keys beside it', async () => {
    await writeBlocksGeneral('en', { hours: 'Hours' })
    expect(await blocksGeneral('en')).not.toHaveProperty(KEY)

    await reconcileEnglishDefaults(payload, TRANSLATIONS_TARGETS)

    expect(await blocksGeneral('en')).toEqual({ hours: 'Hours', [KEY]: 'Ancient Wisdom' })
  })

  it('leaves a stored value alone, however often it runs', async () => {
    await writeBlocksGeneral('en', { hours: 'Hours', [KEY]: 'Older Wisdom' })

    await reconcileEnglishDefaults(payload, TRANSLATIONS_TARGETS)
    await reconcileEnglishDefaults(payload, TRANSLATIONS_TARGETS)

    expect((await blocksGeneral('en'))[KEY]).toBe('Older Wisdom')
  })

  // A default is English copy, not a translation. Every other locale resolves
  // through `clientEnglishFallback` instead.
  it('writes nothing into another locale', async () => {
    await writeBlocksGeneral('fr', { hours: 'Heures' })

    await reconcileEnglishDefaults(payload, TRANSLATIONS_TARGETS)

    expect(await blocksGeneral('fr')).toEqual({ hours: 'Heures' })
  })

  // Two defaults in one column, one of them stored: the statement writes the
  // whole blob, so the merge order decides whether the stored one survives.
  // `wm-web-translations` declares one default per column, so this case builds
  // its own target rather than reaching for another global's.
  it('fills the absent key of a column whose other key is stored', async () => {
    const twoKeys: TranslationsTarget = {
      slug: SLUG,
      schema: {
        properties: {
          blocks: {
            type: 'object',
            properties: {
              general: {
                type: 'object',
                properties: {
                  hours: { type: 'string', default: 'Declared Hours' },
                  [KEY]: { type: 'string', default: 'Ancient Wisdom' },
                },
              },
            },
          },
        },
      },
    }
    await writeBlocksGeneral('en', { hours: 'Hours' })

    await reconcileEnglishDefaults(payload, [twoKeys])

    expect(await blocksGeneral('en')).toEqual({ hours: 'Hours', [KEY]: 'Ancient Wisdom' })
  })

  // The version half. A key written only to the main row survives until the
  // next save of the global reloads the document from the version row.
  it('survives the next ordinary save of the global', async () => {
    await writeBlocksGeneral('en', { hours: 'Hours' })
    await reconcileEnglishDefaults(payload, TRANSLATIONS_TARGETS)

    await payload.updateGlobal({
      slug: SLUG,
      locale: 'en',
      data: { navigation: { about_meditation: 'About Meditation' } },
    })

    expect((await blocksGeneral('en'))[KEY]).toBe('Ancient Wisdom')
  })
})
