/**
 * Videos collection custom-behavior tests.
 *
 * Basic CRUD, file-upload mechanics, and required-field validation are
 * covered by collections-smoke. This file holds tests for project-specific
 * behavior: the `previewUrl` virtual field and the inline tag enum field.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Video } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Videos Collection — custom behavior', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  it('configures `previewUrl` as a virtual field', async () => {
    const config = payload.collections['videos'].config
    const previewUrlField = config.fields.find((f) => 'name' in f && f.name === 'previewUrl')

    expect(previewUrlField).toBeDefined()
    expect(previewUrlField).toHaveProperty('virtual', true)
    // Without Cloudflare Stream the field returns undefined and is omitted
    // from API responses. The virtual flag itself is what we care about.
  })

  it('accepts inline tag enum values', async () => {
    const tagged = await testData.createVideo(payload, {
      title: 'Tagged Video',
      tags: 'workshop',
    })

    expect(tagged.tags).toBe('workshop')
  })

  describe('subtitles validator wiring (#317)', () => {
    it('accepts well-formed subtitles', async () => {
      const valid = [{ startTimeMs: 0, endTimeMs: 1000, durationMs: 1000, content: 'Hello' }]
      const video = await testData.createVideo(payload, {
        title: 'Valid Subs Video',
        subtitles: valid,
      })

      expect(video.subtitles).toEqual(valid)
    })

    it('rejects malformed subtitles via the field validator', async () => {
      // Guards against a future regression where someone removes
      // `validate: validateSubtitles` from the field config — the unit
      // suite would still pass, but the wiring would be silently broken.
      await expect(
        testData.createVideo(payload, {
          title: 'Invalid Subs Video',
          // Deliberately malformed — the case asserts the field validator
          // rejects it, so it cannot be typed as a valid row.
          subtitles: [{ startTimeMs: 'oops', endTimeMs: 1000, content: 'x' }] as unknown as Video['subtitles'],
        }),
      ).rejects.toThrow(/subtitles|startTimeMs/i)
    })
  })

  describe('admin media URL wiring (#455)', () => {
    // Videos live in Cloudflare Stream, not on the Worker filesystem. The admin
    // edit view renders `thumbnailURL || url` as an <img>. If either resolves to
    // Payload's default `/api/videos/file/<id>` route, that request 500s in
    // production. Both must resolve to Cloudflare instead.

    it('overrides `url` with a virtual field (Stream HLS, not the file route)', () => {
      const urlField = payload.collections['videos'].config.fields.find(
        (f) => 'name' in f && f.name === 'url',
      )

      expect(urlField).toBeDefined()
      // Payload's base `url` field is not virtual. mixedMediaUrlField's is. A
      // non-virtual `url` here means the override was dropped and the file-route
      // 500 has returned.
      expect(urlField).toHaveProperty('virtual', true)
    })

    it('wires `adminThumbnail` to the Stream poster and guards a missing UID', () => {
      const { upload } = payload.collections['videos'].config
      const adminThumbnail = typeof upload === 'object' ? upload.adminThumbnail : undefined

      expect(typeof adminThumbnail).toBe('function')

      // A doc without a Stream UID must yield null — never a file-route URL that
      // would 500. The populated-UID path builds the Stream thumbnail URL via
      // getCloudflareStreamThumbnailUrl (covered in storage-utils.int.spec.ts).
      const fn = adminThumbnail as (args: { doc: Record<string, unknown> }) => string | null
      expect(fn({ doc: {} })).toBeNull()
      expect(fn({ doc: { filename: 123 } })).toBeNull()
    })
  })
})
