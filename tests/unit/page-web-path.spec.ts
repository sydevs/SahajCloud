import { describe, expect, it } from 'vitest'

import { buildPageWebPath } from '@/collections/Pages/webPath'

/**
 * The shared composer behind a page's `webPath` and its live-preview URL.
 * These two used to be written separately, and disagreed: a tag segment was
 * published that no site serves. Pinning the shape here is what keeps them
 * one answer.
 */
describe('buildPageWebPath', () => {
  it('is the bare slug for the default locale', () => {
    expect(buildPageWebPath({ slug: 'about', locale: 'en' })).toBe('about')
  })

  it('prefixes a non-default locale', () => {
    expect(buildPageWebPath({ slug: 'about', locale: 'cs' })).toBe('cs/about')
  })

  it('takes no prefix for the all-locales read', () => {
    // `locale: 'all'` is a read mode, not a locale a URL can carry.
    expect(buildPageWebPath({ slug: 'about', locale: 'all' })).toBe('about')
  })

  it('takes no prefix when the locale is absent', () => {
    expect(buildPageWebPath({ slug: 'about', locale: undefined })).toBe('about')
    expect(buildPageWebPath({ slug: 'about', locale: null })).toBe('about')
  })

  it('emits at most a locale segment and a slug — never a third', () => {
    // The defect this module exists to prevent was a TAG segment, giving
    // `/wisdom/about` — a 404 on every site that has ever served this content.
    //
    // The old version of this case asserted `not.toContain('/')` on an English
    // path, which this function is structurally incapable of failing: it takes
    // no tag, and a non-default locale legitimately contains a slash. Counting
    // segments is what actually pins the shape.
    expect(buildPageWebPath({ slug: 'about', locale: 'en' })!.split('/')).toHaveLength(1)
    expect(buildPageWebPath({ slug: 'about', locale: 'cs' })!.split('/')).toHaveLength(2)
  })

  it('is null without a usable slug, so no caller builds a URL to nowhere', () => {
    expect(buildPageWebPath({ slug: '', locale: 'en' })).toBeNull()
    expect(buildPageWebPath({ slug: undefined, locale: 'en' })).toBeNull()
    expect(buildPageWebPath({ slug: 42, locale: 'en' })).toBeNull()
  })
})
