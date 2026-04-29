/**
 * Videos collection custom-behavior tests.
 *
 * Basic CRUD, file-upload mechanics, and required-field validation are
 * covered by collections-smoke. This file holds tests for project-specific
 * behavior: the `previewUrl` virtual field and the inline tag enum field.
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
