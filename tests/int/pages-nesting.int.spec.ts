/**
 * Pages nest under a parent, and a page's address is its ancestors' slugs
 * joined with its own (#1250).
 *
 * Every case here needs a database: the property under test is a walk over
 * stored rows, and the refusals are Payload's own validation path. The pure
 * half — locale prefixing, the home page, an unusable slug — is
 * `tests/unit/page-web-path.spec.ts`, which runs with no Payload at all.
 *
 * ⚠ **`nestedDocsPlugin` is deliberately not registered on `pages`**, so there
 * is no cascade to test and no `breadcrumbs` column to read. The path is walked
 * per read instead.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { PAGE_ANCESTOR_LIMIT } from '@/collections/Pages/webPath'
import type { LocaleCode } from '@/lib/locales'
import type { Page } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import {
  createClientAuthenticatedRequest,
  createTestEnvironment,
  idOnlySelect,
} from '../utils/testHelpers'

/** The plaintext key the client read below authenticates with. */
const CLIENT_API_KEY = 'pages-nesting-spec-key'

/** The address fields a consumer reads, for one page. */
type Address = Pick<Page, 'path' | 'webPath' | 'webUrl'>

/**
 * The message a named field refused the write with, or `null` when it went
 * through.
 *
 * ⚠ **Payload's thrown `message` is only the envelope** — "The following field
 * is invalid: Parent" — and says nothing about which of the page's own
 * relatives it was handed. The field's own words are in `data.errors`.
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

  /** A chain of `levels` published pages, root first. */
  const chainOf = async (prefix: string, levels: number): Promise<Page[]> => {
    const chain: Page[] = []
    for (let level = 0; level < levels; level += 1) {
      chain.push(await publish(`${prefix}-${level}`, chain.at(-1)?.id))
    }
    return chain
  }

  const addressOf = (id: number, locale?: LocaleCode): Promise<Address> =>
    payload.findByID({
      collection: 'pages',
      id,
      depth: 0,
      locale,
      overrideAccess: true,
      select: { path: true, webPath: true, webUrl: true },
    }) as Promise<Address>

  /**
   * A write to `wm-web-config`, as the suite's admin. The user is required —
   * `src/globals/AGENTS.md` carries why `overrideAccess` is no substitute.
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
      const { path, webPath, webUrl } = await addressOf(page.id)

      expect(path).toBe('nesting-unnested')
      expect(webPath).toBe('nesting-unnested')
      expect(webUrl).toMatch(/\/nesting-unnested$/)
    })

    it('carries every ancestor, in root-first order', async () => {
      const chain = await chainOf('nesting-subtle', 3)

      expect((await addressOf(chain[1]!.id)).path).toBe('nesting-subtle-0/nesting-subtle-1')
      expect((await addressOf(chain[2]!.id)).path).toBe(
        'nesting-subtle-0/nesting-subtle-1/nesting-subtle-2',
      )
    })

    it('prefixes the locale on webPath, and never on path', async () => {
      const [, child] = await chainOf('nesting-de', 2)
      await payload.update({
        collection: 'pages',
        id: child!.id,
        locale: 'de',
        publishSpecificLocale: 'de',
        data: { title: 'Deutsches Kind', _status: 'published' },
      })

      expect(await addressOf(child!.id, 'de')).toMatchObject({
        path: 'nesting-de-0/nesting-de-1',
        webPath: 'de/nesting-de-0/nesting-de-1',
      })
    })

    it('keeps the home page at the site root', async () => {
      // `''` rather than an absence: the consumer needs the root of the tree
      // every other path hangs under. `webPath` stays null, because a locale
      // prefix with nothing after it is not an address.
      expect(await addressOf(homePage.id)).toMatchObject({ path: '', webPath: null })
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

      expect(await addressOf(child.id)).toMatchObject({
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
        select: { path: true, webUrl: true },
      })) as Address

      expect(read.path).toBe('nesting-hidden-parent/nesting-hidden-child')
      expect(read.webUrl).toMatch(/\/nesting-hidden-parent\/nesting-hidden-child$/)
    })

    it('refuses the client that ancestor as a document', async () => {
      // The other half of the case above, which would otherwise pass vacuously
      // if a client could read a draft page. The published gate itself is
      // `pages-localize-status.int.spec.ts`; this pins only that it applies to
      // the row the walk reaches past.
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
        select: idOnlySelect(),
      })

      expect(found.docs).toHaveLength(0)
    })
  })

  describe('moving and renaming', () => {
    it('moves every descendant, and publishes nothing in any locale', async () => {
      const [root, , grandchild] = await chainOf('nesting-move', 3)

      // German published, French left as a draft: the shapes a cascade would
      // damage. `_status` is per locale here (#718).
      await payload.update({
        collection: 'pages',
        id: grandchild!.id,
        locale: 'de',
        publishSpecificLocale: 'de',
        data: { title: 'Deutscher Enkel', _status: 'published' },
      })
      await payload.update({
        collection: 'pages',
        id: grandchild!.id,
        locale: 'fr',
        draft: true,
        data: { title: 'Brouillon français' },
      })

      await payload.update({
        collection: 'pages',
        id: root!.id,
        data: { slug: 'nesting-move-renamed' },
      })

      expect((await addressOf(grandchild!.id)).path).toBe(
        'nesting-move-renamed/nesting-move-1/nesting-move-2',
      )

      // Nothing wrote the descendants, so no locale's publish state moved.
      // `locale: 'all'` returns `_status` as a per-locale map, which the
      // generated type does not describe — hence the cast here and nowhere else.
      const statuses = (
        (await payload.findByID({
          collection: 'pages',
          id: grandchild!.id,
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
      const frDraft = await payload.findByID({
        collection: 'pages',
        id: grandchild!.id,
        locale: 'fr',
        draft: true,
        depth: 0,
        overrideAccess: true,
        select: { title: true },
      })
      expect(frDraft.title).toBe('Brouillon français')
    })

    it('reparents a whole subtree in one write', async () => {
      const second = await publish('nesting-reparent-second')
      const [, child, grandchild] = await chainOf('nesting-reparent', 3)

      await payload.update({ collection: 'pages', id: child!.id, data: { parent: second.id } })

      expect((await addressOf(grandchild!.id)).path).toBe(
        'nesting-reparent-second/nesting-reparent-1/nesting-reparent-2',
      )
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
      const [root, , grandchild] = await chainOf('nesting-loop', 3)

      // A descendant passes `filterOptions` — no `Where` expresses ancestry —
      // so only the chain walk catches it.
      expect(await reparent(root!.id, grandchild!.id)).toMatch(/nesting-loop-2/)
    })

    it('refuses the home page as a parent', async () => {
      const page = await publish('nesting-wants-home')
      expect(await reparent(page.id, homePage.id)).toMatch(/cannot be a parent/)
    })

    it('refuses the home page a parent of its own', async () => {
      // The symmetric rule, and what lets the composer answer `''` for the home
      // page with no branch for it: a nested root would otherwise compose a
      // trailing empty segment.
      const section = await publish('nesting-home-section')
      expect(await reparent(homePage.id, section.id)).toMatch(/cannot sit under/)
    })

    it('refuses a chain one level past the ceiling', async () => {
      const chain = await chainOf('nesting-deep', PAGE_ANCESTOR_LIMIT + 1)
      const tooDeep = await publish('nesting-deep-tail')

      // The deepest page already has `PAGE_ANCESTOR_LIMIT` ancestors, so one
      // more level is one ancestor too many.
      expect(await reparent(tooDeep.id, chain.at(-1)!.id)).toMatch(
        new RegExp(`at most ${PAGE_ANCESTOR_LIMIT} others`),
      )
    })

    it('allows a chain at the ceiling, so the refusal is the depth and not the nesting', async () => {
      const chain = await chainOf('nesting-ok', PAGE_ANCESTOR_LIMIT)
      const deepest = await publish('nesting-ok-tail', chain.at(-1)!.id)

      expect((await addressOf(deepest.id)).path).not.toBeNull()
    })

    it('keeps a child saveable after its parent is trashed', async () => {
      // `validateFilterOptions` re-runs on every save, and its own find passes
      // no `trash: true` — so a trashed parent reads as an invalid selection and
      // the child cannot be saved at all. The ancestor walk passes the flag
      // deliberately, so the two must agree.
      const [section, child] = await chainOf('nesting-trashed', 2)
      await payload.update({
        collection: 'pages',
        id: section!.id,
        data: { deletedAt: new Date().toISOString() },
      })

      const refusal = await refusalFor('parent', () =>
        payload.update({
          collection: 'pages',
          id: child!.id,
          data: { title: 'Still editable' },
        }),
      )
      expect(refusal).toBeNull()
      // And it keeps the trashed section's slug in its address.
      expect((await addressOf(child!.id)).path).toBe('nesting-trashed-0/nesting-trashed-1')
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

  describe('the site root', () => {
    it('cannot be pointed at a page that is already nested', async () => {
      // The other ordering: `pages` refuses the home page a parent, but nothing
      // stopped `homePage` naming a page that already had one — and with its
      // slug then blanked, the root's own address composes `section/`.
      const [, nested] = await chainOf('nesting-root-order', 2)

      const refusal = await refusalFor('homePage', () => writeWebConfig({ homePage: nested.id }))
      expect(refusal).not.toBeNull()
    })
  })

  describe('a parent no validator saw', () => {
    it('does not move a published address, and never loops the walk', async () => {
      // ⚠ `pages` declares no `drafts.validate`, so Payload skips validation on
      // every draft save — an autosave stores whatever `parent` the form holds,
      // including a descendant every refusal above would reject. It lands in the
      // version row, so the published address is unaffected; what the walk can
      // be handed is that unvalidated value as its FIRST hop, on a `draft: true`
      // read. It has to terminate on one.
      const [root, child] = await chainOf('nesting-unvalidated', 2)

      await payload.update({
        collection: 'pages',
        id: root!.id,
        draft: true,
        data: { parent: child!.id },
      })

      expect((await addressOf(root!.id)).path).toBe('nesting-unvalidated-0')
      expect((await addressOf(child!.id)).path).toBe('nesting-unvalidated-0/nesting-unvalidated-1')

      // The draft read starts the walk from the unvalidated parent and returns.
      const draft = (await payload.findByID({
        collection: 'pages',
        id: root!.id,
        draft: true,
        depth: 0,
        overrideAccess: true,
        select: { path: true },
      })) as Pick<Page, 'path'>
      expect(typeof draft.path).toBe('string')
    })
  })

  describe('the per-request memo', () => {
    it('reads each distinct ancestor once, however many pages ask', async () => {
      // Three virtual fields ask per document, and siblings share a parent, so
      // without the memo a read of N pages under one section costs 3N walks and
      // 3N queries. Nothing else would notice that regressing.
      const [root, child] = await chainOf('nesting-memo', 2)
      const leaves = [
        await publish('nesting-memo-leaf-a', child!.id),
        await publish('nesting-memo-leaf-b', child!.id),
        await publish('nesting-memo-leaf-c', child!.id),
      ]

      const spy = vi.spyOn(payload, 'findByID')
      try {
        const read = await payload.find({
          collection: 'pages',
          where: { id: { in: leaves.map((leaf) => leaf.id) } },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          select: { path: true, webPath: true, webUrl: true },
        })
        expect(read.docs).toHaveLength(3)

        const ancestorIds = spy.mock.calls
          .map(([args]) => args as { collection?: string; id?: unknown })
          .filter((args) => args.collection === 'pages')
          .map((args) => args.id)

        // The two distinct ancestors, once each — not 3 pages × 3 fields × 2.
        expect(ancestorIds).toHaveLength(2)
        expect(new Set(ancestorIds)).toEqual(new Set([root!.id, child!.id]))
      } finally {
        spy.mockRestore()
      }
    })
  })

  describe('page editors inherit down the tree', () => {
    it('gives a manager listed on a section the pages beneath it', async () => {
      // ⚠ Naming the field `parent` is the whole opt-in: `detectDocManagerFields`
      // (`src/plugins/access/documentManagers.ts`) finds a self-referential
      // relationship by that literal name, so this collection's "Page Editors"
      // now inherit to descendants. Nothing in this change declares it, and
      // nothing else asserts it.
      const editor = await testData.createManager(payload, { type: 'manager', roles: [] })
      const section = await publish('nesting-owned-section')
      await payload.update({
        collection: 'pages',
        id: section.id,
        data: { managers: [editor.id] },
      })
      const beneath = await publish('nesting-owned-child', section.id)
      const elsewhere = await publish('nesting-unowned')

      // Asserted on `update`, not `read`: being listed derives the
      // `page-editor` role, whose project already grants a collection-wide read
      // of `pages`, so a read cannot tell inheritance from that.
      const user = await testData.authUser(payload, editor)
      const retitle = (id: number, title: string) =>
        payload.update({ collection: 'pages', id, data: { title }, overrideAccess: false, user })

      // Asserted on the written value, not on "it did not throw": a refusal and
      // a silent no-op are both falsy, and only the readback tells them apart.
      const edited = await retitle(beneath.id, 'Edited by the section editor')
      expect(edited.title).toBe('Edited by the section editor')

      await expect(retitle(elsewhere.id, 'Should be refused')).rejects.toThrow()
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
