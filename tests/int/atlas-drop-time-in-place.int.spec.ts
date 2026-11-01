/**
 * The #1057 sweep: `20261101_191500_atlas_drop_time_in_place`.
 *
 * Dropping a key from `translationsSchema.json` does not touch the JSON column
 * that stored it, and `event.display` declares `additionalProperties: false`.
 * Payload merges the stored value into a field the write never mentions and
 * validates it, so a value left holding the retired key refuses every save of
 * `sy-atlas-translations` that does not itself replace that group.
 *
 * So the first case here is the defect, written as an assertion: seed the key
 * underneath validation, and a save of another tab is refused. The second is
 * the migration answering it. Empty `up`'s two statements and the second case
 * fails with the first's error — measured, not assumed.
 *
 * ⚠ **`up` writes unqualified table names**, which is right for production,
 * where the schema is `public`. This lane gives each suite its own Postgres
 * schema, and `execute` draws from a pool, so a bare `SET search_path` would
 * land on whichever connection answered it. Both calls below therefore run
 * inside one transaction with `SET LOCAL search_path` — one connection, undone
 * at commit. That is the only accommodation the migration gets: its statements
 * run verbatim.
 */
import type { Payload } from 'payload'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { up } from '@/migrations/20261101_191500_atlas_drop_time_in_place'

import { createTestEnvironment } from '../utils/testHelpers'

const SLUG = 'sy-atlas-translations'
const HOSTED_FROM = 'Hosted from %{city}'
const RETIRED = '%{time} in %{city}'

describe('atlas translations: the retired time_in_place key', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  /** Runs `body` against this suite's own Postgres schema, on one connection. */
  let inSchema: (body: (tx: unknown) => Promise<void>) => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    const db = payload.db as unknown as {
      drizzle: {
        transaction: (
          cb: (tx: { execute: (q: unknown) => Promise<unknown> }) => Promise<void>,
        ) => Promise<void>
      }
      schemaName?: string
    }
    const schema = db.schemaName
    // Without it every statement below would read `public`, where this suite
    // has no tables — and the migration case would pass having swept nothing.
    if (!schema) throw new Error('the suite has no isolated schema to target')
    inSchema = (body) =>
      db.drizzle.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL search_path TO ${sql.raw(`"${schema}"`)}`)
        await body(tx)
      })

    // Through the API first, so the row and its version row exist at all.
    await payload.updateGlobal({
      slug: SLUG,
      data: { event: { display: { hosted_from: HOSTED_FROM } } },
    })
    // Then the retired key, underneath the validator that now refuses it. The
    // version row is seeded too: `updateGlobal` loads the document it is about
    // to change from `latest: true`, so a key left there comes back and
    // refuses the save again.
    await inSchema(async (tx) => {
      const t = tx as { execute: (q: unknown) => Promise<unknown> }
      await t.execute(sql`
        UPDATE "sy_atlas_translations_locales"
          SET "event_display" = "event_display" || ${sql.raw(`'{"time_in_place":"${RETIRED}"}'::jsonb`)};
        UPDATE "_sy_atlas_translations_v_locales"
          SET "version_event_display" = coalesce("version_event_display", '{}'::jsonb)
            || ${sql.raw(`'{"time_in_place":"${RETIRED}"}'::jsonb`)};`)
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  /**
   * A save of ANOTHER tab, which is where the hazard bites. Payload merges the
   * stored value into a field the write never mentions and validates it, so
   * `event_display` is checked on a save that had nothing to do with it. A
   * write that replaces `event.display` wholesale validates only what it
   * carries and never sees the stored key — which is why this is not that.
   */
  const saveAnotherTab = () =>
    payload.updateGlobal({ slug: SLUG, data: { countries: { title: 'Countries' } } })

  it('refuses a save of any other tab while the stored key is there', async () => {
    // Payload names the field rather than quoting Ajv, so the message reads as
    // a broken Event tab on a write that never touched it.
    await expect(saveAnotherTab()).rejects.toThrow(/field is invalid: Event > Display/)
  })

  it('is swept by the migration, leaving hosted_from in place', async () => {
    await inSchema(async (tx) => {
      await up({ db: tx, payload } as never)
    })

    await expect(saveAnotherTab()).resolves.toBeTruthy()

    const stored = await payload.findGlobal({ slug: SLUG })
    expect(stored.event?.display).toEqual({ hosted_from: HOSTED_FROM })
  })
})
