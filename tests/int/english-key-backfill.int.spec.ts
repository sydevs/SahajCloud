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
 * The real column pair for `common.a11y` on `wm-web-translations`: a sub-grouped
 * tab stores one jsonb column per leaf group, named `<tab>_<sub>` and prefixed
 * `version_` in the versions table. Verified against that global's
 * `translationsSchema.json`, whose `common` tab declares `general` + `a11y`.
 */
const TABLE = 'wm_web_translations'
const GROUP = { main: 'common_a11y', version: 'version_common_a11y' }

const MAIN_TABLE = `${TABLE}_locales`
const VERSION_TABLE = `_${TABLE}_v_locales`
const VERSIONS_TABLE = `_${TABLE}_v`

/** A key the seeded group holds, and one it does not. */
const CHOSEN = 'close'
const ADDED = 'dismiss'

describe('English key backfill', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let schema: string

  const qualified = (table: string) => sql`${sql.identifier(schema)}.${sql.identifier(table)}`

  /** The leaf column of every row for one locale in the main locales table. */
  const mainValues = async (locale: string) => {
    const { rows } = await payload.db.drizzle.execute(sql`
      SELECT ${sql.identifier(GROUP.main)} AS value
        FROM ${qualified(MAIN_TABLE)}
        WHERE "_locale" = ${locale}`)
    return rows.map((row) => (row as { value: unknown }).value)
  }

  /**
   * Every version row for one locale, each carrying its version's `latest`
   * flag. How many Payload writes per save is Payload's business, so nothing
   * below counts them.
   */
  const versionValues = async (locale: string) => {
    const { rows } = await payload.db.drizzle.execute(sql`
      SELECT parent."latest" AS latest, row.${sql.identifier(GROUP.version)} AS value
        FROM ${qualified(VERSION_TABLE)} row
        JOIN ${qualified(VERSIONS_TABLE)} parent ON parent."id" = row."_parent_id"
        WHERE row."_locale" = ${locale}`)
    return rows as { latest: boolean | null; value: Record<string, unknown> }[]
  }

  /** Stores a raw jsonb value in the leaf column, past the field's own validator. */
  const store = async (locale: string, value: string) => {
    for (const [table, column] of [
      [MAIN_TABLE, GROUP.main],
      [VERSION_TABLE, GROUP.version],
    ]) {
      await payload.db.drizzle.execute(sql`
        UPDATE ${qualified(table!)}
          SET ${sql.identifier(column!)} = ${value}::jsonb
          WHERE "_locale" = ${locale}`)
    }
  }

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    if (!payload.db.schemaName) throw new Error('the suite has no isolated schema to target')
    schema = payload.db.schemaName

    // Two saves, so the versions table holds a superseded row as well as the
    // latest one — which is the only thing that can show `latestOnly` working.
    await payload.updateGlobal({
      slug: 'wm-web-translations',
      locale: 'en',
      data: { common: { a11y: { [CHOSEN]: 'Close' } } },
    })
    await payload.updateGlobal({
      slug: 'wm-web-translations',
      locale: 'cs',
      data: { common: { a11y: { [CHOSEN]: 'Zavřít' } } },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('adds the key to English and to the latest version row only', async () => {
    await withSchema(payload, (tx) =>
      addEnglishKey(tx, { table: TABLE, group: GROUP, key: ADDED, en: 'Dismiss' }),
    )

    expect(await mainValues('en')).toEqual([{ [CHOSEN]: 'Close', [ADDED]: 'Dismiss' }])
    expect(await mainValues('cs')).toEqual([{ [CHOSEN]: 'Zavřít' }])

    const versions = await versionValues('en')
    expect(versions.filter((row) => row.latest).map((row) => row.value)).toEqual([
      { [CHOSEN]: 'Close', [ADDED]: 'Dismiss' },
    ])

    const superseded = versions.filter((row) => !row.latest)
    expect(superseded.length).toBeGreaterThan(0)
    expect(superseded.filter((row) => ADDED in row.value)).toEqual([])
  })

  it('leaves a key English already holds alone', async () => {
    await withSchema(payload, (tx) =>
      addEnglishKey(tx, { table: TABLE, group: GROUP, key: CHOSEN, en: 'Shut' }),
    )

    expect(await mainValues('en')).toEqual([{ [CHOSEN]: 'Close', [ADDED]: 'Dismiss' }])
  })

  it('drops the key from every locale and every version row', async () => {
    await withSchema(payload, (tx) =>
      dropEnglishKey(tx, { table: TABLE, group: GROUP, key: CHOSEN }),
    )

    expect(await mainValues('en')).toEqual([{ [ADDED]: 'Dismiss' }])
    expect(await mainValues('cs')).toEqual([{}])
    expect((await versionValues('en')).filter((row) => CHOSEN in row.value)).toEqual([])
    expect((await versionValues('cs')).filter((row) => CHOSEN in row.value)).toEqual([])
  })

  // Both guards are `jsonb_typeof(col) = 'object'`. `? key` cannot stand in for
  // it: it is true for a string scalar equal to the key, and true for an array
  // holding it, so each case below uses a key the stored value does not equal
  // where that is what the guard has to decide.
  describe.each([
    { shape: 'a string scalar', stored: '"menu"' },
    { shape: 'an array', stored: '["menu"]' },
  ])('with $shape in the column', ({ stored }) => {
    it('writes nothing, rather than replacing the group with an array', async () => {
      await store('en', stored)

      await withSchema(payload, (tx) =>
        addEnglishKey(tx, { table: TABLE, group: GROUP, key: ADDED, en: 'Dismiss' }),
      )

      expect(await mainValues('en')).toEqual([JSON.parse(stored)])
      expect((await versionValues('en')).map((row) => row.value)).toContainEqual(JSON.parse(stored))
    })

    it('deletes nothing, and raises no error', async () => {
      await store('en', stored)

      await expect(
        withSchema(payload, (tx) =>
          dropEnglishKey(tx, { table: TABLE, group: GROUP, key: 'menu' }),
        ),
      ).resolves.toBeUndefined()

      expect(await mainValues('en')).toEqual([JSON.parse(stored)])
      expect((await versionValues('en')).map((row) => row.value)).toContainEqual(JSON.parse(stored))
    })
  })
})
