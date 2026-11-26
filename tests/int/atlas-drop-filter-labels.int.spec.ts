/**
 * The #1286 sweep: `20261126_224500_atlas_drop_filter_labels`. Why a retired
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

import { up } from '@/migrations/20261126_224500_atlas_drop_filter_labels'

import { createTestEnvironment } from '../utils/testHelpers'
import { withSchema } from '../utils/withSchema'

const SLUG = 'sy-atlas-translations'
const DAY = 'Day'

describe('atlas translations: the retired filters.days.label and filters.language.empty', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Through the API first, so the row and its version row exist at all.
    await payload.updateGlobal({ slug: SLUG, data: { filters: { days: { short_label: DAY } } } })
    // Then the retired keys, raw, underneath the validator that now refuses them.
    const days = JSON.stringify({ label: 'Day of week' })
    const language = JSON.stringify({ empty: 'No languages available' })
    await withSchema(payload, async (tx) => {
      await tx.execute(sql`
        UPDATE "sy_atlas_translations_locales"
          SET "filters_days" = coalesce("filters_days", '{}'::jsonb) || ${days}::jsonb,
              "filters_language" = coalesce("filters_language", '{}'::jsonb) || ${language}::jsonb`)
      await tx.execute(sql`
        UPDATE "_sy_atlas_translations_v_locales"
          SET "version_filters_days" = coalesce("version_filters_days", '{}'::jsonb) || ${days}::jsonb,
              "version_filters_language" =
                coalesce("version_filters_language", '{}'::jsonb) || ${language}::jsonb`)
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  const saveAnotherTab = () =>
    payload.updateGlobal({ slug: SLUG, data: { countries: { title: 'Countries' } } })

  it('refuses a save of any other tab while the stored keys are there', async () => {
    await expect(saveAnotherTab()).rejects.toThrow(/invalid: .*Filters > Days/)
  })

  it('is swept by the migration, leaving the other keys in place', async () => {
    await withSchema(payload, (tx) => up({ db: tx, payload } as unknown as MigrateUpArgs))

    await expect(saveAnotherTab()).resolves.toBeTruthy()

    const stored = await payload.findGlobal({ slug: SLUG })
    expect(stored.filters?.days).toEqual({ short_label: DAY })
    expect(stored.filters?.language).not.toHaveProperty('empty')
  })
})
