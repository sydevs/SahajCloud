/**
 * The locale on a hand-rolled admin REST call is a permission, not a query
 * option (#701). Four of the five call sites that carry the fix build a URL
 * or an SWR key from `useLocale().code`, and only a browser can observe them
 * end to end — so the string each one builds is pinned here instead.
 *
 * The sibling integration specs prove the SERVER half: that `?locale=fr` is
 * accepted and its absence is refused. They cannot see whether a client sends
 * it. That is what these assertions cover.
 *
 * The fifth site, `fetchRelationshipDocs`, is pinned in
 * `relationshipDocLoader.spec.ts` against a stubbed `fetch`.
 */

import { describe, expect, it } from 'vitest'

import { framesByNarratorKey } from '../../src/components/admin/FrameEditor/utils'
import {
  retryTranscriptUrl,
  transcriptUrl,
} from '../../src/components/admin/MeditationTranscript/transcriptModel'
import { submissionActionUrl } from '../../src/components/admin/SubmissionReview/urls'

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

describe('submissionActionUrl', () => {
  it('sends the locale on the review op, which is role-gated', () => {
    expect(submissionActionUrl(7, 'accept', 'fr')).toBe(
      '/api/user-submissions/7/review?locale=fr',
    )
    expect(submissionActionUrl(7, 'reject', 'fr')).toBe(
      '/api/user-submissions/7/review?locale=fr',
    )
    expect(submissionActionUrl(7, 'reopen', 'fr')).toBe(
      '/api/user-submissions/7/review?locale=fr',
    )
  })

  it('sends it on DELETE too, so both calls have one shape', () => {
    expect(submissionActionUrl(7, 'delete', 'fr')).toBe('/api/user-submissions/7?locale=fr')
  })

  it('encodes the locale', () => {
    expect(submissionActionUrl(7, 'accept', 'pt-BR')).toBe(
      '/api/user-submissions/7/review?locale=pt-BR',
    )
  })

  // `?locale=undefined` is rewritten to the default locale by `sanitizeLocales`,
  // so interpolating an absent code reproduces #701 with no visible failure.
  it('refuses to build a URL with no locale', () => {
    expect(submissionActionUrl(7, 'accept', undefined)).toBeNull()
    expect(submissionActionUrl(7, 'delete', '')).toBeNull()
  })
})

describe('transcriptUrl', () => {
  it('names the locale, and filters on the meditation', () => {
    const url = transcriptUrl(7, 'fr')

    expect(url).toContain('locale=fr')
    expect(url).toContain(`where${encodeURIComponent('[meditation][equals]')}=7`)
  })

  it('encodes the locale', () => {
    expect(transcriptUrl(7, 'pt-BR')).toContain('locale=pt-BR')
  })

  it('keys two locales separately, so a locale switch refetches', () => {
    expect(transcriptUrl(7, 'fr')).not.toBe(transcriptUrl(7, 'en'))
  })

  it('refuses to build a URL with no locale', () => {
    expect(transcriptUrl(7, undefined)).toBeNull()
    expect(transcriptUrl(7, '')).toBeNull()
  })

  it('refuses to build a URL with no meditation', () => {
    expect(transcriptUrl(undefined, 'fr')).toBeNull()
  })
})

describe('retryTranscriptUrl', () => {
  it('names the locale, because the endpoint gates on it', () => {
    expect(retryTranscriptUrl(7, 'fr')).toBe('/api/meditations/7/transcript?locale=fr')
  })

  it('encodes the locale', () => {
    expect(retryTranscriptUrl(7, 'pt-BR')).toBe('/api/meditations/7/transcript?locale=pt-BR')
  })

  it('refuses to build a URL with no locale', () => {
    expect(retryTranscriptUrl(7, undefined)).toBeNull()
    expect(retryTranscriptUrl(7, '')).toBeNull()
  })

  it('refuses to build a URL with no meditation', () => {
    expect(retryTranscriptUrl(undefined, 'fr')).toBeNull()
  })
})
