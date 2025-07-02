import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterEach, expect } from 'vitest'
import type { Narrator } from '@/payload-types'

let payload: Payload

describe('Narrators Collection', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  afterEach(async () => {
    await payload.delete({
      collection: 'narrators',
      where: {},
    })
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
    await payload.create({
      collection: 'narrators',
      data: {
        name: 'Test Narrator 1',
        gender: 'male',
      },
    })

    await payload.create({
      collection: 'narrators',
      data: {
        name: 'Test Narrator 2',
        gender: 'female',
      },
    })

    const result = await payload.find({
      collection: 'narrators',
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
    await payload.create({
      collection: 'narrators',
      data: {
        name: 'Find By Slug',
        gender: 'male',
      },
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
  })

  it('deletes a narrator', async () => {
    const narrator = await payload.create({
      collection: 'narrators',
      data: {
        name: 'To Delete',
        gender: 'female',
      },
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

    await expect(
      payload.create({
        collection: 'narrators',
        data: {
          name: 'Another Name',
          slug: 'duplicate-slug',
          gender: 'female',
        },
      })
    ).rejects.toThrow()
  })
})