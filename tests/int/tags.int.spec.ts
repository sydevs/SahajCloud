import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterEach, expect } from 'vitest'
import type { Tag, Meditation, Narrator, Media } from '@/payload-types'

let payload: Payload

describe('Tags Collection', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  afterEach(async () => {
    // Clean up tags created in specific tests (avoid affecting join test)
    await payload.delete({
      collection: 'tags',
      where: {
        title: {
          in: ['Test Tag', 'Focus', 'Original Title', 'Updated Title', 'To Delete'],
        },
      },
    })
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
      data: {
        title: 'Relaxation',
      },
    }) as Tag

    const tag2 = await payload.create({
      collection: 'tags',
      data: {
        title: 'Focus',
      },
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
      data: {
        title: 'Original Title',
      },
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
      data: {
        title: 'To Delete',
      },
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

})