/**
 * The locale on a hand-rolled admin REST call is a permission, not a query
 * option (#701). Two of the three call sites that carry the fix build a URL
 * or an SWR key from `useLocale().code`, and only a browser can observe them
 * end to end — so the string each one builds is pinned here instead.
 *
 * The sibling integration specs prove the SERVER half: that `?locale=fr` is
 * accepted and its absence is refused. They cannot see whether a client sends
 * it. That is what these assertions cover.
 *
 * The third site, `fetchRelationshipDocs`, is pinned in
 * `relationshipDocLoader.spec.ts` against a stubbed `fetch`.
 */

import { describe, expect, it } from 'vitest'

import { eventSubmissionActionUrl } from '../../src/components/admin/EventSubmissions/urls'
import { framesByNarratorKey } from '../../src/components/admin/FrameEditor/utils'

describe('framesByNarratorKey', () => {
  it('puts the locale in the request URL', () => {
    expect(framesByNarratorKey('42', 'fr')).toBe('/api/frames/by-narrator/42?locale=fr')
  })

  it('encodes the locale', () => {
    expect(framesByNarratorKey('42', 'pt-BR')).toBe('/api/frames/by-narrator/42?locale=pt-BR')
  })

  it('keys two locales separately, so a locale switch refetches', () => {
    expect(framesByNarratorKey('42', 'fr')).not.toBe(framesByNarratorKey('42', 'en'))
  })

  // Without this, SWR fetches under whatever locale the server defaults to —
  // which is the #701 403, silently.
  it('refuses to build a key with no locale', () => {
    expect(framesByNarratorKey('42', undefined)).toBeNull()
    expect(framesByNarratorKey('42', '')).toBeNull()
  })

  it('refuses to build a key with no narrator', () => {
    expect(framesByNarratorKey(null, 'fr')).toBeNull()
  })
})

describe('eventSubmissionActionUrl', () => {
  it('sends the locale on the review op, which is role-gated', () => {
    expect(eventSubmissionActionUrl(7, 'accept', 'fr')).toBe(
      '/api/event-submissions/7/review?locale=fr',
    )
    expect(eventSubmissionActionUrl(7, 'reject', 'fr')).toBe(
      '/api/event-submissions/7/review?locale=fr',
    )
    expect(eventSubmissionActionUrl(7, 'reopen', 'fr')).toBe(
      '/api/event-submissions/7/review?locale=fr',
    )
  })

  it('sends it on DELETE too, so both calls have one shape', () => {
    expect(eventSubmissionActionUrl(7, 'delete', 'fr')).toBe('/api/event-submissions/7?locale=fr')
  })

  it('encodes the locale', () => {
    expect(eventSubmissionActionUrl(7, 'accept', 'pt-BR')).toBe(
      '/api/event-submissions/7/review?locale=pt-BR',
    )
  })

  // `?locale=undefined` is rewritten to the default locale by `sanitizeLocales`,
  // so interpolating an absent code reproduces #701 with no visible failure.
  it('refuses to build a URL with no locale', () => {
    expect(eventSubmissionActionUrl(7, 'accept', undefined)).toBeNull()
    expect(eventSubmissionActionUrl(7, 'delete', '')).toBeNull()
  })
})
