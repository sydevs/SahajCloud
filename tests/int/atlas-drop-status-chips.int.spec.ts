/**
 * The #1283 sweep: `20261126_180000_atlas_drop_status_chips`. Why a retired
 * key refuses every save of its global is `src/globals/AGENTS.md`'s rule.
 *
 * The first case is that defect as an assertion: seed the three keys underneath
 * validation, and a save of another tab is refused. The second is the
 * migration answering it, run inside `withSchema` so its unqualified table
 * names reach this suite's own schema.
 */
import type { MigrateUpArgs } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { up } from '@/migrations/20261126_180000_atlas_drop_status_chips'

import { createTestEnvironment } from '../utils/testHelpers'
import { withSchema } from '../utils/withSchema'

const SLUG = 'sy-atlas-translations'
const TODAY = 'Today'

describe('atlas translations: the retired event.display status chips', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Through the API first, so the row and its version row exist at all.
    await payload.updateGlobal({ slug: SLUG, data: { event: { display: { chip_today: TODAY } } } })
    // Then the retired keys, raw, underneath the validator that now refuses them.
    const patch = JSON.stringify({ chip_full: 'Full', chip_ended: 'Ended', chip_starts: 'Starts' })
    await withSchema(payload, async (tx) => {
      await tx.execute(sql`
        UPDATE "sy_atlas_translations_locales"
          SET "event_display" = coalesce("event_display", '{}'::jsonb) || ${patch}::jsonb`)
      await tx.execute(sql`
        UPDATE "_sy_atlas_translations_v_locales"
          SET "version_event_display" =
            coalesce("version_event_display", '{}'::jsonb) || ${patch}::jsonb`)
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  const saveAnotherTab = () =>
    payload.updateGlobal({ slug: SLUG, data: { countries: { title: 'Countries' } } })

  it('refuses a save of any other tab while the stored keys are there', async () => {
    await expect(saveAnotherTab()).rejects.toThrow(/field is invalid: Event > Display/)
  })

  it('is swept by the migration, leaving the other keys in place', async () => {
    await withSchema(payload, (tx) => up({ db: tx, payload } as unknown as MigrateUpArgs))

    await expect(saveAnotherTab()).resolves.toBeTruthy()

    const stored = await payload.findGlobal({ slug: SLUG })
    expect(stored.event?.display).toEqual({ chip_today: TODAY })
  })
})
