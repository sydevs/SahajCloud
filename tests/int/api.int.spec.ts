import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('API', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  it('fetches tags', async () => {
    // Create a test user first
    await testData.createTag(payload, {
      title: 'happiness',
    })

    const tags = await payload.find({
      collection: 'tags'
    })
    expect(tags).toBeDefined()
    expect(tags.docs).toHaveLength(1)
    expect(tags.docs[0].title).toBe('happiness')
  })
})
