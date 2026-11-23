/**
 * Pages nest under a parent, and a page's address is its ancestors' slugs
 * joined with its own (#1250).
 *
 * Every case here needs a database: the property under test is a walk over
 * stored rows, and the two refusals are Payload's own validation path. The pure
 * half — locale prefixing, the home page, an unusable slug — is
 * `tests/unit/page-web-path.spec.ts`, which runs with no Payload at all.
 *
 * ⚠ **`nestedDocsPlugin` is deliberately not registered on `pages`**, so there
 * is no cascade to test and no `breadcrumbs` column to read. The path is walked
 * per read instead, which is why renaming a parent needs no write to its
 * children at all — the case below asserts exactly that, and that it publishes
 * nothing in any locale.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { LocaleCode } from '@/lib/locales'
import type { Page } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

/** The plaintext key the client read below authenticates with. */
const CLIENT_API_KEY = 'pages-nesting-spec-key'

/**
 * The message a named field refused the write with, or `null` when it went
 * through.
 *
 * ⚠ **Payload's thrown `message` is only the envelope** — "The following field
 * is invalid: Parent" — and says nothing about which of the page's own
 * relatives was handed to it. The field's own words are in `data.errors`.
 */
async function refusalFor(path: string, write: () => Promise<unknown>): Promise<string | null> {
  try {
    await write()
    return null
  } catch (error) {
    const { data } = error as { data?: { errors?: { path?: string; message?: string }[] } }
    return data?.errors?.find((entry) => entry.path === path)?.message ?? null
  }
}

/** The three address fields a consumer reads, for one page. */
async function addressOf(
  payload: Payload,
  id: number,
  locale?: LocaleCode,
): Promise<{ path?: string | null; webPath?: string | null; webUrl?: string | null }> {
  return (await payload.findByID({
    collection: 'pages',
    id,
    depth: 0,
    locale,
    overrideAccess: true,
    select: { path: true, webPath: true, webUrl: true } as never,
  })) as { path?: string | null; webPath?: string | null; webUrl?: string | null }
}

