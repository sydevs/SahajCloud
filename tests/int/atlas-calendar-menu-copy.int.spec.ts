/**
 * `20261111_230500_atlas_calendar_menu_copy`: the two English sub-labels the Sahaj Atlas
 * "Add to calendar" menu needs, written by a migration so production gets them on deploy. What
 * the migration must never do is overwrite a word an editor chose, or touch another locale, so
 * most of this file is about what it leaves alone.
 *
 * Its own file, for the reason `atlas-clock-copy.int.spec.ts` gives: both write the one global
 * `translations-globals.int.spec.ts` owns.
 */
import type { MigrateUpArgs } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { down, up } from '@/migrations/20261111_230500_atlas_calendar_menu_copy'

import { createTestEnvironment } from '../utils/testHelpers'
import { withSchema } from '../utils/withSchema'

const SLUG = 'sy-atlas-translations'

const ADD_CALENDAR = 'Add to calendar'
const DOWNLOAD_ICS = 'Download .ics file'
const KEEPS_UPDATED = 'Keeps itself up to date'
const NEXT_SESSION_ONLY = 'Adds the next session only'

const FRENCH_ADD_CALENDAR = 'Ajouter au calendrier'

describe('atlas translations: the calendar-menu copy migration', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  // `up` and `down` destructure `db` alone; the cast stands in for the `req` the migration
  // chain would supply.
  const run = (step: typeof up) =>
    withSchema(payload, (tx) => step({ db: tx, payload } as unknown as MigrateUpArgs))

  const english = () => payload.findGlobal({ slug: SLUG, locale: 'en', fallbackLocale: false })

  const seedEnglish = (overrides: { keepsUpdated?: string } = {}) =>
    payload.updateGlobal({
      slug: SLUG,
      locale: 'en',
      data: {
        event: {
          actions: {
            add_calendar: ADD_CALENDAR,
            download_ics: DOWNLOAD_ICS,
            ...(overrides.keepsUpdated ? { calendar_keeps_updated: overrides.keepsUpdated } : {}),
          },
        },
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
      data: { event: { actions: { add_calendar: FRENCH_ADD_CALENDAR } } },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('writes both English sub-labels, and keeps every key beside them', async () => {
    await run(up)

    expect((await english()).event?.actions).toEqual({
      add_calendar: ADD_CALENDAR,
      download_ics: DOWNLOAD_ICS,
      calendar_keeps_updated: KEEPS_UPDATED,
      calendar_next_session_only: NEXT_SESSION_ONLY,
    })
  })

  it('leaves another locale as it was', async () => {
    const french = await payload.findGlobal({ slug: SLUG, locale: 'fr', fallbackLocale: false })
    expect(french.event?.actions).toEqual({ add_calendar: FRENCH_ADD_CALENDAR })
  })

  /**
   * A save loads the document it changes from the latest version row, so copy written to the
   * main row alone would be dropped here, by a save of a tab that never mentioned it.
   */
  it('survives the next save of another tab', async () => {
    await payload.updateGlobal({ slug: SLUG, locale: 'en', data: { countries: { title: 'X' } } })

    const actions = (await english()).event?.actions
    expect(actions?.calendar_keeps_updated).toBe(KEEPS_UPDATED)
    expect(actions?.calendar_next_session_only).toBe(NEXT_SESSION_ONLY)
  })

  it('is undone by down', async () => {
    await run(down)

    expect((await english()).event?.actions).toEqual({
      add_calendar: ADD_CALENDAR,
      download_ics: DOWNLOAD_ICS,
    })
  })

  it('and the global still saves afterwards', async () => {
    await expect(
      payload.updateGlobal({
        slug: SLUG,
        locale: 'en',
        data: { event: { actions: { add_calendar: ADD_CALENDAR } } },
      }),
    ).resolves.toBeTruthy()
  })

  it('never overwrites copy an editor wrote', async () => {
    await seedEnglish({ keepsUpdated: 'Stays current by itself' })

    await run(up)
    const actions = (await english()).event?.actions
    expect(actions?.calendar_keeps_updated).toBe('Stays current by itself')
    expect(actions?.calendar_next_session_only).toBe(NEXT_SESSION_ONLY)
  })

  /**
   * The previous schema declares neither key, so one left behind refuses every save of the row
   * holding it. An editor's wording does not earn a broken rollback.
   */
  it('still drops a reworded key on down', async () => {
    await run(down)

    expect((await english()).event?.actions).toEqual({
      add_calendar: ADD_CALENDAR,
      download_ics: DOWNLOAD_ICS,
    })
  })

  /** `up` writes English, but any locale holding a key refuses its own save after a rollback. */
  it('drops both keys from another locale too', async () => {
    await payload.updateGlobal({
      slug: SLUG,
      locale: 'fr',
      data: {
        event: {
          actions: {
            add_calendar: FRENCH_ADD_CALENDAR,
            calendar_keeps_updated: 'Se met à jour tout seul',
            calendar_next_session_only: 'Ajoute la prochaine séance seulement',
          },
        },
      },
    })

    await run(down)

    const french = await payload.findGlobal({ slug: SLUG, locale: 'fr', fallbackLocale: false })
    expect(french.event?.actions).toEqual({ add_calendar: FRENCH_ADD_CALENDAR })
  })
})
