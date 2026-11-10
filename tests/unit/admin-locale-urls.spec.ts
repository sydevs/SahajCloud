/**
 * The locale on a hand-rolled admin REST call is a permission, not a query
 * option (#701). Five of the six call sites that carry the fix build a URL
 * or an SWR key from `useLocale().code`, and only a browser can observe them
 * end to end — so the string each one builds is pinned here instead.
 *
 * The sibling integration specs prove the SERVER half: that `?locale=fr` is
 * accepted and its absence is refused. They cannot see whether a client sends
 * it. That is what these assertions cover.
 *
 * The sixth site, `fetchRelationshipDocs`, is pinned in
 * `relationshipDocLoader.spec.ts` against a stubbed `fetch`.
 *
 * `submissionActionUrl` was one of them until #909 moved submission review onto
 * `WorkflowButtons`. Payload's own document form carries the locale in the
 * `action` it builds, so there is no hand-rolled URL left to pin.
 */

import { describe, expect, it } from 'vitest'

import { framesByNarratorKey } from '../../src/components/admin/FrameEditor/utils'
import {
  introAudioFilenameUrl,
  introSubtitlesUrl,
} from '../../src/components/admin/IntroSubtitles/introSubtitlesModel'
import {
  transcribeUrl,
  transcriptUrl,
} from '../../src/components/admin/MeditationTranscript/transcriptModel'

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
  /**
   * ⚠ **The object form, both halves of it.** `source` is polymorphic, so a
   * bare `[source][equals]=7` throws `Not supported` server-side and
   * `[source][value][equals]=7` matches the **file** of that number as well.
   * Both fail at run time only, because `Where` is loosely typed.
   */
  it('names the locale, and filters on the meditation as its own target', () => {
    const url = transcriptUrl(7, 'fr')

    expect(url).toContain('locale=fr')
    expect(url).toContain(`where${encodeURIComponent('[source][equals][relationTo]')}=meditations`)
    expect(url).toContain(`where${encodeURIComponent('[source][equals][value]')}=7`)
    expect(url).not.toContain(encodeURIComponent('[source][value]'))
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

/**
 * The fourth and fifth sites (#1016). The locale is a permission here as well,
 * and one thing more: it decides which language the cues are transcribed in and
 * recorded as, so a request naming none would write English cues into whatever
 * locale the admin was editing.
 */
describe('introSubtitlesUrl', () => {
  it('names the locale, because the endpoint gates on it', () => {
    expect(introSubtitlesUrl(7, 'fr')).toBe('/api/files/7/subtitles?locale=fr')
  })

  it('encodes the locale', () => {
    expect(introSubtitlesUrl(7, 'pt-BR')).toBe('/api/files/7/subtitles?locale=pt-BR')
  })

  it('refuses to build a URL with no locale', () => {
    expect(introSubtitlesUrl(7, undefined)).toBeNull()
    expect(introSubtitlesUrl(7, '')).toBeNull()
  })

  it('refuses to build a URL with no file', () => {
    expect(introSubtitlesUrl(undefined, 'fr')).toBeNull()
    expect(introSubtitlesUrl(null, 'fr')).toBeNull()
  })
})

describe('introAudioFilenameUrl', () => {
  it('names the locale, and asks for the filename alone', () => {
    const url = introAudioFilenameUrl(7, 'fr')

    expect(url).toContain('/api/files/7?')
    expect(url).toContain('locale=fr')
    expect(url).toContain(`select${encodeURIComponent('[filename]')}=true`)
  })

  it('refuses to build a URL with no locale or no file', () => {
    expect(introAudioFilenameUrl(7, undefined)).toBeNull()
    expect(introAudioFilenameUrl(undefined, 'fr')).toBeNull()
  })
})

describe('transcribeUrl', () => {
  it('names the locale, because the endpoint gates on it', () => {
    expect(transcribeUrl(7, 'fr')).toBe('/api/meditations/7/transcribe?locale=fr')
  })

  it('encodes the locale', () => {
    expect(transcribeUrl(7, 'pt-BR')).toBe('/api/meditations/7/transcribe?locale=pt-BR')
  })

  it('refuses to build a URL with no locale', () => {
    expect(transcribeUrl(7, undefined)).toBeNull()
    expect(transcribeUrl(7, '')).toBeNull()
  })

  it('refuses to build a URL with no meditation', () => {
    expect(transcribeUrl(undefined, 'fr')).toBeNull()
  })
})
