import { describe, expect, it } from 'vitest'

import { Images } from '@/collections/Images/Images'

import { IMAGE_MIMETYPES } from '../utils/testData'

/**
 * `createMediaImage` claims a content type on the fixture's behalf, and an
 * integration spec cannot check it: Payload sniffs the bytes and replaces the
 * declared value before the collection or any hook sees it. So a fixture
 * claiming something the collection refuses would pass the whole lane while
 * describing a request no client makes.
 */
describe('image fixture mimetypes', () => {
  const upload = Images.upload
  const allowed = typeof upload === 'object' ? (upload.mimeTypes ?? []) : []

  it('claims only content types the collection accepts', () => {
    expect(allowed.length).toBeGreaterThan(0)
    for (const [extension, mimetype] of Object.entries(IMAGE_MIMETYPES)) {
      expect(allowed, `${extension} claims ${mimetype}`).toContain(mimetype)
    }
  })

  it('needs the map, because the derived SVG spelling is refused', () => {
    expect(IMAGE_MIMETYPES['.svg']).toBe('image/svg+xml')
    expect(allowed).not.toContain('image/svg')
  })
})
