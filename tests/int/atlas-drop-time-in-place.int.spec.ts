/**
 * The #1057 sweep: `20261101_191500_atlas_drop_time_in_place`. Why a retired
 * key refuses every save of its global is `src/globals/AGENTS.md`'s rule.
 *
 * The first case is that defect, written as an assertion: seed the key
 * underneath validation, and a save of another tab is refused. The second is
 * the migration answering it. Empty `up`'s two statements and the second case
 * fails with the first's error — measured, not assumed.
 *
 * **This is the first spec in the repo to import a migration's `up`.** The
 * established shape is the opposite — `region-breadcrumb-url-backfill` and
 * `schedule-last-date-backfill` both exercise a routine kept in `src/lib/`.
 * Two unqualified SQL statements have no such routine to extract.
 *
 * **And its own file, though `translations-globals.int.spec.ts` owns this
 * ground.** That suite's own cases write the same single global, so a stored
 * key refusing every write would break all of them unless these two ran last
 * with the sweep as their teardown.
 *
 * ⚠ **`up` writes unqualified table names**, which is right for production,
 * where the schema is `public`. `withSchema` runs it against this suite's own
 * schema instead, and says why that takes one transaction.
 */
import type { MigrateUpArgs } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { up } from '@/migrations/20261101_191500_atlas_drop_time_in_place'

import { createTestEnvironment } from '../utils/testHelpers'
import { withSchema } from '../utils/withSchema'

const SLUG = 'sy-atlas-translations'
const HOSTED_FROM = 'Hosted from %{city}'
const RETIRED = '%{time} in %{city}'

describe('atlas translations: the retired time_in_place key', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Through the API first, so the row and its version row exist at all.
    await payload.updateGlobal({
      slug: SLUG,
      data: { event: { display: { hosted_from: HOSTED_FROM } } },
    })
    // Then the retired key, underneath the validator that now refuses it —
    // raw, because `payload.db.updateGlobal` takes no locale and reads a
    // localized JSON column's own keys as locale codes. The version row is
    // seeded with it, for the reason the migration sweeps that table.
    const patch = JSON.stringify({ time_in_place: RETIRED })
    await withSchema(payload, async (tx) => {
      await tx.execute(sql`
        UPDATE "sy_atlas_translations_locales"
          SET "event_display" = "event_display" || ${patch}::jsonb`)
      await tx.execute(sql`
        UPDATE "_sy_atlas_translations_v_locales"
          SET "version_event_display" =
            coalesce("version_event_display", '{}'::jsonb) || ${patch}::jsonb`)
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  /**
   * A save of ANOTHER tab, which is where the hazard bites: a write that
   * replaces `event.display` wholesale never sees the stored key.
   */
  const saveAnotherTab = () =>
    payload.updateGlobal({ slug: SLUG, data: { countries: { title: 'Countries' } } })

  it('refuses a save of any other tab while the stored key is there', async () => {
    // Payload names the field rather than quoting Ajv, so the message reads as
    // a broken Event tab on a write that never touched it.
    await expect(saveAnotherTab()).rejects.toThrow(/field is invalid: Event > Display/)
  })

  it('is swept by the migration, leaving hosted_from in place', async () => {
    // `up` destructures `db` alone. `req` is what the migration chain supplies
    // and this call has none, so the cast stands in for it rather than for the
    // whole argument.
    await withSchema(payload, (tx) => up({ db: tx, payload } as unknown as MigrateUpArgs))

    await expect(saveAnotherTab()).resolves.toBeTruthy()

    const stored = await payload.findGlobal({ slug: SLUG })
    expect(stored.event?.display).toEqual({ hosted_from: HOSTED_FROM })
  })
})
