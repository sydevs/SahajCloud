/**
 * Per-locale publish state on `pages` and `app-cards` (#718).
 *
 * `versions.drafts.localizeStatus` moves `_status` into each collection's
 * `_locales` table, so `?locale=all&select[_status]=true` answers "which
 * languages is this document live in?" in one query. WeMeditateWeb reads that
 * map to build an `hreflang` cluster that only names locales it really has
 * (WeMeditateWeb#81).
 *
 * Every case here needs a database: the property under test is *stored* state
 * across 19 locale rows, and the flag's whole effect is on the read path. There
 * is no pure half to extract.
 *
 * ⚠ Each case must go red when `localizeStatus` is removed from the collection
 * config — that is the acceptance criterion these were written against, and it
 * was checked by actually removing the key, not assumed. The status map's
 * *shape* is what carries that: without the flag Payload returns the plain
 * string `'published'` where these expect a per-locale object.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PREVIEW_SECRET_HEADER } from '@/lib/utilities/previewSecret'

import { testData } from '../utils/testData'
import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

/** The per-locale `_status` map, read the way a consumer reads it. */
type StatusMap = Record<string, string | undefined>

async function statusMap(payload: Payload, id: number | string): Promise<StatusMap> {
  const doc = await payload.findByID({
    collection: 'pages',
    id,
    locale: 'all',
    depth: 0,
    overrideAccess: true,
    select: { _status: true } as never,
  })
  return (doc as { _status?: StatusMap })._status ?? {}
}

/**
 * Which locales the map reports as published.
 *
 * A locale is published only when it says so. Absent is **not** published: a
 * locale with no row at all — never translated — simply does not appear in the
 * map, which is the shape a page published in one language has for the other
 * eighteen. Consumers must read the map this way round, so the spec does too.
 */
function publishedLocales(map: StatusMap): string[] {
  return Object.keys(map)
    .filter((locale) => map[locale] === 'published')
    .sort()
}

