import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Manager, SahajaGlossary } from '@/payload-types'

import { SahajaGlossaryImporter } from '../../seeds/sahaja-glossary/import'
import {
  createRestClient,
  createRestClientAs,
  createRestClientWithAuth,
  type RestClient,
} from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * The hidden glossary global (#883), end to end.
 *
 * Two independent claims, neither of which a unit spec can reach:
 *
 * **Who may read it.** The global sits in no project, which `hasPermission`
 * step 4a reads as *shared* — implicitly readable by every role. The close is
 * `RESTRICTED_COLLECTIONS`, and `docs/rules/access.md` is explicit that adding
 * a slug there proves nothing on its own: the 403s below are read back over
 * REST, as a client and as a manager, rather than asserted off `hasPermission`.
 *
 * **What the seed leaves behind.** Row ids are what make the per-locale writes
 * translate the English rows instead of replacing them, and that is a database
 * fact: the ids only exist after English has been written. A second run is the
 * assertion that matters — the failure mode is 112 rows, not an error.
 */

/** The plaintext key the client below authenticates with. */
const REST_API_KEY = 'sahaja-glossary-spec-key'

/** Every term in `data.json`, and the one acceptance criterion that is a count. */
const EXPECTED_TERMS = 56

/**
 * ⚠ `select` and `depth` are both on this URL on purpose, and a **400 is not a
 * 403**. The usage plugin runs four gates ahead of access control, two of which
 * a plain `GET /api/globals/sahaja-glossary` trips: it refuses a client read
 * carrying no `select`, and it refuses `depth > 1` with no `populate`. Either
 * one would pass a bare `not 200` assertion while saying nothing whatever about
 * who may read this global. Both were observed while writing this spec.
 */
const GLOSSARY_PATH = '/api/globals/sahaja-glossary?select[terms]=true&depth=1'

/**
 * The `terms` validator's own message out of a refused write, or null when that
 * field did not object. Same helper shape as `wm-web-translations-seed`.
 */
async function termsErrorOrNull(write: () => Promise<unknown>): Promise<string | null> {
  try {
    await write()
    return null
  } catch (error) {
    const { data } = error as { data?: { errors?: { path?: string; message?: string }[] } }
    return data?.errors?.find((entry) => entry.path === 'terms')?.message ?? null
  }
}

describe('sahaja-glossary', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let asAdmin: RestClient
  let asManager: RestClient
  let asClient: RestClient
  /** The global as it stood after a dry run and before any real seed. */
  let afterDryRun: SahajaGlossary

  const runSeed = () =>
    new SahajaGlossaryImporter({ dryRun: false, clearCache: false, payload }).run()

  const read = (locale: 'en' | 'ru' | 'fr' | 'it' | 'cs') =>
    payload.findGlobal({
      slug: 'sahaja-glossary',
      locale,
      // Without this, an untranslated locale resolves `term` through the English
      // fallback and every "reads empty" case below passes vacuously.
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    })

  const termFor = (doc: SahajaGlossary, key: string) =>
    doc.terms?.find((row) => row.key === key)?.term

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    asAdmin = await createRestClient(testEnv)

    // ⚠ This manager HOLDS a role, and must. `hasPermission` denies a manager
    // with no resolvable roles at step 3, before implicit read is considered at
    // all — so a roleless fixture would answer 403 whether this global were
    // restricted or not, and the case would pin nothing. One role is what
    // carries the request as far as the rule under test.
    const manager = (await testData.createManager(payload, {
      type: 'manager',
      roles: ['meditations-editor'],
    })) as unknown as Manager
    asManager = await createRestClientAs(testEnv, manager)

    const client = await testData.createClient(payload, testEnv.adminUser.id, {
      name: 'Sahaja Glossary Spec Client',
      // The widest client role in the project set, so the refusal cannot be
      // read as "this key was scoped out of the wrong project".
      roles: ['wemeditate-app-client'],
      apiKey: REST_API_KEY,
    })
    asClient = createRestClientWithAuth(testEnv, {
      Authorization: `clients API-Key ${client.apiKey ?? REST_API_KEY}`,
    })

    await new SahajaGlossaryImporter({ dryRun: true, clearCache: false, payload }).run()
    afterDryRun = await read('en')

    await runSeed()
  }, 180_000)

  afterAll(async () => {
    await cleanup()
  })

  describe('who may read it', () => {
    it('answers an admin', async () => {
      const { status } = await asAdmin(GLOSSARY_PATH)
      expect(status).toBe(200)
    })

    it('refuses a non-admin manager', async () => {
      const { status } = await asManager(GLOSSARY_PATH)
      expect(status).toBe(403)
    })

    it('refuses an API client', async () => {
      const { status } = await asClient(GLOSSARY_PATH)
      expect(status).toBe(403)
    })
  })

  describe('the admin menu', () => {
    it('hides the global from everyone, through the real plugin', async () => {
      // `tests/unit/access-hidden-resolution.spec.ts` drives the resolution over
      // a stub config. This reads the sanitized, plugin-transformed config the
      // app actually boots, so the two cover the rule and its wiring.
      const config = payload.config.globals.find((entry) => entry.slug === 'sahaja-glossary')
      expect(config?.admin?.hidden).toBe(true)
    })
  })

  describe('the seed', () => {
    it('writes every term once', async () => {
      const doc = await read('en')
      expect(doc.terms).toHaveLength(EXPECTED_TERMS)
    })

    it('writes each locale its own spelling', async () => {
      expect(termFor(await read('ru'), 'Self-realization')).toBe('Самореализация')
      expect(termFor(await read('fr'), 'Self-realization')).toBe('Réalisation du Soi')
      expect(termFor(await read('en'), 'Self-realization')).toBe('Self-realization')
    })

    it('leaves a term the locale has no spelling for empty, not English', async () => {
      // `Spirit` carries `en` and `ru` only.
      expect(termFor(await read('ru'), 'Spirit')).toBe('Дух')
      expect(termFor(await read('fr'), 'Spirit')).toBeFalsy()
      expect(termFor(await read('it'), 'Spirit')).toBeFalsy()
    })

    it('seeds a keepAsIs term in English alone', async () => {
      const en = await read('en')
      expect(termFor(en, 'Kundalini')).toBe('Kundalini')
      expect(en.terms?.find((row) => row.key === 'Kundalini')?.keepAsIs).toBe(true)
      expect(termFor(await read('ru'), 'Kundalini')).toBeFalsy()
    })

    it("carries each language's translator notes, and none for English", async () => {
      const ru = await read('ru')
      expect(ru.translatorNotes).toContain('Use formal "вы" (Вы) for instructions')
      // Four lines in the file, joined — not four rows and not one run-on line.
      expect(ru.translatorNotes?.split('\n')).toHaveLength(4)
      expect((await read('en')).translatorNotes).toBeFalsy()
    })

    it('keeps the non-localized columns on the row the ids identify', async () => {
      const ru = await read('ru')
      // A replaced array would still have 56 rows carrying these values, so this
      // case is about the ORDER and the keys surviving a second locale's write,
      // not about the count.
      expect(ru.terms?.map((row) => row.key)).toEqual((await read('en')).terms?.map((r) => r.key))
      expect(ru.terms?.find((row) => row.key === 'Mooladhara')?.category).toBe('subtle-system')
    })

    it('writes nothing on a dry run', async () => {
      // ⚠ The dry run happens in `beforeAll`, against the global BEFORE anything
      // has seeded it, and that ordering is the whole case. A dry run performed
      // afterwards has no observable: it would write the file's own data back,
      // leaving every value above green, and `updatedAt` does not move on a
      // global whose contents are unchanged — measured, by removing the dry-run
      // guard and watching that assertion stay green.
      expect(afterDryRun.terms ?? []).toHaveLength(0)
    })

    it('leaves one set of rows after a second run, with every locale intact', async () => {
      await runSeed()

      const en = await read('en')
      expect(en.terms).toHaveLength(EXPECTED_TERMS)
      expect(termFor(en, 'Self-realization')).toBe('Self-realization')

      const ru = await read('ru')
      expect(ru.terms).toHaveLength(EXPECTED_TERMS)
      expect(termFor(ru, 'Self-realization')).toBe('Самореализация')
      expect(termFor(await read('fr'), 'Spirit')).toBeFalsy()
    })

    it('leaves a locale the file does not carry untouched', async () => {
      // ⚠ The one case the count cannot see. Payload deletes every stored row
      // the incoming array does not claim by `id`, and the terms' localized
      // values table is ON DELETE cascade — so an English write sent without
      // the stored ids rebuilds all 56 rows and takes `cs` with it, while
      // leaving 56 rows behind and every locale the file DOES carry correct.
      // That is what this seed looked like until the ids were read before the
      // first write instead of after it, and it was measured: `cs` went to
      // `undefined` and every row id changed.
      const rows = (await read('en')).terms ?? []
      await payload.updateGlobal({
        slug: 'sahaja-glossary',
        locale: 'cs',
        data: {
          terms: rows.map((row) => ({
            id: row.id,
            key: row.key,
            category: row.category,
            keepAsIs: row.keepAsIs,
            term: row.key === 'Meditation' ? 'Meditace' : null,
          })),
        } as never,
      })

      const idsBefore = rows.map((row) => row.id)
      await runSeed()

      const cs = await read('cs')
      expect(termFor(cs, 'Meditation')).toBe('Meditace')
      // The ids are the mechanism, so they are asserted directly: a rebuild
      // that happened to restore the same spellings would still have renumbered
      // them, and would still have destroyed whatever the file does not carry.
      expect((await read('en')).terms?.map((row) => row.id)).toEqual(idsBefore)
    })
  })

  describe('duplicate keys', () => {
    it('refuses a second row carrying a key the array already has', async () => {
      // Nothing in Postgres enforces this, so the array's own validator is the
      // only thing standing between a consumer and an ambiguous lookup.
      // Payload reports a field validator's own message only in the nested
      // `data.errors` entry. The top-level message is "The following field is
      // invalid: Terms", which every array validator produces alike — asserting
      // on it would pass for a `required` key just as readily.
      expect(
        await termsErrorOrNull(() =>
          payload.updateGlobal({
            slug: 'sahaja-glossary',
            locale: 'en',
            data: {
              terms: [
                { key: 'Nabhi', category: 'subtle-system', term: 'Nabhi' },
                { key: 'Nabhi', category: 'subtle-system', term: 'Nabhi again' },
              ],
            },
          }),
        ),
      ).toMatch(/Duplicate term key\(s\): Nabhi/)
    })
  })
})
