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
})
