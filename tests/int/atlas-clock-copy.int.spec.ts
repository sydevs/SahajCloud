/**
 * `20261107_225000_atlas_clock_copy`: English Sahaj Atlas copy written by a migration, so
 * production gets it on deploy. What the migration must never do is overwrite a word an editor
 * chose, or touch another locale, so most of this file is about what it leaves alone.
 *
 * Its own file, for the reason `atlas-drop-time-in-place.int.spec.ts` gives: both write the one
 * global `translations-globals.int.spec.ts` owns.
 */
import type { MigrateUpArgs } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { down, up } from '@/migrations/20261107_225000_atlas_clock_copy'

import { createTestEnvironment } from '../utils/testHelpers'
import { withSchema } from '../utils/withSchema'

const SLUG = 'sy-atlas-translations'

const HOSTED_FROM = 'Hosted from %{city}'
const VIEW_LIST = 'List'
const ZONE_TIME = '%{city} time'
const TIMES_NOTE = 'Times are local to each class. Online classes show your time (%{zone}).'
const CAPTCHA_BEFORE = "This Atlas can't run on this page: its security check was blocked."
const CAPTCHA_AFTER =
  "The map can't load here right now, because its security check didn't respond. Try again later."
const PRIVACY_BEFORE =
  'By submitting you confirm you agree to receive follow up messages about this and similar events, in accordance with our privacy policy.'
const PRIVACY_AFTER =
  'By submitting you confirm you agree to receive follow up messages about this and similar events, in accordance with our <link>privacy policy</link>.'

const FRENCH_HOSTED_FROM = 'Organisé depuis %{city}'
const FRENCH_CAPTCHA = 'Cet Atlas ne peut pas fonctionner sur cette page.'

describe('atlas translations: the clock-label copy migration', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  // `up` and `down` destructure `db` alone; the cast stands in for the `req` the migration
  // chain would supply.
  const run = (step: typeof up) =>
    withSchema(payload, (tx) => step({ db: tx, payload } as unknown as MigrateUpArgs))

  const english = () => payload.findGlobal({ slug: SLUG, locale: 'en', fallbackLocale: false })

  const seedEnglish = (overrides: { captcha?: string; zoneTime?: string } = {}) =>
    payload.updateGlobal({
      slug: SLUG,
      locale: 'en',
      data: {
        event: {
          display: {
            hosted_from: HOSTED_FROM,
            ...(overrides.zoneTime ? { zone_time: overrides.zoneTime } : {}),
          },
        },
        calendar: { view_list: VIEW_LIST },
        common: { errors: { captcha_blocked: overrides.captcha ?? CAPTCHA_BEFORE } },
        registration: { form: { privacy_policy: PRIVACY_BEFORE } },
      },
    })

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    await seedEnglish()
    await payload.updateGlobal({
      slug: SLUG,
      locale: 'fr',
      data: {
        event: { display: { hosted_from: FRENCH_HOSTED_FROM } },
        common: { errors: { captcha_blocked: FRENCH_CAPTCHA } },
      },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('writes the English copy, and keeps every key beside it', async () => {
    await run(up)

    const stored = await english()
    expect(stored.event?.display).toEqual({ hosted_from: HOSTED_FROM, zone_time: ZONE_TIME })
    expect(stored.calendar).toEqual({ view_list: VIEW_LIST, times_note: TIMES_NOTE })
    expect(stored.common?.errors?.captcha_blocked).toBe(CAPTCHA_AFTER)
    expect(stored.registration?.form?.privacy_policy).toBe(PRIVACY_AFTER)
  })

  it('leaves another locale as it was', async () => {
    const french = await payload.findGlobal({ slug: SLUG, locale: 'fr', fallbackLocale: false })

    expect(french.event?.display).toEqual({ hosted_from: FRENCH_HOSTED_FROM })
    expect(french.common?.errors?.captcha_blocked).toBe(FRENCH_CAPTCHA)
  })

  /**
   * A save loads the document it changes from the latest version row, so copy written to the
   * main row alone would be dropped here, by a save of a tab that never mentioned it.
   */
  it('survives the next save of another tab', async () => {
    await payload.updateGlobal({ slug: SLUG, locale: 'en', data: { countries: { title: 'X' } } })

    const stored = await english()
    expect(stored.event?.display?.zone_time).toBe(ZONE_TIME)
    expect(stored.calendar?.times_note).toBe(TIMES_NOTE)
    expect(stored.common?.errors?.captcha_blocked).toBe(CAPTCHA_AFTER)
  })

  it('is undone by down', async () => {
    await run(down)

    const stored = await english()
    expect(stored.event?.display).toEqual({ hosted_from: HOSTED_FROM })
    expect(stored.calendar).toEqual({ view_list: VIEW_LIST })
    expect(stored.common?.errors?.captcha_blocked).toBe(CAPTCHA_BEFORE)
    expect(stored.registration?.form?.privacy_policy).toBe(PRIVACY_BEFORE)
  })

  it('never overwrites copy an editor wrote', async () => {
    await seedEnglish({ captcha: 'Edited by hand.', zoneTime: '%{city} clock' })

    await run(up)
    const stored = await english()
    expect(stored.common?.errors?.captcha_blocked).toBe('Edited by hand.')
    expect(stored.event?.display?.zone_time).toBe('%{city} clock')
  })

  /**
   * The previous schema declares neither new key, so one left behind refuses every save of the
   * row holding it. An editor's wording of `zone_time` does not earn a broken rollback — unlike
   * `captcha_blocked`, whose key the old schema holds either way.
   */
  it('still drops a reworded new key on down', async () => {
    await run(down)

    const stored = await english()
    expect(stored.event?.display).toEqual({ hosted_from: HOSTED_FROM })
    expect(stored.calendar).toEqual({ view_list: VIEW_LIST })
    expect(stored.common?.errors?.captcha_blocked).toBe('Edited by hand.')
  })

  /** `up` writes English, but any locale holding the key refuses its own save after a rollback. */
  it('drops the new key from another locale too', async () => {
    await payload.updateGlobal({
      slug: SLUG,
      locale: 'fr',
      data: {
        event: { display: { hosted_from: FRENCH_HOSTED_FROM, zone_time: 'heure de %{city}' } },
      },
    })

    await run(down)

    const french = await payload.findGlobal({ slug: SLUG, locale: 'fr', fallbackLocale: false })
    expect(french.event?.display).toEqual({ hosted_from: FRENCH_HOSTED_FROM })
    expect(french.common?.errors?.captcha_blocked).toBe(FRENCH_CAPTCHA)
  })
})
