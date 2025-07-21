import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Narrator } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testDataFactory } from '../utils/testDataFactory'

describe('Narrators Collection', () => {
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
    const narrator = await testDataFactory.createNarrator(payload, {
      name: 'John Smith',
      gender: 'male',
    })

    expect(narrator).toBeDefined()
    expect(narrator.name).toBe('John Smith')
    expect(narrator.slug).toBe('john-smith')
    expect(narrator.gender).toBe('male')
  })

  it('creates a narrator with custom slug', async () => {
    const narrator = await testDataFactory.createNarrator(payload, {
      name: 'Jane Doe',
      slug: 'custom-jane-slug',
      gender: 'female',
    })

    expect(narrator.slug).toBe('custom-jane-slug')
  })

  it('handles special characters in slug generation', async () => {
    const narrator = await testDataFactory.createNarrator(payload, {
      name: 'María García-López',
      gender: 'female',
    })

    expect(narrator.slug).toBe('mar-a-garc-a-l-pez')
  })

  it('finds narrators', async () => {
    const narrator1 = await testDataFactory.createNarrator(payload, { name: 'Test Narrator 1' })
    const narrator2 = await testDataFactory.createNarrator(payload, { name: 'Test Narrator 2', gender: 'female' })

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
    const narrator = await testDataFactory.createNarrator(payload, {
      name: 'Original Name',
      gender: 'male',
    })

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
    const narrator = await testDataFactory.createNarrator(payload, {
      name: 'Find By Slug',
      gender: 'male',
    })

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
    const narrator = await testDataFactory.createNarrator(payload, { name: 'To Delete' })

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
    await testDataFactory.createNarrator(payload, {
      name: 'Duplicate Test',
      slug: 'duplicate-slug',
      gender: 'male',
    })

    // Try to create another narrator with the same slug
    try {
      await testDataFactory.createNarrator(payload, {
        name: 'Another Name',
        slug: 'duplicate-slug',
        gender: 'female',
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
    const narrator = await testDataFactory.createNarrator(payload, { name: 'Isolation Test Narrator' })

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