describe('per-locale publish status', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let clientReq: Partial<PayloadRequest>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    const client = await testData.createClient(payload, testEnv.adminUser.id, {
      roles: ['wemeditate-web-client'],
    })
    // `createClientAuthenticatedRequest` builds the header and a minimal user.
    // The role has to be on that user object: access runs off `req.user`, not
    // off a fresh read of the client row, so a req without it is denied
    // outright and every case below would pass for the wrong reason.
    const base = createClientAuthenticatedRequest(String(client.id), 'unused-in-local-api')
    clientReq = {
      ...base,
      user: { ...base.user, roles: ['wemeditate-web-client'] } as PayloadRequest['user'],
    }
  })

  afterAll(async () => {
    await cleanup()
  })

  /** Publish `locale` on a page, optionally setting that locale's title. */
  const publish = (id: number | string, locale: 'en' | 'de', title?: string) =>
    payload.update({
      collection: 'pages',
      id,
      locale,
      publishSpecificLocale: locale,
      data: { ...(title ? { title } : {}), _status: 'published' } as never,
      overrideAccess: true,
    })

  const unpublish = (id: number | string, locale: 'en' | 'de') =>
    payload.update({
      collection: 'pages',
      id,
      locale,
      publishSpecificLocale: locale,
      data: { _status: 'draft' } as never,
      overrideAccess: true,
    })

  describe('the status map (criteria 4 and 5)', () => {
    it('reports one status per locale, not one for the document', async () => {
      const page = await testData.createPage(payload, { title: 'Mapped' })
      await publish(page.id, 'en')
      await publish(page.id, 'de', 'Kartiert')

      const map = await statusMap(payload, page.id)

      // The shape is the assertion. Without `localizeStatus` this is the string
      // 'published', and every case in this file is about the object.
      expect(typeof map).toBe('object')
      expect(publishedLocales(map)).toEqual(['de', 'en'])
    })

    it('reports only the locales actually published, whatever the fallback renders', async () => {
      const page = await testData.createPage(payload, { title: 'English only' })
      await publish(page.id, 'en')

      expect(publishedLocales(await statusMap(payload, page.id))).toEqual(['en'])

      // The fallback still renders this page in German — that is exactly the
      // confusion the map exists to clear up. A reader asking for German gets
      // English text back, and the map still says German is not published.
      const asGerman = await payload.findByID({
        collection: 'pages',
        id: page.id,
        locale: 'de',
        depth: 0,
        overrideAccess: true,
      })
      expect(asGerman.title).toBe('English only')
    })

    it('drops a locale back to unpublished on its own, leaving the others alone', async () => {
      const page = await testData.createPage(payload, { title: 'Both' })
      await publish(page.id, 'en')
      await publish(page.id, 'de', 'Beide')
      await unpublish(page.id, 'de')

      const map = await statusMap(payload, page.id)
      expect(publishedLocales(map)).toEqual(['en'])
      expect(map.de).toBe('draft')
    })

    it('answers for app-cards too', async () => {
      const card = await testData.createAppCard(payload)
      await payload.update({
        collection: 'app-cards',
        id: card.id,
        locale: 'en',
        publishSpecificLocale: 'en',
        data: { _status: 'published' } as never,
        overrideAccess: true,
      })

      const doc = await payload.findByID({
        collection: 'app-cards',
        id: card.id,
        locale: 'all',
        depth: 0,
        overrideAccess: true,
        select: { _status: true } as never,
      })
      const map = (doc as { _status?: StatusMap })._status ?? {}
      expect(typeof map).toBe('object')
      expect(publishedLocales(map)).toEqual(['en'])
    })
  })

  describe('published-only access still holds (criterion 8)', () => {
    /**
     * The criterion most likely to break, and the reason the access `Where` in
     * `accessConfigs.ts` needs no change: it constrains `_status`, that column
     * moved into `pages_locales`, and Drizzle now scopes the same clause to the
     * requested locale for free.
     *
     * Measured, not assumed: with the gate removed, a read at `?locale=de`
     * returns the unpublished German title. So this is a live leak the clause
     * prevents, not a formality.
     */
    it('refuses a client the content of a locale it unpublished', async () => {
      const page = await testData.createPage(payload, { title: 'Secret EN' })
      await publish(page.id, 'en')
      await publish(page.id, 'de', 'Geheim DE')
      await unpublish(page.id, 'de')

      const asClient = await payload.find({
        collection: 'pages',
        locale: 'de',
        depth: 0,
        where: { id: { equals: page.id } },
        select: { id: true, title: true } as never,
        overrideAccess: false,
        req: { ...clientReq } as never,
      })

      expect(asClient.docs).toHaveLength(0)

      // The same client still reads the locale that is published.
      const asClientEn = await payload.find({
        collection: 'pages',
        locale: 'en',
        depth: 0,
        where: { id: { equals: page.id } },
        select: { id: true, title: true } as never,
        overrideAccess: false,
        req: { ...clientReq } as never,
      })
      expect(asClientEn.docs.map((d) => (d as { title?: string }).title)).toEqual(['Secret EN'])
    })

    /**
     * The access clause filters DOCUMENTS, not the locales in the response, so
     * `?locale=all` is not gated by it — a published-only client would
     * otherwise read the German text of a locale the editor took down. Closed
     * by `withPublishedLocaleRedaction`: a cross-locale client read answers
     * which locales are published and nothing else.
     *
     * This one found a real leak. Its sibling above only asked for `?locale=de`
     * and passed while `?locale=all` — the read this whole ticket tells
     * consumers to use — handed the content over.
     */
    it('hands a client no content at all on a cross-locale read', async () => {
      const page = await testData.createPage(payload, { title: 'Visible EN' })
      await publish(page.id, 'en')
      await publish(page.id, 'de', 'Zurueckgezogen DE')
      await unpublish(page.id, 'de')

      const crossLocale = await payload.find({
        collection: 'pages',
        locale: 'all',
        depth: 0,
        where: { id: { equals: page.id } },
        select: { title: true, _status: true } as never,
        overrideAccess: false,
        req: { ...clientReq } as never,
      })

      expect(crossLocale.docs).toHaveLength(1)
      const doc = crossLocale.docs[0] as Record<string, unknown>

      // The unpublished German title is gone — and so is the published English
      // one, which is the blunt part of the rule rather than an accident.
      expect(doc.title).toBeUndefined()
      expect(Object.keys(doc).sort()).toEqual(['_status', 'id'])

      // The contract itself still answers.
      expect(publishedLocales((doc as { _status?: StatusMap })._status ?? {})).toEqual(['en'])
    })

    /**
     * The rollout consequence, pinned rather than argued. A never-translated
     * locale has no row in `pages_locales`, so the published-only clause — SQL,
     * which sees rows and not the fallback — matches nothing there. The page is
     * unreachable in that locale even though nobody unpublished it.
     *
     * ⚠ This fires on **existing** data, not on a deliberate unpublish. The
     * migration copies each document's old status into every locale row that
     * exists, and there is none to copy into here. Payload's own
     * `localizeStatus` template has the same property: it `UPDATE`s locale rows
     * and never inserts one. WeMeditateWeb's `getPageBySlug` reads `pages` at
     * the visitor's locale and 404s on an empty result, so an English-only page
     * stops serving German the day this deploys — the fallback used to render
     * it (WeMeditateWeb#81).
     *
     * Measured, not inferred: the client read below returns 0 docs while the
     * English one returns the page.
     */
    it('serves a never-translated locale to nobody, published elsewhere or not', async () => {
      const page = await testData.createPage(payload, { title: 'English only, untranslated' })
      await publish(page.id, 'en')

      // German was never written, so it is absent from the map — not 'draft'.
      const map = await statusMap(payload, page.id)
      expect(publishedLocales(map)).toEqual(['en'])
      expect(map.de).toBeUndefined()

      const asClientDe = await payload.find({
        collection: 'pages',
        locale: 'de',
        depth: 0,
        where: { id: { equals: page.id } },
        select: { id: true, title: true } as never,
        overrideAccess: false,
        req: { ...clientReq } as never,
      })
      expect(asClientDe.docs).toHaveLength(0)

      const asClientEn = await payload.find({
        collection: 'pages',
        locale: 'en',
        depth: 0,
        where: { id: { equals: page.id } },
        select: { id: true, title: true } as never,
        overrideAccess: false,
        req: { ...clientReq } as never,
      })
      expect(asClientEn.docs).toHaveLength(1)
    })

    it('leaves a manager cross-locale read untouched', async () => {
      const page = await testData.createPage(payload, { title: 'Manager sees all' })
      await publish(page.id, 'en')

      const asManager = await payload.findByID({
        collection: 'pages',
        id: page.id,
        locale: 'all',
        depth: 0,
        overrideAccess: true,
      })
      expect((asManager as { title?: unknown }).title).toBeDefined()
    })

    it('never serves a page no locale has published', async () => {
      const page = await testData.createPage(payload, { title: 'Unpublished' })

      const asClient = await payload.find({
        collection: 'pages',
        locale: 'en',
        depth: 0,
        where: { id: { equals: page.id } },
        select: { id: true } as never,
        overrideAccess: false,
        req: { ...clientReq } as never,
      })
      expect(asClient.docs).toHaveLength(0)
    })
  })

  describe('the contract a consumer reads (criterion 6)', () => {
    it('gives an API client the map through the ordinary select, with no extra permission', async () => {
      const page = await testData.createPage(payload, { title: 'Consumer' })
      await publish(page.id, 'en')

      const result = await payload.find({
        collection: 'pages',
        locale: 'all',
        depth: 0,
        where: { id: { equals: page.id } },
        select: { _status: true } as never,
        overrideAccess: false,
        req: { ...clientReq } as never,
      })

      expect(result.docs).toHaveLength(1)
      const map = (result.docs[0] as { _status?: StatusMap })._status ?? {}
      expect(publishedLocales(map)).toEqual(['en'])
    })
  })

  describe('no fan-out (criterion 7)', () => {
    /**
     * The reason `publishedLocales` is not a field on the document (#718): a
     * collection `afterRead` hook computing one would have to re-read each row
     * at `locale: 'all'`, which is 25 extra queries on a 25-row list. Reading
     * `_status` under `locale=all` costs nothing extra, because the Postgres
     * adapter already joins `_locales` unfiltered on every localized read.
     *
     * Counted at the pool, so it counts what the database actually received.
     */
    it('answers a 25-row list in a single query', async () => {
      for (let i = 0; i < 25; i++) {
        const page = await testData.createPage(payload)
        await publish(page.id, 'en')
      }

      const db = payload.db as unknown as {
        pool: { query: (...args: unknown[]) => Promise<unknown> }
      }
      const original = db.pool.query.bind(db.pool)
      let queries = 0
      db.pool.query = ((...args: unknown[]) => {
        queries++
        return original(...args)
      }) as typeof db.pool.query

      try {
        const list = await payload.find({
          collection: 'pages',
          locale: 'all',
          depth: 0,
          limit: 25,
          overrideAccess: true,
          select: { _status: true } as never,
        })
        expect(list.docs.length).toBe(25)
      } finally {
        db.pool.query = original as typeof db.pool.query
      }

      // One SELECT for the rows. Payload issues a separate COUNT for
      // pagination, so the bound is what rules out a per-row fan-out, not an
      // exact count of one.
      expect(queries).toBeLessThanOrEqual(2)
    })
  })

  describe('live preview keeps its draft unlock (criterion 9)', () => {
    it('serves an unpublished locale to a request carrying the preview secret', async () => {
      const page = await testData.createPage(payload, { title: 'Preview EN' })
      await publish(page.id, 'en')
      await payload.update({
        collection: 'pages',
        id: page.id,
        locale: 'de',
        data: { title: 'Vorschau DE' },
        draft: true,
        overrideAccess: true,
      })

      const headers = new Headers()
      headers.set('authorization', `clients API-Key unused-in-local-api`)
      headers.set(PREVIEW_SECRET_HEADER, process.env.SAHAJCLOUD_PREVIEW_SECRET ?? '')

      const previewReq = { ...clientReq, headers: headers as PayloadRequest['headers'] }

      const preview = await payload.find({
        collection: 'pages',
        locale: 'de',
        depth: 0,
        draft: true,
        where: { id: { equals: page.id } },
        select: { id: true, title: true } as never,
        overrideAccess: false,
        req: previewReq as never,
      })

      expect(preview.docs.map((d) => (d as { title?: string }).title)).toEqual(['Vorschau DE'])
    })
  })
})
