import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { MeditationTag } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('MeditationTags Collection - Metadata Fields', () => {
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

  describe('timings field', () => {
    it('creates a tag with multiple timings', async () => {
      const tag = await testData.createMeditationTag(payload, {
        timings: ['morning', 'evening'],
      })
      expect(tag.timings).toEqual(['morning', 'evening'])
    })

    it('creates a tag with a single timing', async () => {
      const tag = await testData.createMeditationTag(payload, {
        timings: ['night'],
      })
      expect(tag.timings).toEqual(['night'])
    })

    it('creates a tag with all timings', async () => {
      const tag = await testData.createMeditationTag(payload, {
        timings: ['morning', 'afternoon', 'evening', 'night'],
      })
      expect(tag.timings).toEqual(['morning', 'afternoon', 'evening', 'night'])
    })

    it('creates a tag with no timings', async () => {
      const tag = await testData.createMeditationTag(payload)
      expect(tag.timings).toBeFalsy()
    })
  })

  describe('meditationType field', () => {
    it('creates a tag with general type', async () => {
      const tag = await testData.createMeditationTag(payload, {
        meditationType: 'general',
      })
      expect(tag.meditationType).toBe('general')
    })

    it('creates a tag with specific type', async () => {
      const tag = await testData.createMeditationTag(payload, {
        meditationType: 'specific',
      })
      expect(tag.meditationType).toBe('specific')
    })

    it('creates a tag with no meditationType (no default)', async () => {
      const tag = await testData.createMeditationTag(payload)
      expect(tag.meditationType).toBeFalsy()
    })
  })

  describe('parent-child relationships', () => {
    let parentTag: MeditationTag
    let childTag1: MeditationTag
    let childTag2: MeditationTag

    beforeAll(async () => {
      parentTag = await testData.createMeditationTag(payload, {
        title: 'Not Feeling Well',
      })

      childTag1 = await testData.createMeditationTag(payload, {
        title: 'Stressed',
        parent: parentTag.id,
      })

      childTag2 = await testData.createMeditationTag(payload, {
        title: 'Anxious',
        parent: parentTag.id,
      })
    })

    it('creates parent-child relationship', async () => {
      const child = await payload.findByID({
        collection: 'meditation-tags',
        id: childTag1.id,
        depth: 0,
      })
      expect(child.parent).toBe(parentTag.id)
    })

    it('shows children via join field', async () => {
      const parent = await payload.findByID({
        collection: 'meditation-tags',
        id: parentTag.id,
        depth: 0,
      })
      const children = parent.children as { docs: { id: number }[] }
      expect(children.docs).toHaveLength(2)
      const childIds = children.docs.map((c) => c.id)
      expect(childIds).toContain(childTag1.id)
      expect(childIds).toContain(childTag2.id)
    })

    it('child tags have no children', async () => {
      const child = await payload.findByID({
        collection: 'meditation-tags',
        id: childTag1.id,
        depth: 0,
      })
      const children = child.children as { docs: { id: number }[] }
      expect(children.docs).toHaveLength(0)
    })

    it('standalone tag has no parent', async () => {
      const standalone = await testData.createMeditationTag(payload)
      expect(standalone.parent).toBeFalsy()
    })

    it('standalone tag has no children', async () => {
      const standalone = await testData.createMeditationTag(payload)
      const fetched = await payload.findByID({
        collection: 'meditation-tags',
        id: standalone.id,
        depth: 0,
      })
      const children = fetched.children as { docs: { id: number }[] }
      expect(children.docs).toHaveLength(0)
    })
  })

  describe('combined metadata', () => {
    it('creates a tag with all metadata fields', async () => {
      const parentTag = await testData.createMeditationTag(payload, {
        title: 'Parent With Metadata',
        meditationType: 'general',
        timings: ['morning', 'afternoon'],
      })

      const childTag = await testData.createMeditationTag(payload, {
        title: 'Child With Metadata',
        meditationType: 'specific',
        timings: ['evening'],
        parent: parentTag.id,
      })

      expect(parentTag.meditationType).toBe('general')
      expect(parentTag.timings).toEqual(['morning', 'afternoon'])

      expect(childTag.meditationType).toBe('specific')
      expect(childTag.timings).toEqual(['evening'])
      expect(childTag.parent).toBe(parentTag.id)
    })
  })

  describe('meditation tagging with parent filtering', () => {
    it('meditations can be tagged with child and standalone tags', async () => {
      const parentTag = await testData.createMeditationTag(payload, {
        title: 'Filter Parent',
      })
      const childTag = await testData.createMeditationTag(payload, {
        title: 'Filter Child',
        parent: parentTag.id,
      })
      const standaloneTag = await testData.createMeditationTag(payload, {
        title: 'Filter Standalone',
      })

      const meditation = await testData.createMeditation(payload, undefined, {
        tags: [childTag.id, standaloneTag.id],
      })

      const tagIds = Array.isArray(meditation.tags)
        ? meditation.tags.map((tag) =>
            typeof tag === 'object' && tag !== null && 'id' in tag
              ? (tag as { id: number }).id
              : tag,
          )
        : []
      expect(tagIds).toContain(childTag.id)
      expect(tagIds).toContain(standaloneTag.id)
    })
  })
})
