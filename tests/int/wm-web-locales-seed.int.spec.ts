/**
 * `pnpm seed wm-web-locales`, end to end: the nine non-English locales of
 * `wm-web-translations`.
 *
 * The unit spec beside the files (`tests/unit/wm-web-translations-locales-seed.spec.ts`)
 * proves each file has English's keys and placeholders. It cannot prove Payload
 * accepts them or that the publish lands per locale. Both are database facts:
 * the files meet the column's JSON Schema only on write, and a locale's
 * `_status` is a per-locale column (`localizeStatus`).
 *
 * The last block is the reason the seed publishes at all. `wm-web-config`
 * refuses an `availableLocales` entry whose translations are unpublished
 * (`availableLocalesField.ts`), so the production switch-on is: run this seed,
 * then widen the list. Asserting that sequence here is what makes the
 * procedure written down for production more than a belief.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { WM_WEB_TRANSLATION_LOCALES } from '../../seeds/lib/dataFiles'
import { WmWebLocalesImporter } from '../../seeds/wm-web-locales/import'
import { createTestEnvironment } from '../utils/testHelpers'

async function localesErrorOrNull(write: () => Promise<unknown>): Promise<string | null> {
  try {
    await write()
    return null
  } catch (error) {
    const { data } = error as { data?: { errors?: { path?: string; message?: string }[] } }
    return data?.errors?.find((entry) => entry.path === 'availableLocales')?.message ?? null
  }
}

type Group = Record<string, string>

describe('seeding the wm-web-translations locales', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  const runSeed = () =>
    new WmWebLocalesImporter({ dryRun: false, clearCache: false, payload }).run()

  const readWeb = (locale: (typeof WM_WEB_TRANSLATION_LOCALES)[number]) =>
    payload.findGlobal({
      slug: 'wm-web-translations',
      locale,
      // Without this a locale resolves `_status` through the English fallback
      // and reports itself published whether or not it is (#705).
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    }) as unknown as Promise<Record<string, Record<string, Group> | string>>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    await runSeed()
  }, 120_000)

  afterAll(async () => {
    await cleanup()
  })

  it('publishes every one of the nine locales', async () => {
    const all = (await payload.findGlobal({
      slug: 'wm-web-translations',
      locale: 'all',
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { _status: Record<string, string> }

    for (const locale of WM_WEB_TRANSLATION_LOCALES) {
      expect(all._status[locale], locale).toBe('published')
    }
  })

  it('writes each locale at the declared path, in its own words', async () => {
    const fr = (await readWeb('fr')) as { errors: { general: Group } }
    expect(fr.errors.general.try_again).toBe('Réessayer')

    const ptBr = (await readWeb('pt-BR')) as { common: { general: Group } }
    expect(ptBr.common.general.loading).toBe('Carregando...')
  })

  it('stores a Slavic plural family in full, with the placeholder in each form', async () => {
    const ru = (await readWeb('ru')) as { article: { general: Group } }
    const { general } = ru.article
    expect(general.meditating_years_one).toContain('%{count}')
    expect(general.meditating_years_few).toContain('%{count}')
    expect(general.meditating_years_many).toContain('%{count}')
    expect(new Set([general.meditating_years_one, general.meditating_years_few]).size).toBe(2)
  })

  it('leaves the video tab to English', async () => {
    const de = (await readWeb('de')) as { video?: unknown }
    // A group nobody wrote reads back as null, key by key.
    expect(
      Object.values((de.video ?? {}) as Record<string, unknown>).every((v) => v === null),
    ).toBe(true)
  })

  it('is idempotent — a second run leaves the locales published and unchanged', async () => {
    await runSeed()
    const it_ = (await readWeb('it')) as { _status: string; forms: { general: Group } }
    expect(it_._status).toBe('published')
    expect(it_.forms.general.submit).toBe('Invia')
  }, 120_000)

  // The production switch-on, in order: publish, then widen. `wm-web-config`
  // has four other required fields, so a bare write always fails; only the
  // `availableLocales` message tells the two apart.
  describe('what wm-web-config makes of the seeded state', () => {
    const setWebLocales = (locales: string[]) =>
      payload.updateGlobal({
        slug: 'wm-web-config',
        data: { availableLocales: locales } as never,
        overrideAccess: true,
      })

    it('accepts all ten languages once the nine are published', async () => {
      const ten = ['en', ...WM_WEB_TRANSLATION_LOCALES]
      expect(await localesErrorOrNull(() => setWebLocales(ten))).toBeNull()
    })

    it('still refuses a language it did not publish', async () => {
      const message = await localesErrorOrNull(() => setWebLocales(['en', 'nl']))
      expect(message).toMatch(/Dutch/)
    })
  })
})
