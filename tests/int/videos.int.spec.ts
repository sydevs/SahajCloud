/**
 * Videos collection custom-behavior tests.
 *
 * Basic CRUD, file-upload mechanics, and required-field validation are
 * covered by collections-smoke. This file holds tests for project-specific
 * behavior: the virtual `url` and `previewUrl` fields, and the inline tag
 * enum field.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

  it('virtual `url` field falls back to PayloadCMS static URL in local mode', async () => {
    // In test environment (no Cloudflare Stream), url should resolve to the
    // local file route. This guards the virtualUrlField fallback logic.
    const video = await testData.createVideo(payload, { title: 'URL Test Video' })

    expect(video.url).toBeDefined()
    expect(video.url).toContain('/api/videos/file/')
  })

  it('virtual `mp4Url` field is populated alongside the deprecated `url` (#319)', async () => {
    const video = await testData.createVideo(payload, { title: 'mp4Url Test Video' })

    // mp4Url is the canonical replacement; url is the deprecated alias.
    // Both resolve to the same Cloudflare Stream MP4 URL (or the local
    // fallback in this test environment).
    expect(video.mp4Url).toBeDefined()
    expect(video.mp4Url).toBe(video.url)
  })

  it('virtual `hlsUrl` field is populated alongside the deprecated `streamUrl` (#319)', async () => {
    const video = await testData.createVideo(payload, { title: 'hlsUrl Test Video' })

    expect(video.hlsUrl).toBeDefined()
    expect(video.hlsUrl).toBe(video.streamUrl)
  })

  it('configures `previewUrl` as a virtual field', async () => {
    const config = payload.collections['videos'].config
    const previewUrlField = config.fields.find((f) => 'name' in f && f.name === 'previewUrl')

    expect(previewUrlField).toBeDefined()
    expect(previewUrlField).toHaveProperty('virtual', true)
    // Without Cloudflare Stream the field returns undefined and is omitted
    // from API responses; the virtual flag itself is what we care about.
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
      const valid = {
        captions: [{ duration: 1, content: 'Hello', startTime: '00:00:00.000' }],
      }
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
          subtitles: { captions: [{ duration: 'oops', content: 'x', startTime: '00:00:00' }] },
        }),
      ).rejects.toThrow(/subtitles|captions/i)
    })
  })
})
