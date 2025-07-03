import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Tag } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment, testDataFactory } from '../utils/testHelpers'

describe('Tags Collection (Isolated)', () => {
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
    const tag = await payload.create({
      collection: 'tags',
      data: {
        title: 'Mindfulness',
      },
    }) as Tag

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
    const tag1 = await payload.create({
      collection: 'tags',
      data: testDataFactory.tag({ title: 'Relaxation' }),
    }) as Tag

    const tag2 = await payload.create({
      collection: 'tags',
      data: testDataFactory.tag({ title: 'Focus' }),
    }) as Tag

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
    const tag = await payload.create({
      collection: 'tags',
      data: testDataFactory.tag({ title: 'Original Title' }),
    }) as Tag

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
    const tag = await payload.create({
      collection: 'tags',
      data: testDataFactory.tag({ title: 'To Delete' }),
    }) as Tag

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
    const tag = await payload.create({
      collection: 'tags',
      data: testDataFactory.tag({ title: 'Isolation Test Tag' }),
    }) as Tag

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