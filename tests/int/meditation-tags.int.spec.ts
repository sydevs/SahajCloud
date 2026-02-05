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

    it('rejects a tag with no timings', async () => {
      await expect(
        testData.createMeditationTag(payload, {
          timings: [] as unknown as MeditationTag['timings'],
        }),
      ).rejects.toThrow()
    })
  })

  describe('isFeatured field', () => {
    it('defaults to false', async () => {
      const tag = await testData.createMeditationTag(payload)
      expect(tag.isFeatured).toBe(false)
    })

    it('can be set to true', async () => {
      const tag = await testData.createMeditationTag(payload, {
        isFeatured: true,
      })
      expect(tag.isFeatured).toBe(true)
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
      const children = parent.children as { docs: (number | { id: number })[] }
      expect(children.docs).toHaveLength(2)
      // At depth: 0, join field returns IDs directly (numbers)
      const childIds = children.docs.map((c) => (typeof c === 'number' ? c : c.id))
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

    it('rejects multi-level nesting: child cannot be a parent', async () => {
      await expect(
        testData.createMeditationTag(payload, {
          title: 'Grandchild',
          parent: childTag1.id,
        }),
      ).rejects.toThrow()
    })

    it('rejects setting parent on a tag that already has children', async () => {
      const anotherTag = await testData.createMeditationTag(payload, {
        title: 'Another Tag',
      })

      await expect(
        payload.update({
          collection: 'meditation-tags',
          id: parentTag.id,
          data: { parent: anotherTag.id },
        }),
      ).rejects.toThrow()
    })
  })

  describe('isParent maintenance', () => {
    it('sets isParent to true when child is created', async () => {
      const parent = await testData.createMeditationTag(payload, {
        title: 'IsParent Test Parent',
      })
      expect(parent.isParent).toBe(false)

      await testData.createMeditationTag(payload, {
        title: 'IsParent Test Child',
        parent: parent.id,
      })

      const updated = await payload.findByID({
        collection: 'meditation-tags',
        id: parent.id,
        depth: 0,
      })
      expect(updated.isParent).toBe(true)
    })

    it('clears isParent when last child is deleted', async () => {
      const parent = await testData.createMeditationTag(payload, {
        title: 'Delete Test Parent',
      })

      const child = await testData.createMeditationTag(payload, {
        title: 'Delete Test Child',
        parent: parent.id,
      })

      // Verify parent has isParent set
      const beforeDelete = await payload.findByID({
        collection: 'meditation-tags',
        id: parent.id,
        depth: 0,
      })
      expect(beforeDelete.isParent).toBe(true)

      // Delete the child
      await payload.delete({
        collection: 'meditation-tags',
        id: child.id,
      })

      // Verify isParent is cleared
      const afterDelete = await payload.findByID({
        collection: 'meditation-tags',
        id: parent.id,
        depth: 0,
      })
      expect(afterDelete.isParent).toBe(false)
    })

    it('preserves isParent when other children remain', async () => {
      const parent = await testData.createMeditationTag(payload, {
        title: 'Preserve Test Parent',
      })

      const child1 = await testData.createMeditationTag(payload, {
        title: 'Preserve Test Child 1',
        parent: parent.id,
      })

      await testData.createMeditationTag(payload, {
        title: 'Preserve Test Child 2',
        parent: parent.id,
      })

      // Delete one child
      await payload.delete({
        collection: 'meditation-tags',
        id: child1.id,
      })

      // Verify isParent is still true (other child remains)
      const afterDelete = await payload.findByID({
        collection: 'meditation-tags',
        id: parent.id,
        depth: 0,
      })
      expect(afterDelete.isParent).toBe(true)
    })

    it('clears isParent when child parent is removed', async () => {
      const parent = await testData.createMeditationTag(payload, {
        title: 'Remove Parent Test',
      })

      const child = await testData.createMeditationTag(payload, {
        title: 'Remove Parent Child',
        parent: parent.id,
      })

      // Verify parent has isParent set
      const beforeUpdate = await payload.findByID({
        collection: 'meditation-tags',
        id: parent.id,
        depth: 0,
      })
      expect(beforeUpdate.isParent).toBe(true)

      // Remove parent from child
      await payload.update({
        collection: 'meditation-tags',
        id: child.id,
        data: { parent: null },
      })

      // Verify isParent is cleared
      const afterUpdate = await payload.findByID({
        collection: 'meditation-tags',
        id: parent.id,
        depth: 0,
      })
      expect(afterUpdate.isParent).toBe(false)
    })
  })

  describe('API filtering', () => {
    it('filters out parent tags with where[isParent][not_equals]=true', async () => {
      const parent = await testData.createMeditationTag(payload, {
        title: 'API Filter Parent',
      })

      const child = await testData.createMeditationTag(payload, {
        title: 'API Filter Child',
        parent: parent.id,
      })

      const standalone = await testData.createMeditationTag(payload, {
        title: 'API Filter Standalone',
      })

      const result = await payload.find({
        collection: 'meditation-tags',
        where: { isParent: { not_equals: true } },
        depth: 0,
      })

      const ids = result.docs.map((doc) => doc.id)
      expect(ids).toContain(child.id)
      expect(ids).toContain(standalone.id)
      expect(ids).not.toContain(parent.id)
    })
  })

  describe('combined metadata', () => {
    it('creates a tag with all metadata fields', async () => {
      const parentTag = await testData.createMeditationTag(payload, {
        title: 'Parent With Metadata',
        isFeatured: true,
        timings: ['morning', 'afternoon'],
      })

      const childTag = await testData.createMeditationTag(payload, {
        title: 'Child With Metadata',
        isFeatured: false,
        timings: ['evening'],
        parent: parentTag.id,
      })

      expect(parentTag.isFeatured).toBe(true)
      expect(parentTag.timings).toEqual(['morning', 'afternoon'])

      expect(childTag.isFeatured).toBe(false)
      expect(childTag.timings).toEqual(['evening'])
      // parent is auto-populated on create, extract ID for comparison
      const childParentId =
        typeof childTag.parent === 'object' && childTag.parent !== null
          ? childTag.parent.id
          : childTag.parent
      expect(childParentId).toBe(parentTag.id)
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
