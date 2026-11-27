/**
 * The sweep `20261127_210000_atlas_drop_retired_share_keys`. Why a retired key
 * refuses every save of its global is `src/globals/AGENTS.md`'s rule.
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

import { RETIRED, up } from '@/migrations/20261127_210000_atlas_drop_retired_share_keys'

import { createTestEnvironment } from '../utils/testHelpers'
import { withSchema } from '../utils/withSchema'

const SLUG = 'sy-atlas-translations'
const FULL = 'This class is full'

describe('atlas translations: the retired Share view keys', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Through the API first, so the row and its version row exist at all.
    await payload.updateGlobal({ slug: SLUG, data: { event: { display: { class_full: FULL } } } })
    // Then the retired keys, raw, underneath the validator that now refuses them.
    await withSchema(payload, async (tx) => {
      for (const [group, keys] of Object.entries(RETIRED)) {
        const patch = JSON.stringify(Object.fromEntries(keys.map((key) => [key, 'Old copy'])))
        const col = sql.identifier(group)
        const versionCol = sql.identifier(`version_${group}`)
        await tx.execute(sql`
          UPDATE "sy_atlas_translations_locales"
            SET ${col} = coalesce(${col}, '{}'::jsonb) || ${patch}::jsonb`)
        await tx.execute(sql`
          UPDATE "_sy_atlas_translations_v_locales"
            SET ${versionCol} = coalesce(${versionCol}, '{}'::jsonb) || ${patch}::jsonb`)
      }
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  const saveAnotherTab = () =>
    payload.updateGlobal({ slug: SLUG, data: { countries: { title: 'Countries' } } })

  it('refuses a save of any other tab while the stored keys are there', async () => {
    await expect(saveAnotherTab()).rejects.toThrow(/fields are invalid/)
  })

  it('is swept by the migration, leaving the other keys in place', async () => {
    await withSchema(payload, (tx) => up({ db: tx, payload } as unknown as MigrateUpArgs))

    await expect(saveAnotherTab()).resolves.toBeTruthy()

    const stored = await payload.findGlobal({ slug: SLUG })
    expect(stored.event?.display).toEqual({ class_full: FULL })
    expect(stored.share ?? {}).not.toHaveProperty('title')
    expect(stored.share ?? {}).not.toHaveProperty('title_class')
    expect(stored.common?.errors ?? {}).not.toHaveProperty('share_unavailable_class')
  })
})
