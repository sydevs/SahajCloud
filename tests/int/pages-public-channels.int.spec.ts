/**
 * Which pages a service reads — the website's, the app's, or both (#783).
 *
 * `publicChannelClause` is pure and its role→column matrix lives in
 * `tests/unit/public-channels.spec.ts`. What needs a database is everything
 * this file asserts: that `createAccessConfig` really ANDs the clause into each
 * read shape a page arrives through, that it composes with the per-locale
 * published-only clause rather than replacing it, and that a populate degrades
 * to a bare id instead of erroring — the behaviour WeMeditateWeb's
 * `partitionPublishedPages` depends on.
 *
 * ⚠ Each case must go red with the clause removed from `accessConfigs.ts`.
 * Checked by removing it, not assumed.
 */
import type { PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { APP_REQUIRED_PAGE_FIELDS } from '@/globals/WeMeditateAppConfig/WeMeditateAppConfig'
import { serverEnv } from '@/lib/env'
import { mintLivePreviewToken } from '@/lib/livePreview/token'
import { PREVIEW_SECRET_HEADER, resolveLivePreviewHook } from '@/lib/utilities/previewSecret'
import type { Client, Page } from '@/payload-types'

import { testData } from '../utils/testData'
import {
  createClientAuthenticatedRequest,
  createTestEnvironment,
  idOnlySelect,
} from '../utils/testHelpers'

type Channels = Pick<Page, 'publishedToWeb' | 'publishedToApp'>

/** The client roles `Clients.roles` accepts. */
type ClientRole = NonNullable<Client['roles']>[number]

describe('page publishing channels', () => {
  let payload: Awaited<ReturnType<typeof createTestEnvironment>>['payload']
  let cleanup: () => Promise<void>
  let adminId: number

  let webReq: Partial<PayloadRequest>
  let appReq: Partial<PayloadRequest>
  let bothReq: Partial<PayloadRequest>

  let webPage: Page
  let appPage: Page
  let bothPage: Page

  /**
   * A client request carrying `roles`.
   *
   * ⚠ The roles have to sit on the `req.user` object, which is the helper's
   * third argument: access runs off that object, not off a fresh read of the
   * client row, so a req without them is denied outright and every case here
   * would pass for the wrong reason.
   */
  const asClient = async (roles: ClientRole[]): Promise<Partial<PayloadRequest>> => {
    const client = await testData.createClient(payload, adminId, { roles })
    return createClientAuthenticatedRequest(client.id, 'unused-in-local-api', roles)
  }

  /** A page published in English, with the channels stated. */
  const createChannelPage = async (title: string, channels: Channels): Promise<Page> => {
    const page = await testData.createPage(payload, { title, ...channels })
    return payload.update({
      collection: 'pages',
      id: page.id,
      locale: 'en',
      publishSpecificLocale: 'en',
      data: { _status: 'published' } as never,
      overrideAccess: true,
    })
  }

  /**
   * The ids this request can see, out of the three pages the suite built.
   *
   * `overrideAccess` is a parameter so the cases that assert the clause does
   * **not** narrow read the same way as the ones that assert it does.
   */
  const visibleIds = async (
    req: Partial<PayloadRequest>,
    { overrideAccess = false } = {},
  ): Promise<number[]> => {
    const found = await payload.find({
      collection: 'pages',
      depth: 0,
      limit: 100,
      where: { id: { in: [webPage.id, appPage.id, bothPage.id] } },
      select: idOnlySelect(),
      overrideAccess,
      req: { ...req } as never,
    })
    return found.docs.map((doc) => (doc as { id: number }).id).sort((a, b) => a - b)
  }

  const sorted = (...ids: Array<number | string>) => (ids as number[]).slice().sort((a, b) => a - b)

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    adminId = testEnv.adminUser.id

    webReq = await asClient(['wemeditate-web-client'])
    appReq = await asClient(['wemeditate-app-client'])
    bothReq = await asClient(['wemeditate-web-client', 'wemeditate-app-client'])

    webPage = await createChannelPage('Website only', {
      publishedToWeb: true,
      publishedToApp: false,
    })
    appPage = await createChannelPage('App only', {
      publishedToWeb: false,
      publishedToApp: true,
    })
    bothPage = await createChannelPage('Both services', {
      publishedToWeb: true,
      publishedToApp: true,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('a find is narrowed to the caller’s channels', () => {
    it('gives a web client the website pages and not the app-only one', async () => {
      expect(await visibleIds(webReq)).toEqual(sorted(webPage.id, bothPage.id))
    })

    it('gives an app client the app pages and not the website-only one', async () => {
      expect(await visibleIds(appReq)).toEqual(sorted(appPage.id, bothPage.id))
    })

    it('gives a client holding both roles every page, the union and not the intersection', async () => {
      expect(await visibleIds(bothReq)).toEqual(sorted(webPage.id, appPage.id, bothPage.id))
    })
  })

  describe('a findByID is narrowed too', () => {
    /**
     * `findByID` carries no `where` of its own, which is the whole reason the
     * filter is here and not in each consumer: Payload combines the access
     * `Where` into the lookup, so a refused page is a 404 rather than a
     * document the caller was not meant to see.
     */
    it('answers 404 when a web client names an app-only page', async () => {
      await expect(
        payload.findByID({
          collection: 'pages',
          id: appPage.id,
          depth: 0,
          select: idOnlySelect(),
          overrideAccess: false,
          req: { ...webReq } as never,
        }),
      ).rejects.toThrow()
    })

    it('answers the same page to the client that publishes it', async () => {
      const doc = await payload.findByID({
        collection: 'pages',
        id: appPage.id,
        depth: 0,
        select: idOnlySelect(),
        overrideAccess: false,
        req: { ...appReq } as never,
      })
      expect((doc as { id: number }).id).toBe(appPage.id)
    })
  })

  describe('a populate degrades to a bare id', () => {
    /**
     * The app's own read of `wm-app-config`, which populates fourteen page
     * relationships. A page the caller may not read must arrive as a bare id,
     * not as an error and not as a document: that is what WeMeditateWeb's
     * `partitionPublishedPages` discards, and it is how an unpublished page is
     * already hidden from the menus today.
     *
     * The global carries no drafts, so the published-only clause does not fire
     * here and the channel clause is the only thing under test.
     */
    it('hands an app client a bare id for a website-only page named on wm-app-config', async () => {
      // `classesPage` names a page the app does not publish; every other slot
      // names one it does, so one read carries both directions.
      await payload.updateGlobal({
        slug: 'wm-app-config',
        data: {
          ...Object.fromEntries(APP_REQUIRED_PAGE_FIELDS.map((name) => [name, bothPage.id])),
          classesPage: webPage.id,
          availableLocales: ['en'],
        } as never,
        overrideAccess: true,
      })

      const asApp = await payload.findGlobal({
        slug: 'wm-app-config',
        depth: 1,
        overrideAccess: false,
        req: {
          ...appReq,
          // The client query gate wants a `select` on every client read, which
          // a global read cannot carry for a nested relationship.
          context: { skipClientQueryValidation: true },
          payload,
        } as never,
      })

      expect(asApp.classesPage).toBe(webPage.id)
      expect((asApp.privacyPage as { id: number }).id).toBe(bothPage.id)
    })
  })

  describe('it composes with the published-only clause', () => {
    /**
     * The two narrowings are now collected and ANDed rather than returned one
     * at a time, so each has to survive the other. The channel columns sit on
     * `pages` and `_status` on `pages_locales`, which is why one `and` covers
     * both.
     */
    it('still refuses a client the content of a locale it unpublished', async () => {
      const page = await createChannelPage('Composes EN', {
        publishedToWeb: true,
        publishedToApp: false,
      })
      await payload.update({
        collection: 'pages',
        id: page.id,
        locale: 'de',
        publishSpecificLocale: 'de',
        data: { title: 'Geheim DE', _status: 'published' } as never,
        overrideAccess: true,
      })
      await payload.update({
        collection: 'pages',
        id: page.id,
        locale: 'de',
        publishSpecificLocale: 'de',
        data: { _status: 'draft' } as never,
        overrideAccess: true,
      })

      const read = (locale: 'en' | 'de') =>
        payload.find({
          collection: 'pages',
          locale,
          depth: 0,
          where: { id: { equals: page.id } },
          select: idOnlySelect(),
          overrideAccess: false,
          req: { ...webReq } as never,
        })

      expect((await read('de')).docs).toHaveLength(0)
      expect((await read('en')).docs.map((d) => (d as { id: number }).id)).toEqual([page.id])
    })

    it('refuses a draft page to the client that publishes its channel', async () => {
      const draft = await testData.createPage(payload, {
        title: 'Draft on the web channel',
        publishedToWeb: true,
        publishedToApp: false,
      })

      const found = await payload.find({
        collection: 'pages',
        depth: 0,
        where: { id: { equals: draft.id } },
        select: idOnlySelect(),
        overrideAccess: false,
        req: { ...webReq } as never,
      })
      expect(found.docs).toHaveLength(0)
    })
  })

  describe('only a client is narrowed', () => {
    it('shows a manager every page, whatever its channels', async () => {
      const manager = await testData.createManager(payload, {
        name: 'Channel-blind manager',
        type: 'admin' as const,
      })

      const asManager = { user: { ...manager, collection: 'managers' } } as Partial<PayloadRequest>
      expect(await visibleIds(asManager)).toEqual(sorted(webPage.id, appPage.id, bothPage.id))
    })

    /**
     * ⚠ This one pins Payload's behaviour, not ours: `overrideAccess: true`
     * skips access control entirely, so no defect in the clause can turn it
     * red. It is here because the seeds, the jobs and the fixture load all read
     * this way, and a reader needs to know the clause never reaches them.
     */
    it('shows an overrideAccess read every page', async () => {
      expect(await visibleIds({}, { overrideAccess: true })).toEqual(
        sorted(webPage.id, appPage.id, bothPage.id),
      )
    })
  })

  describe('live preview stays exempt', () => {
    /**
     * `Pages.admin.livePreview` always frames the website, so without this
     * exemption the one preview panel an editor has for an App-only page would
     * show a 404.
     */
    it('serves an app-only page to a web client carrying the preview secret', async () => {
      const headers = new Headers()
      headers.set('authorization', 'clients API-Key unused-in-local-api')
      const token = await mintLivePreviewToken(serverEnv.LIVE_PREVIEW_SIGNING_KEY)
      headers.set(PREVIEW_SECRET_HEADER, token ?? 'no-key-configured')

      // ⚠ Calling `resolveLivePreviewHook` is what makes the request a
      // preview. Without it this asserts the ordinary published path instead.
      const previewReq = {
        ...webReq,
        context: {},
        headers: headers as PayloadRequest['headers'],
      }
      await resolveLivePreviewHook({ req: previewReq as never })

      const preview = await payload.find({
        collection: 'pages',
        depth: 0,
        draft: true,
        where: { id: { equals: appPage.id } },
        select: idOnlySelect(),
        overrideAccess: false,
        req: previewReq as never,
      })
      expect(preview.docs.map((d) => (d as { id: number }).id)).toEqual([appPage.id])
    })
  })
})
