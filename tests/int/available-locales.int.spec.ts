/**
 * `availableLocales` on the two config globals, and the API-client English
 * merge that makes offering a locale safe (#705).
 *
 * Both need a database, and for the same reason: the field's answer depends on
 * a *stored* per-locale `_status`, and the merge's on a stored English row. The
 * pure halves are `tests/unit/available-locales.spec.ts` and
 * `tests/unit/client-english-fallback.spec.ts`.
 */
import type { RestClient } from '../utils/restRequest'
import type { Payload, TypedLocale } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createRestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

/** Skips only the publish check — `en` stays required. Local API only. */
const SKIP = { skipAvailableLocalesCheck: true }

/**
 * The `availableLocales` message out of a refused write.
 *
 * A `ValidationError`'s own message only names the invalid fields ("The
 * following field is invalid: Available languages") — the sentence the operator
 * reads is per-field, under `data.errors`. Asserting the top-level message
 * would pass for every rejection reason alike, including the ones these cases
 * exist to tell apart.
 */
async function localesErrorOrNull(write: () => Promise<unknown>): Promise<string | null> {
  try {
    await write()
    return null
  } catch (error) {
    const { data } = error as { data?: { errors?: { path?: string; message?: string }[] } }
    const entry = data?.errors?.find((e) => e.path === 'availableLocales')
    // A write can also fail on an unrelated required field — `wm-web-config`
    // has four. That is not this field refusing, so it reports null.
    return entry?.message ?? null
  }
}

async function localesError(write: () => Promise<unknown>): Promise<string> {
  const message = await localesErrorOrNull(write)
  if (message === null) throw new Error('Expected availableLocales to refuse the write')
  return message
}

