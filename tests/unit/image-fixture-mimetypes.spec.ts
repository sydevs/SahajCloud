import { describe, expect, it } from 'vitest'

import { Images } from '@/collections/Images/Images'

import { IMAGE_MIMETYPES } from '../utils/testData'

/**
 * Payload sniffs the bytes and replaces the declared content type before the
 * collection sees it, so no upload can catch a fixture claiming a type the
 * collection refuses.
 */
describe('image fixture mimetypes', () => {
  it('claims only content types the collection accepts', () => {
    const upload = Images.upload
    const allowed = typeof upload === 'object' ? (upload.mimeTypes ?? []) : []

    expect(allowed.length).toBeGreaterThan(0)
    for (const [extension, mimetype] of Object.entries(IMAGE_MIMETYPES)) {
      expect(allowed, `${extension} claims ${mimetype}`).toContain(mimetype)
    }
  })
})
