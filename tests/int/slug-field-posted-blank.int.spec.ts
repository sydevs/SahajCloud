import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * A blank slug, whether a caller posted it or the generator produced it
 * (#1038, #1040).
 *
 * Payload's Generate button posts `''` for a blank title, any REST or Local API
 * write can carry one, and a source that transliterates to nothing (`東京`)
 * generates one. `pages` is the one collection with drafts — so the one whose
 * slug column is nullable. `authors` stands in for the four whose column is
 * NOT NULL. A grandfathered blank region is `region-blank-slug-cascade`'s.
 */
describe('slugField: a blank slug', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  /** The factory's own refusal, rather than the unique index's 400 on the same path. */
  const blankSlugRefusal = {
    status: 400,
    data: { errors: [{ path: 'slug', message: expect.stringContaining('A slug is required') }] },
  }

  describe('pages, whose slug column is nullable', () => {
    const createUntitledDraft = () =>
      payload.create({ collection: 'pages', data: createData<'pages'>({}), draft: true })

    it('stores NULL for a blank posted to an untitled draft', async () => {
      // The Generate button on an untitled new Page, then its autosave.
      const draft = await createUntitledDraft()

      const saved = await payload.update({
        collection: 'pages',
        id: draft.id,
        data: { slug: '' },
        draft: true,
      })

      expect(saved.slug).toBeNull()
    })

    it('regenerates from the title when a blank is posted beside one', async () => {
      const draft = await createUntitledDraft()

      const published = await payload.update({
        collection: 'pages',
        id: draft.id,
        data: { title: 'Posted Blank Page', slug: '' },
      })

      expect(published.slug).toBe('posted-blank-page')
    })

    it('stores NULL when a published save clears a real slug', async () => {
      const page = await testData.createPage(payload, { title: 'Clears Its Slug' })

      const cleared = await payload.update({
        collection: 'pages',
        id: page.id,
        data: { slug: '' },
      })

      expect(cleared.slug).toBeNull()
    })

    it('stores NULL for a title that transliterates to nothing, so a second one still saves', async () => {
      const first = await testData.createPage(payload, { title: '東京' })
      const second = await testData.createPage(payload, { title: '!!!' })

      expect(first.slug).toBeNull()
      expect(second.slug).toBeNull()
    })
  })

  describe('a collection whose slug column is NOT NULL', () => {
    it.each(['', null])(
      'refuses %j posted alone, rather than storing it or failing in Postgres',
      async (slug) => {
        const author = await testData.createAuthor(payload, { name: `Blank Patch ${slug}` })

        await expect(
          payload.update({ collection: 'authors', id: author.id, data: { slug } as never }),
        ).rejects.toMatchObject(blankSlugRefusal)

        const stored = await payload.findByID({ collection: 'authors', id: author.id, depth: 0 })
        expect(stored.slug).toBe(author.slug)
      },
    )

    it('regenerates from the name when the generator is switched on', async () => {
      const author = await testData.createAuthor(payload, { name: 'Regenerated Author' })

      const updated = await payload.update({
        collection: 'authors',
        id: author.id,
        data: { name: 'Renamed Author', slug: '', generateSlug: true },
      })

      expect(updated.slug).toBe('renamed-author')
    })

    it('refuses a create whose name transliterates to nothing', async () => {
      await expect(
        payload.create({ collection: 'authors', data: createData<'authors'>({ name: '東京' }) }),
      ).rejects.toMatchObject(blankSlugRefusal)
    })

    it('refuses a rename that would regenerate a blank slug', async () => {
      const author = await testData.createAuthor(payload, { name: 'Renamed To Nothing' })

      await expect(
        payload.update({
          collection: 'authors',
          id: author.id,
          data: { name: '東京', generateSlug: true },
        }),
      ).rejects.toMatchObject(blankSlugRefusal)
    })

    it('refuses a region whose name transliterates to nothing', async () => {
      await expect(
        payload.create({
          collection: 'regions',
          overrideAccess: true,
          data: { name: '東京', level: 'country', mapboxId: 'mb-tokyo' } as never,
        }),
      ).rejects.toMatchObject(blankSlugRefusal)
    })
  })
})
