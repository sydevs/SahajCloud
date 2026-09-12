/**
 * `pnpm seed translations`, on the Sahaj Atlas global (#706).
 *
 * The seed is the only thing that publishes a locale, and publishing is what
 * `sy-atlas-config.availableLocales` gates on (#705). It also runs against a
 * live production database, where two groups — registrant email chrome and the
 * CMS auto-titles — hold copy an editor wrote. So this suite asks two
 * questions the unit spec cannot: did every locale come out published, and did
 * the run leave the live data exactly as it found it.
 *
 * Named `*.test.ts`, not `*.int.spec.ts`: `seeds/**` is included in the int
 * project by that pattern (`vitest.config.mts`).
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { EVENT_TITLE_DEFAULTS } from '@/lib/eventTitle/compose'
import { EMAIL_STRING_DEFAULTS } from '@/lib/translations/emailStrings'

import { createTestEnvironment } from 'tests/utils/testHelpers'

import { TranslationsImporter } from '../translations/import'

const SLUG = 'sy-atlas-translations'

const ATLAS_LOCALES = ['cs', 'de', 'en', 'es', 'fr', 'hu', 'nl', 'pt-BR', 'ru', 'uk'] as const

/** A French translation an editor is imagined to have written before the seed. */
const FR_WHEN_LABEL = 'Quand — écrit à la main'
/** An English auto-title an editor is imagined to have tuned before the seed. */
const EN_MORNING_TITLE = 'Méditation du matin — écrit à la main'

describe('seed: sy-atlas-translations', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  const runSeed = () =>
    new TranslationsImporter({ dryRun: false, clearCache: false, payload }).run()

  const read = (locale: string) =>
    payload.findGlobal({
      slug: SLUG,
      locale: locale as 'en',
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    }) as unknown as Promise<Record<string, unknown>>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // The live data the seed must not touch, written before it ever runs.
    await payload.updateGlobal({
      slug: SLUG,
      locale: 'fr',
      data: { emails: { when_label: FR_WHEN_LABEL } } as never,
      overrideAccess: true,
    })
    await payload.updateGlobal({
      slug: SLUG,
      locale: 'en',
      data: { event: { title: { morning: EN_MORNING_TITLE } } } as never,
      overrideAccess: true,
    })

    await runSeed()
  }, 180_000)

  afterAll(async () => {
    await cleanup()
  })

  it('publishes each of the ten widget locales, individually', async () => {
    const all = (await payload.findGlobal({
      slug: SLUG,
      locale: 'all',
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { _status: Record<string, string> }

    for (const locale of ATLAS_LOCALES) {
      expect(all._status[locale], locale).toBe('published')
    }
    // A locale the widget does not ship is not published by this seed — the
    // gate would otherwise open on nine empty locales.
    expect(all._status.it).not.toBe('published')
  })

  it('writes the widget’s own copy, not placeholders derived from key names', async () => {
    const en = await read('en')
    const fr = await read('fr')

    expect((en.countries as Record<string, string>).title).toBe('Free Meditation Classes')
    expect((fr.compact as Record<string, string>).open).toBe('Trouver un cours près de chez vous')
  })

  it('stores the expanded plural family a locale actually uses', async () => {
    const cs = await read('cs')
    const display = (cs.event as Record<string, Record<string, string>>).display

    expect(display.sessions_count_few).toBeTruthy()
    expect(display.sessions_count_other).toBeTruthy()

    const en = await read('en')
    const enDisplay = (en.event as Record<string, Record<string, string>>).display
    // English has no `few` category, so a value there would have been invented.
    expect(enDisplay.sessions_count_few).toBeUndefined()
    expect(enDisplay.sessions_count_one).toBe('%{count} session')
  })

  it('omits a key the locale has no translation for, rather than blanking it', async () => {
    const fr = await read('fr')
    const form = (fr.registration as Record<string, Record<string, string>>).form

    expect(form.title).toBeUndefined()
    expect(form.name).toBe('Votre nom')
  })

  it('leaves a translated emails value alone, in a locale it never writes emails for', async () => {
    const fr = await read('fr')
    expect((fr.emails as Record<string, string>).when_label).toBe(FR_WHEN_LABEL)
  })

  it('leaves a filled event.title alone, and fills only the blank slots', async () => {
    const en = await read('en')
    const title = (en.event as Record<string, Record<string, string>>).title

    expect(title.morning).toBe(EN_MORNING_TITLE)
    expect(title.evening).toBe(EVENT_TITLE_DEFAULTS.evening)
  })

  it('fills blank English email chrome from the defaults the resolver reads', async () => {
    const en = await read('en')
    const emails = en.emails as Record<string, string>

    expect(emails.confirmation_heading).toBe(EMAIL_STRING_DEFAULTS.confirmation_heading)
    expect(emails.sessions_count_other).toBe(EMAIL_STRING_DEFAULTS.sessions_count_other)
  })

  it('preserves all of the above across a re-run', async () => {
    await runSeed()

    const fr = await read('fr')
    const en = await read('en')

    expect((fr.emails as Record<string, string>).when_label).toBe(FR_WHEN_LABEL)
    expect((en.event as Record<string, Record<string, string>>).title.morning).toBe(
      EN_MORNING_TITLE,
    )
    expect((fr.registration as Record<string, Record<string, string>>).form.title).toBeUndefined()

    const all = (await payload.findGlobal({
      slug: SLUG,
      locale: 'all',
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { _status: Record<string, string> }
    for (const locale of ATLAS_LOCALES) {
      expect(all._status[locale], locale).toBe('published')
    }
  }, 180_000)

  // A read that failed and a read that came back empty look identical to
  // `fillBlanks`, and the difference is the whole of the live data: treating a
  // failure as "everything is blank" writes English defaults over an editor's
  // own copy, wholesale.
  it('touches neither live group when the pre-seed read fails', async () => {
    const CUSTOM_HEADING = 'You are registered — written by hand'

    await payload.updateGlobal({
      slug: SLUG,
      locale: 'en',
      data: { emails: { confirmation_heading: CUSTOM_HEADING } } as never,
      overrideAccess: true,
    })

    const findGlobal = payload.findGlobal.bind(payload)
    const spy = vi
      .spyOn(payload, 'findGlobal')
      .mockImplementation(async (args: Parameters<typeof payload.findGlobal>[0]) => {
        if (args.slug === SLUG && args.locale === 'en' && args.fallbackLocale === false) {
          throw new Error('simulated database failure')
        }
        return findGlobal(args)
      })

    try {
      await runSeed()
    } finally {
      spy.mockRestore()
    }

    const en = await read('en')
    expect((en.emails as Record<string, string>).confirmation_heading).toBe(CUSTOM_HEADING)
    expect((en.event as Record<string, Record<string, string>>).title.morning).toBe(
      EN_MORNING_TITLE,
    )
    // The locale's own translations still landed — only the two live groups
    // are held back.
    expect((en.countries as Record<string, string>).title).toBe('Free Meditation Classes')
  }, 180_000)
})