describe('availableLocales', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let clientReq: ReturnType<typeof createClientAuthenticatedRequest>
  let rest: RestClient

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    rest = await createRestClient(testEnv)

    const client = await testData.createClient(payload, testEnv.adminUser.id)
    clientReq = createClientAuthenticatedRequest(String(client.id), 'unused-in-local-api')

    // English published up front, so the publish-gate cases below isolate the
    // one locale each is about rather than always naming English too.
    await payload.updateGlobal({
      slug: 'sy-atlas-translations',
      locale: 'en',
      publishSpecificLocale: 'en',
      data: { _status: 'published' } as never,
      overrideAccess: true,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  const setAtlasLocales = (locales: string[], skip = true) =>
    payload.updateGlobal({
      slug: 'sy-atlas-config',
      data: { availableLocales: locales } as never,
      ...(skip ? { context: SKIP } : {}),
      overrideAccess: true,
    })

  const publishAtlasLocale = (locale: TypedLocale, data: Record<string, unknown> = {}) =>
    payload.updateGlobal({
      slug: 'sy-atlas-translations',
      locale,
      publishSpecificLocale: locale,
      data: { _status: 'published', ...data } as never,
      overrideAccess: true,
    })

  describe('the English invariant', () => {
    // Every other locale falls back to English, so a set without it describes a
    // site that cannot render at all.
    it('refuses a set that omits English, even with the publish check skipped', async () => {
      expect(await localesError(() => setAtlasLocales(['fr']))).toMatch(
        /English must always be available/,
      )
    })

    it('accepts English alone', async () => {
      await expect(setAtlasLocales(['en'])).resolves.toBeDefined()
    })

    // The deadlock the exemption exists for. The migration lands every locale
    // as `draft`, and Payload validates the merged document on every save — so
    // gating English would make both config globals unsaveable on deploy, while
    // telling the operator to publish the one locale they cannot deselect.
    it('accepts English with nothing published, and with the publish check ON', async () => {
      await payload.updateGlobal({
        slug: 'sy-atlas-translations',
        locale: 'en',
        publishSpecificLocale: 'en',
        data: { _status: 'draft' } as never,
        overrideAccess: true,
      })
      expect(await localesErrorOrNull(() => setAtlasLocales(['en'], false))).toBeNull()
    })

    // ...and a partial write that never mentions the field still validates it,
    // which is how the two other int suites and the WeMeditate seed found out.
    it('lets an unrelated partial write through once the field has a value', async () => {
      await expect(
        payload.updateGlobal({
          slug: 'sy-atlas-config',
          data: { defaultZoomLevel: 8 } as never,
          overrideAccess: true,
        }),
      ).resolves.toBeDefined()
    })
  })

  describe('the publish gate', () => {
    it('refuses a locale whose translations are unpublished, naming it', async () => {
      expect(await localesError(() => setAtlasLocales(['en', 'fr'], false))).toMatch(
        /Publish the French translations/,
      )
    })

    it('accepts the locale once its translations are published', async () => {
      await publishAtlasLocale('fr')
      await expect(setAtlasLocales(['en', 'fr'], false)).resolves.toBeDefined()
    })

    it('names every unpublished locale, not just the first', async () => {
      expect(await localesError(() => setAtlasLocales(['en', 'fr', 'de', 'nl'], false))).toMatch(
        /German and Dutch/,
      )
    })

    it('refuses again after the locale is unpublished', async () => {
      await payload.updateGlobal({
        slug: 'sy-atlas-translations',
        locale: 'fr',
        publishSpecificLocale: 'fr',
        data: { _status: 'draft' } as never,
        overrideAccess: true,
      })
      expect(await localesError(() => setAtlasLocales(['en', 'fr'], false))).toMatch(/French/)
    })

    // The flag exists for seeds and specs that build a config row before
    // anything is published. It must relax the publish check and nothing else —
    // the English invariant above is asserted with it set.
    it('skipAvailableLocalesCheck bypasses the publish check only', async () => {
      await expect(setAtlasLocales(['en', 'fr', 'de'])).resolves.toBeDefined()
      await setAtlasLocales(['en'])
    })
  })

  describe('the wm-web config carries the same field', () => {
    it('gates on its own translations global, not the atlas one', async () => {
      const setWeb = (locales: string[]) =>
        payload.updateGlobal({
          slug: 'wm-web-config',
          data: { availableLocales: locales } as never,
          overrideAccess: true,
        })

      // Dutch published on the ATLAS translations must not count for We
      // Meditate. English is exempt from the gate, so the case needs a locale
      // that is actually gated.
      await publishAtlasLocale('nl')
      expect(await localesError(() => setWeb(['en', 'nl']))).toMatch(/Dutch/)

      await payload.updateGlobal({
        slug: 'wm-web-translations',
        locale: 'nl',
        publishSpecificLocale: 'nl',
        data: { _status: 'published' } as never,
        overrideAccess: true,
      })
      // The global's four other required fields still refuse this bare write,
      // which is why the assertion is that `availableLocales` stops objecting —
      // not that the write now succeeds. Filling in a home page, audiences and
      // two page lists would test Payload's `required`, not this field.
      expect(await localesErrorOrNull(() => setWeb(['en', 'nl']))).toBeNull()
    })
  })

  describe('the API-client English fallback', () => {
    beforeAll(async () => {
      await publishAtlasLocale('en', { common: { loading: 'Loading…' } })
      await payload.updateGlobal({
        slug: 'sy-atlas-translations',
        locale: 'de',
        publishSpecificLocale: 'de',
        data: { _status: 'published', common: {} } as never,
        overrideAccess: true,
      })
    })

    const readAtlas = (locale: TypedLocale, asClient: boolean) =>
      payload.findGlobal({
        slug: 'sy-atlas-translations',
        locale,
        fallbackLocale: false,
        depth: 0,
        overrideAccess: true,
        ...(asClient ? { req: { ...clientReq } as never } : {}),
      }) as unknown as Promise<{ common?: Record<string, string> | null }>

    it('fills a blank key from English for an API client', async () => {
      const german = await readAtlas('de', true)
      expect(german.common?.loading).toBe('Loading…')
    })

    // A manager must keep seeing which keys are empty — otherwise the admin and
    // the status report both claim a locale is fully translated.
    it('leaves a manager read untouched', async () => {
      const german = await readAtlas('de', false)
      expect(german.common?.loading).toBeUndefined()
    })

    it('leaves an English read untouched', async () => {
      const english = await readAtlas('en', true)
      expect(english.common?.loading).toBe('Loading…')
    })
  })

  /**
   * The one acceptance criterion the local API cannot answer.
   *
   * Both config globals gained a sub-table (`<global>_available_locales`), and
   * the `languages` → `locales` collision this field replaces was a **read-time
   * Drizzle failure** — the config compiled, the local API was never reached,
   * and only a REST read surfaced it. So these go through `handleEndpoints`
   * rather than `payload.findGlobal`.
   *
   * The atlas case asserts the stored set comes back, not merely that the key
   * exists: an assertion that only checked for a 200 would pass against a
   * global that dropped the column entirely.
   */
  describe('over REST', () => {
    beforeAll(async () => {
      // `de` is published by the block above, so this is the publish gate ON,
      // saving a two-locale set — not the skip flag.
      await setAtlasLocales(['en', 'de'], false)
    })

    it('returns 200 with the stored set for sy-atlas-config', async () => {
      const { status, body } = await rest('/api/globals/sy-atlas-config')
      expect(status).toBe(200)
      expect(body.availableLocales).toEqual(['en', 'de'])
    })

    // `wm-web-config` is unconfigured here, which is what production looks like
    // on the deploy that ships this field. The claim is that the new sub-table
    // does not break the read — an unset `required` field is a write-time
    // concern only.
    it('returns 200 for an unconfigured wm-web-config', async () => {
      const { status, body } = await rest('/api/globals/wm-web-config')
      expect(status).toBe(200)
      expect(body.errors).toBeUndefined()
    })
  })
})
