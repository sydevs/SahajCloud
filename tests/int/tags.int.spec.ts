import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Tag } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('Tags Collection', () => {
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

  it('creates a tag with title', async () => {
    const tag = await testData.createTag(payload, {
      title: 'Mindfulness',
    })

    expect(tag).toBeDefined()
    expect(tag.title).toBe('Mindfulness')
    expect(tag.id).toBeDefined()
  })

  it('requires title field', async () => {
    await expect(
      payload.create({
        collection: 'tags',
        data: {} as any,
      })
    ).rejects.toThrow()
  })

  it('finds tags', async () => {
    const tag1 = await testData.createTag(payload, { title: 'Relaxation' })
    const tag2 = await testData.createTag(payload, { title: 'Focus' })

    const result = await payload.find({
      collection: 'tags',
      where: {
        id: {
          in: [tag1.id, tag2.id],
        },
      },
    })

    expect(result.docs).toHaveLength(2)
    expect(result.totalDocs).toBe(2)
  })

  it('updates a tag', async () => {
    const tag = await testData.createTag(payload, { title: 'Original Title' })

    const updated = await payload.update({
      collection: 'tags',
      id: tag.id,
      data: {
        title: 'Updated Title',
      },
    }) as Tag

    expect(updated.title).toBe('Updated Title')
  })

  it('deletes a tag', async () => {
    const tag = await testData.createTag(payload, { title: 'To Delete' })

    await payload.delete({
      collection: 'tags',
      id: tag.id,
    })

    const result = await payload.find({
      collection: 'tags',
      where: {
        id: {
          equals: tag.id,
        },
      },
    })

    expect(result.docs).toHaveLength(0)
  })

  it('demonstrates complete isolation - no data leakage', async () => {
    // Create a tag in this test
    const tag = await testData.createTag(payload, { title: 'Isolation Test Tag' })

    // Query all tags
    const allTags = await payload.find({
      collection: 'tags',
    })

    // Should only see tags created in this test file
    expect(allTags.docs.length).toBeGreaterThan(0)
    
    // Each test suite gets a fresh database
    const isolationTestTags = allTags.docs.filter(t => t.title === 'Isolation Test Tag')
    expect(isolationTestTags).toHaveLength(1)
    expect(isolationTestTags[0].id).toBe(tag.id)
  })
})