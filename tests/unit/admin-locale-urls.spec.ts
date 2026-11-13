/**
 * The locale on a hand-rolled admin REST call is a permission, not a query
 * option (#701). The call sites that carry the fix build a URL or an SWR key
 * from `useLocale().code`, and only a browser can observe them end to end — so
 * the string each one builds is pinned here instead.
 *
 * The sibling integration specs prove the SERVER half: that `?locale=fr` is
 * accepted and its absence is refused. They cannot see whether a client sends
 * it. That is what these assertions cover.
 *
 * `fetchRelationshipDocs` is pinned in `relationshipDocLoader.spec.ts` against
 * a stubbed `fetch`.
 *
 * `submissionActionUrl` was one of them until #909 moved submission review onto
 * `WorkflowButtons`. Payload's own document form carries the locale in the
 * `action` it builds, so there is no hand-rolled URL left to pin.
 */

import { describe, expect, it } from 'vitest'

import { framesByNarratorKey } from '../../src/components/admin/FrameEditor/utils'
import {
  transcribeUrl,
  transcriptUrl,
} from '../../src/components/admin/TranscriptPanel/transcriptModel'
import { fileUrl } from '../../src/components/admin/TranscriptPanel/transcriptModel'

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
 * The Path Step preview's two reads and the file's transcribe (#1016): a file's
 * transcript is read and requested through the same builders as a meditation's,
 * so they carry the locale for the same reason.
 */
describe('the file transcript sites', () => {
  it('reads and posts under the file, naming the locale', () => {
    expect(transcriptUrl(7, 'fr', 'files')).toContain('locale=fr')
    expect(transcriptUrl(7, 'fr', 'files')).toContain(
      encodeURIComponent('where[source][equals][relationTo]') + '=files',
    )
    expect(transcribeUrl(7, 'fr', 'files')).toBe('/api/files/7/transcribe?locale=fr')
  })

  // The file's own row brings its spoken language, for the mismatch warning;
  // a meditation's would bring the whole document, so it populates nothing.
  it("populates a file's spoken language and nothing of a meditation", () => {
    const files = transcriptUrl(7, 'fr', 'files')!
    expect(files).toContain('depth=1')
    expect(files).toContain(encodeURIComponent('populate[files][spokenLanguage]') + '=true')
    expect(transcriptUrl(7, 'fr', 'meditations')).toContain('depth=0')
    expect(transcriptUrl(7, 'fr', 'meditations')).not.toContain('populate')
  })

  it('reads the file itself with the locale, and refuses without one', () => {
    expect(fileUrl(7, 'fr')).toContain('locale=fr')
    expect(fileUrl(7, undefined)).toBeNull()
    expect(fileUrl(null, 'fr')).toBeNull()
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
