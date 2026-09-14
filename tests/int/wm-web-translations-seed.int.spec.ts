/**
 * `pnpm seed translations`, end to end, for the WeMeditate Web global (#707).
 *
 * The unit spec beside this one (`tests/unit/wm-web-translations-seed.spec.ts`)
 * proves the seed FILE agrees with the schema. It cannot prove the file is
 * accepted: the shape only meets Payload's per-column JSON Schema when the
 * importer hands it over untransformed, and the publish only lands if
 * `localizeStatus` treats `_status` as a per-locale column. Both are database
 * facts.
 *
 * The publish needs asserting **directly**, because nothing else observes it.
 * English is exempt from `availableLocales`'s publish gate — gating the one
 * locale nobody can deselect would deadlock the save — and a global read
 * returns the same document whether `draft` is true, false, or unset. So a
 * publish that silently did nothing would leave every downstream behaviour
 * looking correct, and show up only as wrong state in the admin. These cases
 * read `_status`, rather than inferring it from an effect.
 *
 * It runs the real `TranslationsImporter`, which also seeds the app and atlas
 * globals. That is deliberate: a change breaking one of its siblings breaks
 * `pnpm seed translations` for everyone, and this is the only spec that runs it.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TranslationsImporter } from '../../seeds/translations/import'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * The `availableLocales` message out of a refused write, or null when that
 * field did not object. `wm-web-config` has four other required fields, so a
 * bare write always fails — asserting on the top-level `ValidationError`
 * message would pass for every reason alike, including the ones these cases
 * exist to tell apart. Same helper shape as `available-locales.int.spec.ts`.
 */
async function localesErrorOrNull(write: () => Promise<unknown>): Promise<string | null> {
  try {
    await write()
    return null
  } catch (error) {
    const { data } = error as { data?: { errors?: { path?: string; message?: string }[] } }
    return data?.errors?.find((entry) => entry.path === 'availableLocales')?.message ?? null
  }
}

describe('seeding wm-web-translations', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  const runSeed = () =>
    new TranslationsImporter({ dryRun: false, clearCache: false, payload }).run()

  const readWeb = (locale: 'en' | 'fr') =>
    payload.findGlobal({
      slug: 'wm-web-translations',
      locale,
      // Without this, French resolves `_status` through the English fallback
      // and reports itself published — the exact trap #705 documents.
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    }) as unknown as Promise<Record<string, never>>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    await runSeed()
  }, 120_000)

  afterAll(async () => {
    await cleanup()
  })

  it('writes the English copy at its declared path', async () => {
    const doc = await readWeb('en')
    // One key per shape the schema produces: a nested tab's visible group, its
    // screen-reader group, a flat tab, and an expanded plural form.
    expect((doc.common as Record<string, Record<string, string>>).general.loading).toBe(
      'Loading...',
    )
    expect((doc.common as Record<string, Record<string, string>>).a11y.breadcrumb).toBe('Breadcrumb')
    expect((doc.navigation as unknown as Record<string, string>).about_meditation).toBe(
      'About Meditation',
    )
    expect((doc.map as Record<string, Record<string, string>>).general.classes_shown_other).toBe(
      'Showing %{shown} of %{count} classes.',
    )
  })

  it('publishes English', async () => {
    expect((await readWeb('en'))._status).toBe('published')
  })

  it('publishes English only', async () => {
    expect((await readWeb('fr'))._status).not.toBe('published')

    const all = (await payload.findGlobal({
      slug: 'wm-web-translations',
      locale: 'all',
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { _status: Record<string, string> }
    expect(all._status.en).toBe('published')
    expect(all._status.fr).not.toBe('published')
    expect(all._status.de).not.toBe('published')
  })

  // The seed never publishes `wm-app-translations`. Its `_status` is per-locale
  // too since #709, so this `locale: 'en'` read returns English's own status —
  // an operator republishes each locale after the deploy, not the seed.
  it('leaves the app translations unpublished', async () => {
    const app = (await payload.findGlobal({
      slug: 'wm-app-translations',
      locale: 'en',
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { _status?: string }
    expect(app._status).not.toBe('published')
  })

  it('is idempotent — a second run leaves English published and unchanged', async () => {
    await runSeed()
    const doc = await readWeb('en')
    expect(doc._status).toBe('published')
    expect((doc.forms as Record<string, Record<string, string>>).general.submit).toBe('Submit')
  }, 120_000)

  // The seed leaves `wm-web-config` able to offer English and nothing else.
  // English passes on its exemption rather than on the publish — that is the
  // point of asserting `_status` above instead of inferring it from here.
  describe('what wm-web-config makes of the seeded state', () => {
    const setWebLocales = (locales: string[]) =>
      payload.updateGlobal({
        slug: 'wm-web-config',
        data: { availableLocales: locales } as never,
        overrideAccess: true,
      })

    it('accepts English', async () => {
      expect(await localesErrorOrNull(() => setWebLocales(['en']))).toBeNull()
    })

    it('refuses a language the seed did not publish, and names it', async () => {
      const message = await localesErrorOrNull(() => setWebLocales(['en', 'fr']))
      expect(message).toMatch(/French/)
    })
  })
})
