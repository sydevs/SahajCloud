/**
 * `addEnglishKey` / `dropEnglishKey` — the jsonb writes a translations global's
 * English copy ships as (`@/lib/translations/englishKeyBackfill`).
 *
 * This is an integration spec because both guards are Postgres semantics, not
 * SQL text. `||` on a scalar builds an array and `-` on one raises
 * `cannot delete from scalar`, so a unit assertion on the generated statement
 * would pass with the guard intact and see nothing of what it prevents.
 *
 * The column shapes the guards exist for — a bare scalar, an array — are
 * refused by the field's own `jsonSchema`, so only raw SQL can store one. That
 * is also why they are stored in `en` here and the cases below run in order:
 * a seeded scalar stays in the column until the next case overwrites it.
 */
import type { Payload } from 'payload'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { addEnglishKey, dropEnglishKey } from '@/lib/translations/englishKeyBackfill'

import { createTestEnvironment } from '../utils/testHelpers'
import { withSchema } from '../utils/withSchema'

/**
 * `common.general` on `wm-web-translations`, with the three table names and the
 * versions column spelled out rather than derived: they are what the module's
 * own derivation has to produce, so re-deriving them here would let both sides
 * be wrong together. Read off that global's `translationsSchema.json`, whose
 * `common` tab declares `general` alone.
 */
const TABLE = 'wm_web_translations'
const GROUP = 'common_general'

const MAIN_COLUMN = 'common_general'
const VERSION_COLUMN = 'version_common_general'
const MAIN_LOCALES = 'wm_web_translations_locales'
const VERSION_LOCALES = '_wm_web_translations_v_locales'
const VERSIONS = '_wm_web_translations_v'

/**
 * A key the seeded group holds, and one it does not. Both are declared, so the
 * seed below is a write `additionalProperties: false` accepts.
 */
const CHOSEN = 'loading'
const ADDED = 'show_more'

describe('English key backfill', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  /** The leaf column of every row for one locale in the main locales table. */
  const mainValues = (locale: string) =>
    withSchema(payload, async (tx) => {
      const { rows } = await tx.execute(sql`
        SELECT ${sql.identifier(MAIN_COLUMN)} AS value
          FROM ${sql.identifier(MAIN_LOCALES)}
          WHERE "_locale" = ${locale}`)
      return (rows as { value: Record<string, unknown> }[]).map((row) => row.value)
    })

  /**
   * Every version row for one locale, each carrying its version's `latest`
   * flag. How many Payload writes per save is Payload's business, so nothing
   * below counts them.
   */
  const versionValues = (locale: string) =>
    withSchema(payload, async (tx) => {
      const { rows } = await tx.execute(sql`
        SELECT parent."latest" AS latest, row.${sql.identifier(VERSION_COLUMN)} AS value
          FROM ${sql.identifier(VERSION_LOCALES)} row
          JOIN ${sql.identifier(VERSIONS)} parent ON parent."id" = row."_parent_id"
          WHERE row."_locale" = ${locale}`)
      return rows as { latest: boolean | null; value: Record<string, unknown> }[]
    })

  /** Stores a raw jsonb value in English's leaf column, past the field's own validator. */
  const store = (value: string) =>
    withSchema(payload, async (tx) => {
      for (const [table, column] of [
        [MAIN_LOCALES, MAIN_COLUMN],
        [VERSION_LOCALES, VERSION_COLUMN],
      ]) {
        await tx.execute(sql`
          UPDATE ${sql.identifier(table)}
            SET ${sql.identifier(column)} = ${value}::jsonb
            WHERE "_locale" = 'en'`)
      }
    })

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Two saves, so the versions table holds a superseded row as well as the
    // latest one — which is the only thing that can show `latestOnly` working.
    await payload.updateGlobal({
      slug: 'wm-web-translations',
      locale: 'en',
      data: { common: { general: { [CHOSEN]: 'Loading…' } } },
    })
    await payload.updateGlobal({
      slug: 'wm-web-translations',
      locale: 'cs',
      data: { common: { general: { [CHOSEN]: 'Načítání…' } } },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('adds the key to English and to the latest version row only', async () => {
    await withSchema(payload, (tx) =>
      addEnglishKey(tx, { table: TABLE, group: GROUP, key: ADDED, en: 'Show more' }),
    )

    expect(await mainValues('en')).toEqual([{ [CHOSEN]: 'Loading…', [ADDED]: 'Show more' }])
    expect(await mainValues('cs')).toEqual([{ [CHOSEN]: 'Načítání…' }])

    const versions = await versionValues('en')
    expect(versions.filter((row) => row.latest).map((row) => row.value)).toEqual([
      { [CHOSEN]: 'Loading…', [ADDED]: 'Show more' },
    ])

    const superseded = versions.filter((row) => !row.latest)
    expect(superseded.length).toBeGreaterThan(0)
    expect(superseded.filter((row) => ADDED in row.value)).toEqual([])
  })

  it('leaves a key English already holds alone', async () => {
    await withSchema(payload, (tx) =>
      addEnglishKey(tx, { table: TABLE, group: GROUP, key: CHOSEN, en: 'Shut' }),
    )

    expect(await mainValues('en')).toEqual([{ [CHOSEN]: 'Loading…', [ADDED]: 'Show more' }])
  })

  it('drops the key from every locale and every version row', async () => {
    await withSchema(payload, (tx) =>
      dropEnglishKey(tx, { table: TABLE, group: GROUP, key: CHOSEN }),
    )

    expect(await mainValues('en')).toEqual([{ [ADDED]: 'Show more' }])
    expect(await mainValues('cs')).toEqual([{}])
    expect((await versionValues('en')).filter((row) => CHOSEN in row.value)).toEqual([])
    expect((await versionValues('cs')).filter((row) => CHOSEN in row.value)).toEqual([])
  })

  // `?` answers yes to `menu` for a string scalar and for an array alike, so
  // each path needs the key that still reaches the row: one the value does not
  // hold for the write's `NOT col ? key`, and one it does for the delete's
  // `col ? key`. Either way `jsonb_typeof` is the only thing left refusing it.
  describe.each([
    { shape: 'a string scalar', stored: '"menu"' },
    { shape: 'an array', stored: '["menu"]' },
  ])('with $shape in the column', ({ stored }) => {
    it('writes nothing, rather than replacing the group with an array', async () => {
      await store(stored)

      await withSchema(payload, (tx) =>
        addEnglishKey(tx, { table: TABLE, group: GROUP, key: ADDED, en: 'Show more' }),
      )

      expect(await mainValues('en')).toEqual([JSON.parse(stored)])
      expect((await versionValues('en')).map((row) => row.value)).toContainEqual(JSON.parse(stored))
    })

    it('deletes nothing, and raises no error', async () => {
      await store(stored)

      await withSchema(payload, (tx) =>
        dropEnglishKey(tx, { table: TABLE, group: GROUP, key: 'menu' }),
      )

      expect(await mainValues('en')).toEqual([JSON.parse(stored)])
      expect((await versionValues('en')).map((row) => row.value)).toContainEqual(JSON.parse(stored))
    })
  })
})
