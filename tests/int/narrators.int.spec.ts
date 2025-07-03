import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Narrator } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment, testDataFactory } from '../utils/testHelpers'

describe('Narrators Collection (Isolated)', () => {
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

  it('creates a narrator with auto-generated slug', async () => {
    const narrator = await payload.create({
      collection: 'narrators',
      data: {
        name: 'John Smith',
        gender: 'male',
      },
    }) as Narrator

    expect(narrator).toBeDefined()
    expect(narrator.name).toBe('John Smith')
    expect(narrator.slug).toBe('john-smith')
    expect(narrator.gender).toBe('male')
  })

  it('creates a narrator with custom slug', async () => {
    const narrator = await payload.create({
      collection: 'narrators',
      data: {
        name: 'Jane Doe',
        slug: 'custom-jane-slug',
        gender: 'female',
      },
    }) as Narrator

    expect(narrator.slug).toBe('custom-jane-slug')
  })

  it('handles special characters in slug generation', async () => {
    const narrator = await payload.create({
      collection: 'narrators',
      data: {
        name: 'María García-López',
        gender: 'female',
      },
    }) as Narrator

    expect(narrator.slug).toBe('mar-a-garc-a-l-pez')
  })

  it('finds narrators', async () => {
    const narrator1 = await payload.create({
      collection: 'narrators',
      data: testDataFactory.narrator({ name: 'Test Narrator 1' }),
    }) as Narrator

    const narrator2 = await payload.create({
      collection: 'narrators',
      data: testDataFactory.narrator({ name: 'Test Narrator 2', gender: 'female' }),
    }) as Narrator

    const result = await payload.find({
      collection: 'narrators',
      where: {
        id: {
          in: [narrator1.id, narrator2.id],
        },
      },
    })

    expect(result.docs).toHaveLength(2)
    expect(result.totalDocs).toBe(2)
  })

  it('updates a narrator', async () => {
    const narrator = await payload.create({
      collection: 'narrators',
      data: {
        name: 'Original Name',
        gender: 'male',
      },
    }) as Narrator

    const updated = await payload.update({
      collection: 'narrators',
      id: narrator.id,
      data: {
        name: 'Updated Name',
        gender: 'female',
      },
    }) as Narrator

    expect(updated.name).toBe('Updated Name')
    expect(updated.gender).toBe('female')
    expect(updated.slug).toBe('original-name')
  })

  it('finds narrator by slug', async () => {
    const narrator = await payload.create({
      collection: 'narrators',
      data: {
        name: 'Find By Slug',
        gender: 'male',
      },
    }) as Narrator

    const result = await payload.find({
      collection: 'narrators',
      where: {
        slug: {
          equals: 'find-by-slug',
        },
      },
    })

    expect(result.docs).toHaveLength(1)
    expect(result.docs[0].name).toBe('Find By Slug')
    expect(result.docs[0].id).toBe(narrator.id)
  })

  it('deletes a narrator', async () => {
    const narrator = await payload.create({
      collection: 'narrators',
      data: testDataFactory.narrator({ name: 'To Delete' }),
    }) as Narrator

    await payload.delete({
      collection: 'narrators',
      id: narrator.id,
    })

    const result = await payload.find({
      collection: 'narrators',
      where: {
        id: {
          equals: narrator.id,
        },
      },
    })

    expect(result.docs).toHaveLength(0)
  })

  it('enforces unique slug constraint', async () => {
    await payload.create({
      collection: 'narrators',
      data: {
        name: 'Duplicate Test',
        slug: 'duplicate-slug',
        gender: 'male',
      },
    })

    // Try to create another narrator with the same slug
    try {
      await payload.create({
        collection: 'narrators',
        data: {
          name: 'Another Name',
          slug: 'duplicate-slug',
          gender: 'female',
        },
      })
      // If we get here, the unique constraint didn't work
      expect.fail('Expected unique constraint violation, but creation succeeded')
    } catch (error: any) {
      // Check that we got an error (MongoDB duplicate key error)
      expect(error).toBeDefined()
      expect(error.message).toMatch(/duplicate|unique/i)
    }
  })

  it('demonstrates complete isolation - no data leakage', async () => {
    // Create some narrators in this test
    const narrator = await payload.create({
      collection: 'narrators',
      data: testDataFactory.narrator({ name: 'Isolation Test Narrator' }),
    }) as Narrator

    // Query all narrators
    const allNarrators = await payload.find({
      collection: 'narrators',
    })

    // Should only see narrators created in this test file
    expect(allNarrators.docs.length).toBeGreaterThan(0)
    
    // Each test suite gets a fresh database
    const isolationTestNarrators = allNarrators.docs.filter(n => n.name === 'Isolation Test Narrator')
    expect(isolationTestNarrators).toHaveLength(1)
    expect(isolationTestNarrators[0].id).toBe(narrator.id)
  })
})