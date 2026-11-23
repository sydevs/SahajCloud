import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { buildPagePath, buildPageWebPath } from '@/collections/Pages/webPath'

/**
 * The shared composer behind a page's `path`, its `webPath` and its live-preview
 * URL. These were once written separately, and disagreed: a tag segment was
 * published that no site serves. Pinning the shape here is what keeps them one
 * answer.
 *
 * ⚠ **Every case here passes `parent: null`, which is what keeps the lane
 * database-free.** The composer reads an ancestor only when there is one, so a
 * stub `req` is never touched. The ancestor walk — a chain, a cycle, the depth
 * ceiling, an ancestor the caller cannot read — is `pages-nesting.int.spec.ts`,
 * where pages exist to walk.
 */
const noReq = {} as PayloadRequest

const webPath = (slug: unknown, locale: string | null | undefined) =>
  buildPageWebPath({ slug, parent: null, locale, req: noReq })

const path = (slug: unknown) => buildPagePath({ slug, parent: null, req: noReq })

describe('buildPageWebPath', () => {
  it('is the bare slug for the default locale', async () => {
    await expect(webPath('about', 'en')).resolves.toBe('about')
  })

  it('prefixes a non-default locale', async () => {
    await expect(webPath('about', 'cs')).resolves.toBe('cs/about')
  })

  it('takes no prefix for the all-locales read', async () => {
    // `locale: 'all'` is a read mode, not a locale a URL can carry.
    await expect(webPath('about', 'all')).resolves.toBe('about')
  })

  it('takes no prefix when the locale is absent', async () => {
    await expect(webPath('about', undefined)).resolves.toBe('about')
    await expect(webPath('about', null)).resolves.toBe('about')
  })

  it('emits at most a locale segment and a slug for an unnested page', async () => {
    // The defect this module exists to prevent was a TAG segment, giving
    // `/wisdom/about` — a 404 on every site that has ever served this content.
    // A nested page legitimately carries more; its segments are its ancestors'
    // slugs, which the integration spec pins.
    expect((await webPath('about', 'en'))!.split('/')).toHaveLength(1)
    expect((await webPath('about', 'cs'))!.split('/')).toHaveLength(2)
  })

  it('is null without a usable slug, so no caller builds a URL to nowhere', async () => {
    await expect(webPath('', 'en')).resolves.toBeNull()
    await expect(webPath(undefined, 'en')).resolves.toBeNull()
    await expect(webPath(42, 'en')).resolves.toBeNull()
  })

  it('is null for the home page, in every locale', async () => {
    // The home page holds the slug `''` and is served at the site root, which
    // is not a page address the consumer routes to — and `cs/` with nothing
    // after it is not one either.
    await expect(webPath('', 'cs')).resolves.toBeNull()
  })
})

describe('buildPagePath', () => {
  it('is the bare slug, with no locale prefix of any kind', async () => {
    // The consumer owns prefixing, so this one carries none.
    await expect(path('about')).resolves.toBe('about')
  })

  it('is the empty string for the home page, which webPath answers null for', async () => {
    // The consumer needs the home page's address to be a value rather than an
    // absence: it is the root of the tree every other path hangs under.
    await expect(path('')).resolves.toBe('')
  })

  it('is null without a usable slug', async () => {
    await expect(path(undefined)).resolves.toBeNull()
    await expect(path(null)).resolves.toBeNull()
    await expect(path(42)).resolves.toBeNull()
  })
})
