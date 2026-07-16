import { describe, expect, it } from 'vitest'

import { atlasLivePreview } from '@/lib/atlas/livePreview'

/**
 * #575 — the admin Live Preview iframe for the Atlas collections must load the
 * widget's /preview route with the collection, doc id, shared secret, and the
 * edited locale (so localized fields — e.g. the event title — preview in the
 * locale being edited).
 */
describe('atlasLivePreview', () => {
  // Not async itself — but `url`'s declared type may return a Promise, so call sites await.
  const buildUrl = (collection: 'events' | 'regions', id: number, localeCode: string) => {
    const { url } = atlasLivePreview(collection)
    if (typeof url !== 'function') throw new Error('expected livePreview.url to be a function')
    return url({ data: { id }, locale: { code: localeCode } } as Parameters<typeof url>[0])
  }

  it('builds the Atlas preview URL for events, carrying id, secret, and locale', async () => {
    expect(await buildUrl('events', 42, 'cs')).toBe(
      `${process.env.SAHAJATLAS_URL}/preview?collection=events&id=42&secret=${process.env.SAHAJCLOUD_PREVIEW_SECRET}&locale=cs`,
    )
  })

  it('builds the Atlas preview URL for regions', async () => {
    expect(await buildUrl('regions', 7, 'en')).toBe(
      `${process.env.SAHAJATLAS_URL}/preview?collection=regions&id=7&secret=${process.env.SAHAJCLOUD_PREVIEW_SECRET}&locale=en`,
    )
  })

  it('offers a phone-sized breakpoint for the widget drawer layout', () => {
    expect(atlasLivePreview('events').breakpoints).toEqual([
      { label: 'Mobile', name: 'mobile', width: 390, height: 844 },
    ])
  })
})
