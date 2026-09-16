import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestEnvironment } from '../utils/testHelpers'

/**
 * The live-preview URLs pointing at WeMeditate Web.
 *
 * ⚠ **These were entirely unpinned, and two defects lived in the gap.**
 * `atlas-collections` covers the two atlas collections and
 * `translations-globals` covers the two translations globals, so the repoint
 * looked well tested — while Pages, Meditations, Lectures and `wm-web-config`
 * had no assertion at all. What hid there:
 *
 * - Meditations and Lectures put the locale in a `?locale=` parameter.
 *   WeMeditateWeb derives its locale from the path and reads no such
 *   parameter, so a translator's panel silently rendered English. Meditations
 *   was a regression: its old URL had the locale in the path.
 * - `wm-web-config` sent no `scope`, so the consumer fell back to "the route's
 *   own primary document" and read drafts for the home *page* rather than the
 *   config global being edited.
 *
 * Neither is the kind of thing a reviewer spots by reading a URL template.
 */
describe('WeMeditate Web live-preview URLs', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup?.()
  })

  const req = () => ({ payload, locale: 'cs', context: {} }) as unknown as PayloadRequest

  const collectionUrl = async (slug: 'pages' | 'meditations' | 'lectures', data: object, code = 'cs') => {
    const { livePreview } = payload.collections[slug].config.admin
    if (typeof livePreview?.url !== 'function') throw new Error(`${slug} resolves no live-preview URL`)
    return (await livePreview.url({
      data,
      locale: { code },
      req: req(),
    } as never)) as string
  }

  const globalUrl = async (slug: 'wm-web-config', code = 'cs') => {
    const config = payload.config.globals.find((g) => g.slug === slug)
    const url = config?.admin?.livePreview?.url
    if (typeof url !== 'function') throw new Error(`${slug} resolves no live-preview URL`)
    return (await url({ locale: { code } } as never)) as string
  }

  const base = () => new URL(process.env.WEMEDITATE_WEB_URL!)

  describe('the locale rides in the path, never a query parameter', () => {
    it.each([
      ['pages', { slug: 'about' }, '/cs/about'],
      ['meditations', { id: 7 }, '/cs/meditations/7/embed'],
      ['lectures', { id: 9 }, '/cs/lectures/9'],
    ] as const)('%s', async (slug, data, expected) => {
      const url = new URL(await collectionUrl(slug, data))

      expect(url.origin).toBe(base().origin)
      expect(url.pathname).toBe(expected)
      // The parameter WeMeditateWeb does not read. Its presence is the bug.
      expect(url.searchParams.get('locale')).toBeNull()
      expect(url.searchParams.get('live-preview')).toBeTruthy()
    })

    it.each([
      ['pages', { slug: 'about' }, '/about'],
      ['meditations', { id: 7 }, '/meditations/7/embed'],
      ['lectures', { id: 9 }, '/lectures/9'],
    ] as const)('%s takes no prefix for English', async (slug, data, expected) => {
      // `/en/x` 301s to `/x`, so prefixing English costs a redirect for nothing.
      expect(new URL(await collectionUrl(slug, data, 'en')).pathname).toBe(expected)
    })
  })

  describe('wm-web-config', () => {
    it('names its own scope, so the consumer unlocks the global and not the home page', async () => {
      expect(new URL(await globalUrl('wm-web-config')).searchParams.get('scope')).toBe(
        'wm-web-config',
      )
    })

    it('points at the locale root, with the trailing slash a relative target needs', async () => {
      expect(new URL(await globalUrl('wm-web-config')).pathname).toBe('/cs/')
      expect(new URL(await globalUrl('wm-web-config', 'en')).pathname).toBe('/')
    })
  })

  describe('a document with no address', () => {
    it('lands on the explanation rather than a URL that 404s', async () => {
      const raw = await collectionUrl('pages', {})

      expect(raw.startsWith('/')).toBe(true)
      expect(new URL(raw, 'https://admin.example').pathname).toBe('/live-preview-unavailable')
    })
  })
})