describe('nested pages', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let clientReq: Partial<PayloadRequest>
  let admin: Awaited<ReturnType<typeof createTestEnvironment>>['adminUser']
  let homePage: Page

  /** A published page, optionally under a parent, with the slug it is given. */
  const publish = (slug: string, parent?: number): Promise<Page> =>
    testData.createPage(payload, {
      title: `Nesting ${slug}`,
      slug,
      parent,
      _status: 'published',
    })

  /**
   * A write to `wm-web-config`, as the suite's admin.
   *
   * ⚠ **The user is required, and `overrideAccess: true` is no substitute.**
   * Payload does not thread a global update's `overrideAccess` into
   * `validateFilterOptions`, which falls back to `overrideAccess ?? false` and
   * reads `pages` on the request's own authority — so a write carrying the flag
   * and no user reads as anonymous, finds nothing, and refuses every selection
   * a `filterOptions` narrows. Measured on `indexPages`, payload 3.93.
   */
  const writeWebConfig = (data: Record<string, unknown>): Promise<unknown> =>
    payload.updateGlobal({ slug: 'wm-web-config', user: admin, data: data as never })

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    admin = testEnv.adminUser

    const client = await testData.createClient(payload, testEnv.adminUser.id, {
      label: 'Pages Nesting Spec Client',
      roles: ['wemeditate-web-client'],
      // Payload answers `apiKey: null` from a create — the column is encrypted
      // — so the plaintext is set here for the request stub to carry.
      apiKey: CLIENT_API_KEY,
    })
    clientReq = createClientAuthenticatedRequest(client.id, CLIENT_API_KEY, [
      'wemeditate-web-client',
    ])

    // `wm-web-config` has four required fields, so a partial write to it is
    // refused until every one has a stored value. `availableLocales: ['en']`
    // needs no `skipAvailableLocalesCheck`: the field returns early once the
    // gated set is empty (`src/globals/AGENTS.md`).
    const audience = await testData.createAudience(payload)
    const featured = [await publish('nesting-featured-a'), await publish('nesting-featured-b')]
    homePage = await publish('nesting-home')
    await writeWebConfig({
      homePage: homePage.id,
      availableLocales: ['en'],
      audiences: [audience.id],
      featuredPages: featured.map((page) => page.id),
      featuredArticles: featured.map((page) => page.id),
    })
    // The home page keeps `''` rather than a slug, which `blankAllowed` admits
    // only once the global names it.
    await payload.update({ collection: 'pages', id: homePage.id, data: { slug: '' } })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the composed address', () => {
    it('leaves a page with no parent exactly as it was', async () => {
      const page = await publish('nesting-unnested')

      expect(await addressOf(payload, page.id)).toMatchObject({
        path: 'nesting-unnested',
        webPath: 'nesting-unnested',
      })
      const { webUrl } = await addressOf(payload, page.id)
      expect(webUrl).toMatch(/\/nesting-unnested$/)
    })

    it('carries every ancestor, in root-first order', async () => {
      const root = await publish('nesting-subtle-system')
      const child = await publish('nesting-kundalini', root.id)
      const grandchild = await publish('nesting-rising', child.id)

      expect(await addressOf(payload, child.id)).toMatchObject({
        path: 'nesting-subtle-system/nesting-kundalini',
        webPath: 'nesting-subtle-system/nesting-kundalini',
      })
      expect(await addressOf(payload, grandchild.id)).toMatchObject({
        path: 'nesting-subtle-system/nesting-kundalini/nesting-rising',
      })
    })

    it('prefixes the locale on webPath, and never on path', async () => {
      const root = await publish('nesting-de-root')
      const child = await publish('nesting-de-child', root.id)
      await payload.update({
        collection: 'pages',
        id: child.id,
        locale: 'de',
        publishSpecificLocale: 'de',
        data: { title: 'Deutsches Kind', _status: 'published' },
      })

      expect(await addressOf(payload, child.id, 'de')).toMatchObject({
        path: 'nesting-de-root/nesting-de-child',
        webPath: 'de/nesting-de-root/nesting-de-child',
      })
    })

    it('keeps the home page at the site root even when it is nested', async () => {
      // Nothing refuses the home page a parent — only its use *as* one — so the
      // composer has to answer for it. A trailing empty segment would publish
      // `section/` as the home page's address.
      const section = await publish('nesting-home-section')
      await payload.update({
        collection: 'pages',
        id: homePage.id,
        data: { parent: section.id },
      })

      expect(await addressOf(payload, homePage.id)).toMatchObject({ path: '', webPath: null })
    })

    it('answers nothing where an ancestor has no slug of its own', async () => {
      // A `//` in a published canonical is worse than an absent address, so an
      // unresolvable chain yields none at all.
      const untitled = await payload.create({
        collection: 'pages',
        data: createData<'pages'>({}),
        draft: true,
      })
      expect(untitled.slug).toBeNull()

      const child = await publish('nesting-orphaned-child', untitled.id)

      expect(await addressOf(payload, child.id)).toMatchObject({
        path: null,
        webPath: null,
        webUrl: null,
      })
    })
  })

  describe('an ancestor the caller cannot read', () => {
    it('still composes the whole address for a client', async () => {
      // The hazard the walk's `overrideAccess` exists for: a client reads only
      // published pages, so an unpublished ancestor is invisible to it. Under
      // the caller's authority the chain would come back short and the client
      // would be handed `nesting-hidden-child` — routing, linking and
      // advertising the page at an address the site does not serve.
      const hiddenParent = await testData.createPage(payload, {
        title: 'Nesting hidden parent',
        slug: 'nesting-hidden-parent',
        _status: 'draft',
      })
      const child = await publish('nesting-hidden-child', hiddenParent.id)

      const read = (await payload.findByID({
        collection: 'pages',
        id: child.id,
        depth: 0,
        req: clientReq as PayloadRequest,
        overrideAccess: false,
        select: { path: true, webUrl: true } as never,
      })) as { path?: string | null; webUrl?: string | null }

      expect(read.path).toBe('nesting-hidden-parent/nesting-hidden-child')
      expect(read.webUrl).toMatch(/\/nesting-hidden-parent\/nesting-hidden-child$/)
    })

    it('refuses the client that ancestor as a document', async () => {
      // The other half of the case above: the client genuinely cannot read the
      // row, so the address really is composed past its authority.
      const hidden = await testData.createPage(payload, {
        title: 'Nesting unreadable',
        slug: 'nesting-unreadable',
        _status: 'draft',
      })

      const found = await payload.find({
        collection: 'pages',
        where: { id: { equals: hidden.id } },
        depth: 0,
        req: clientReq as PayloadRequest,
        overrideAccess: false,
        select: { id: true } as never,
      })

      expect(found.docs).toHaveLength(0)
    })
  })

  describe('moving and renaming', () => {
    it('moves every descendant, and publishes nothing in any locale', async () => {
      const root = await publish('nesting-move-root')
      const child = await publish('nesting-move-child', root.id)
      const grandchild = await publish('nesting-move-grandchild', child.id)

      // German published, French left as a draft: the shapes a cascade would
      // damage. `_status` is per locale here (#718).
      await payload.update({
        collection: 'pages',
        id: grandchild.id,
        locale: 'de',
        publishSpecificLocale: 'de',
        data: { title: 'Deutscher Enkel', _status: 'published' },
      })
      await payload.update({
        collection: 'pages',
        id: grandchild.id,
        locale: 'fr',
        draft: true,
        data: { title: 'Brouillon français' },
      })

      await payload.update({
        collection: 'pages',
        id: root.id,
        data: { slug: 'nesting-move-renamed' },
      })

      expect(await addressOf(payload, grandchild.id)).toMatchObject({
        path: 'nesting-move-renamed/nesting-move-child/nesting-move-grandchild',
      })

      // Nothing wrote the descendants, so no locale's publish state moved: the
      // two live languages are still live and French is still not.
      const statuses = (
        (await payload.findByID({
          collection: 'pages',
          id: grandchild.id,
          locale: 'all',
          depth: 0,
          overrideAccess: true,
          select: { _status: true } as never,
        })) as { _status?: Record<string, string | undefined> }
      )._status
      expect(statuses?.en).toBe('published')
      expect(statuses?.de).toBe('published')
      // A locale never published carries no row in the map at all, so absent is
      // the shape to assert rather than `'draft'` (`pages-localize-status`).
      expect(statuses?.fr).not.toBe('published')

      // And the draft itself survived: a cascade would have rewritten it.
      const frDraft = (await payload.findByID({
        collection: 'pages',
        id: grandchild.id,
        locale: 'fr',
        draft: true,
        depth: 0,
        overrideAccess: true,
        select: { title: true } as never,
      })) as { title?: string | null }
      expect(frDraft.title).toBe('Brouillon français')
    })

    it('reparents a whole subtree in one write', async () => {
      const first = await publish('nesting-reparent-first')
      const second = await publish('nesting-reparent-second')
      const child = await publish('nesting-reparent-child', first.id)
      const grandchild = await publish('nesting-reparent-grandchild', child.id)

      await payload.update({ collection: 'pages', id: child.id, data: { parent: second.id } })

      expect(await addressOf(payload, grandchild.id)).toMatchObject({
        path: 'nesting-reparent-second/nesting-reparent-child/nesting-reparent-grandchild',
      })
    })
  })

  describe('which parents are refused', () => {
    /** What the `parent` field refused with, or `null` when the write went through. */
    const reparent = (id: number, parent: number | null): Promise<string | null> =>
      refusalFor('parent', () => payload.update({ collection: 'pages', id, data: { parent } }))

    it('refuses the page itself', async () => {
      const page = await publish('nesting-self')
      expect(await reparent(page.id, page.id)).toMatch(/its own parent/)
    })

    it('refuses a descendant, naming it', async () => {
      const root = await publish('nesting-loop-root')
      const child = await publish('nesting-loop-child', root.id)
      const grandchild = await publish('nesting-loop-grandchild', child.id)

      // A descendant passes `filterOptions` — no `Where` expresses ancestry —
      // so only the chain walk catches it.
      expect(await reparent(root.id, grandchild.id)).toMatch(/nesting-loop-grandchild/)
    })

    it('refuses the home page', async () => {
      const page = await publish('nesting-wants-home')

      expect(await reparent(page.id, homePage.id)).toMatch(/home page/)
    })

    it('refuses a chain past the depth ceiling', async () => {
      let parent: number | undefined
      const chain: Page[] = []
      for (let level = 0; level < 6; level += 1) {
        const page = await publish(`nesting-deep-${level}`, parent)
        chain.push(page)
        parent = page.id
      }

      // The sixth page already has five ancestors, so a seventh level is one
      // ancestor too many.
      const tooDeep = await publish('nesting-deep-tail')
      expect(await reparent(tooDeep.id, chain[5]!.id)).toMatch(/at most 5 others/)
    })

    it('allows a chain at the ceiling, so the refusal is the depth and not the nesting', async () => {
      let parent: number | undefined
      for (let level = 0; level < 5; level += 1) {
        const page = await publish(`nesting-ok-${level}`, parent)
        parent = page.id
      }
      const deepest = await publish('nesting-ok-tail', parent)

      expect(await addressOf(payload, deepest.id)).toMatchObject({
        path: 'nesting-ok-0/nesting-ok-1/nesting-ok-2/nesting-ok-3/nesting-ok-4/nesting-ok-tail',
      })
    })

    it('refuses an id no page holds, in Payload’s own words', async () => {
      // The chain walk has nothing to say about a parent that does not exist,
      // so this is the case that goes red if the composed `relationship`
      // validator is dropped — and with it the `filterOptions` enforcement a
      // bare custom `validate` silently disarms (`src/collections/AGENTS.md`).
      const page = await publish('nesting-missing-parent')
      const missing = await publish('nesting-to-delete')
      await payload.delete({ collection: 'pages', id: missing.id })

      expect(await reparent(page.id, missing.id)).toMatch(/invalid/i)
    })
  })

  describe('wm-web-config.indexPages', () => {
    /** What the named index field refused with, or `null` when it accepted. */
    const setIndexPage = (field: 'meditations' | 'lectures', pageId: number) =>
      refusalFor(`indexPages.${field}`, () => writeWebConfig({ indexPages: { [field]: pageId } }))

    it('accepts the page at `meditations`, and refuses any other', async () => {
      const index = await publish('meditations')
      const other = await publish('nesting-not-the-index')

      expect(await setIndexPage('meditations', index.id)).toBeNull()
      expect(await setIndexPage('meditations', other.id)).not.toBeNull()
    })

    it('refuses a page whose slug matches but which sits under a parent', async () => {
      // The site mounts its own detail routes at this page, so it has to be at
      // the site root — `/lectures/<slug>`, not `/somewhere/lectures/<slug>`.
      const section = await publish('nesting-lectures-section')
      const nested = await publish('lectures', section.id)

      expect(await setIndexPage('lectures', nested.id)).not.toBeNull()
    })
  })
})
