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
 *
 * `submissionActionUrl` was a fourth until #909 moved submission review onto
 * `WorkflowButtons`. Payload's own document form carries the locale in the
 * `action` it builds, so there is no hand-rolled URL left to pin.
 */

import { describe, expect, it } from 'vitest'

import { framesByNarratorKey } from '../../src/components/admin/FrameEditor/utils'
import { transcriptUrl } from '../../src/components/admin/MeditationTranscript/transcriptModel'

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
