/**
 * `composeTargetUrl` — the whole of the preview-target mechanism that can be
 * tested without booting Payload's admin.
 *
 * Two properties matter more than the path rewriting itself:
 *
 * 1. **The origin and the query survive.** The composed URL is what the Live
 *    Preview iframe loads, and the default it is built from is the only place
 *    the query exists — the declaration on the tab carries no origin and no
 *    credential. Drop the query and the panel loses the locale being edited.
 *    The `secret` below is a stand-in for any parameter the default sends: no
 *    global sends one today, because nothing reads it off a view path
 *    (`translations-globals.int.spec.ts` holds that), and the composer is
 *    deliberately incurious either way.
 * 2. **A target can never move the preview off that origin.** The declaration
 *    reaches the browser through `admin.custom`, so this is the check standing
 *    between a schema edit and an arbitrary page loaded inside the admin.
 */
import { describe, expect, it } from 'vitest'

import { composeTargetUrl } from '@/components/admin/PreviewTarget/composeTargetUrl'

const ATLAS = 'https://atlas.example/?secret=s3cret&locale=fr'
const WEB = 'https://web.example/fr/?secret=s3cret'

describe('composeTargetUrl', () => {
  describe('path rewriting', () => {
    it('replaces the whole path for an absolute target path', () => {
      expect(composeTargetUrl(ATLAS, { path: '/search' })).toBe(
        'https://atlas.example/search?secret=s3cret&locale=fr',
      )
    })

    it('resolves a relative target path against the default, keeping its prefix', () => {
      // This is why a locale-prefixed site declares `map` and not `/map`: the
      // locale the translator is editing lives in that prefix.
      expect(composeTargetUrl(WEB, { path: 'map' })).toBe(
        'https://web.example/fr/map?secret=s3cret',
      )
    })

    it('keeps the origin and the query of the server-resolved default', () => {
      const composed = new URL(composeTargetUrl(ATLAS, { path: '/calendar' })!)

      expect(composed.origin).toBe('https://atlas.example')
      expect(composed.searchParams.get('secret')).toBe('s3cret')
      expect(composed.searchParams.get('locale')).toBe('fr')
    })
  })

  describe('params', () => {
    it('merges declared params over the default query', () => {
      const composed = new URL(composeTargetUrl(ATLAS, { path: '/search', params: { q: 'pune' } })!)

      expect(composed.searchParams.get('q')).toBe('pune')
      expect(composed.searchParams.get('secret')).toBe('s3cret')
    })

    it('lets a declared param override one of the default’s', () => {
      // On the locale-prefixed base, so the path assertion still has something
      // to catch: a params-only target must leave the whole path alone, and a
      // root-path base could not tell that apart from replacing it with `/`.
      const composed = new URL(composeTargetUrl(`${WEB}&locale=fr`, { params: { locale: 'de' } })!)

      expect(composed.searchParams.get('locale')).toBe('de')
      expect(composed.pathname).toBe('/fr/')
    })
  })

  describe('refusals — the panel is left where it is', () => {
    it.each([
      ['an absolute URL on another origin', 'https://evil.example/x'],
      ['a protocol-relative URL', '//evil.example'],
      ['a leading backslash, which browsers normalise to a slash', '/\\evil.example'],
      ['a tab before the second slash, which the URL parser strips', '/\t/evil.example'],
      ['a javascript: URL', 'javascript:alert(1)'],
      ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    ])('refuses %s', (_label, path) => {
      expect(composeTargetUrl(ATLAS, { path })).toBeNull()
    })

    it('refuses a target that names nothing to change', () => {
      expect(composeTargetUrl(ATLAS, { autoOpen: true })).toBeNull()
    })

    it('refuses a default that is not a URL', () => {
      expect(composeTargetUrl('', { path: '/search' })).toBeNull()
      expect(composeTargetUrl('/not-absolute', { path: '/search' })).toBeNull()
    })
  })
})
