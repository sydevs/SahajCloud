/**
 * The #1278 sweep: `20261125_230000_atlas_drop_captcha_blocked`. Why a retired
 * key refuses every save of its global is `src/globals/AGENTS.md`'s rule.
 *
 * The first case is that defect as an assertion: seed the key underneath
 * validation, and a save of another tab is refused. The second is the
 * migration answering it. It imports the migration's `up` (as
 * `atlas-drop-time-in-place` did) and runs it inside `withSchema`, which
 * points its unqualified table names at this suite's own schema.
 */
import type { MigrateUpArgs } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { up } from '@/migrations/20261125_230000_atlas_drop_captcha_blocked'

import { createTestEnvironment } from '../utils/testHelpers'
import { withSchema } from '../utils/withSchema'

const SLUG = 'sy-atlas-translations'
const UNAVAILABLE = 'This program can’t be joined right now.'
const RETIRED = 'The map can’t load here right now.'

describe('atlas translations: the retired common.errors.captcha_blocked key', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Through the API first, so the row and its version row exist at all.
    await payload.updateGlobal({
      slug: SLUG,
      data: { common: { errors: { unavailable: UNAVAILABLE } } },
    })
    // Then the retired key, raw, underneath the validator that now refuses it.
    const patch = JSON.stringify({ captcha_blocked: RETIRED })
    await withSchema(payload, async (tx) => {
      await tx.execute(sql`
        UPDATE "sy_atlas_translations_locales"
          SET "common_errors" = coalesce("common_errors", '{}'::jsonb) || ${patch}::jsonb`)
      await tx.execute(sql`
        UPDATE "_sy_atlas_translations_v_locales"
          SET "version_common_errors" =
            coalesce("version_common_errors", '{}'::jsonb) || ${patch}::jsonb`)
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  const saveAnotherTab = () =>
    payload.updateGlobal({ slug: SLUG, data: { countries: { title: 'Countries' } } })

  it('refuses a save of any other tab while the stored key is there', async () => {
    await expect(saveAnotherTab()).rejects.toThrow(/field is invalid: Common > Errors/)
  })

  it('is swept by the migration, leaving the other keys in place', async () => {
    await withSchema(payload, (tx) => up({ db: tx, payload } as unknown as MigrateUpArgs))

    await expect(saveAnotherTab()).resolves.toBeTruthy()

    const stored = await payload.findGlobal({ slug: SLUG })
    expect(stored.common?.errors).toEqual({ unavailable: UNAVAILABLE })
  })
})
