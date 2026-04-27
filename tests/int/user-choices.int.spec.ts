import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { UserChoice } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('UserChoices Collection - Metadata Fields', () => {
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

  describe('isFeatured field', () => {
    it('defaults to false', async () => {
      const tag = await testData.createUserChoice(payload)
      expect(tag.isFeatured).toBe(false)
    })

    it('can be set to true', async () => {
      const tag = await testData.createUserChoice(payload, {
        isFeatured: true,
      })
      expect(tag.isFeatured).toBe(true)
    })
  })

  describe('parent-child relationships', () => {
    let parentTag: UserChoice
    let childTag1: UserChoice
    let childTag2: UserChoice

    beforeAll(async () => {
      parentTag = await testData.createUserChoice(payload, {
        title: 'Not Feeling Well',
      })

      childTag1 = await testData.createUserChoice(payload, {
        title: 'Stressed',
        parent: parentTag.id,
      })

      childTag2 = await testData.createUserChoice(payload, {
        title: 'Anxious',
        parent: parentTag.id,
      })
    })

    it('creates parent-child relationship', async () => {
      const child = await payload.findByID({
        collection: 'user-choices',
        id: childTag1.id,
        depth: 0,
      })
      expect(child.parent).toBe(parentTag.id)
    })

    it('shows children via join field', async () => {
      const parent = await payload.findByID({
        collection: 'user-choices',
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
        collection: 'user-choices',
        id: childTag1.id,
        depth: 0,
      })
      const children = child.children as { docs: { id: number }[] }
      expect(children.docs).toHaveLength(0)
    })

    it('standalone tag has no parent', async () => {
      const standalone = await testData.createUserChoice(payload)
      expect(standalone.parent).toBeFalsy()
    })

    it('standalone tag has no children', async () => {
      const standalone = await testData.createUserChoice(payload)
      const fetched = await payload.findByID({
        collection: 'user-choices',
        id: standalone.id,
        depth: 0,
      })
      const children = fetched.children as { docs: { id: number }[] }
      expect(children.docs).toHaveLength(0)
    })

    it('rejects multi-level nesting: child cannot be a parent', async () => {
      await expect(
        testData.createUserChoice(payload, {
          title: 'Grandchild',
          parent: childTag1.id,
        }),
      ).rejects.toThrow()
    })

    it('rejects setting parent on a tag that already has children', async () => {
      const anotherTag = await testData.createUserChoice(payload, {
        title: 'Another Tag',
      })

      await expect(
        payload.update({
          collection: 'user-choices',
          id: parentTag.id,
          data: { parent: anotherTag.id },
        }),
      ).rejects.toThrow()
    })
  })

  describe('isParent maintenance', () => {
    it('sets isParent to true when child is created', async () => {
      const parent = await testData.createUserChoice(payload, {
        title: 'IsParent Test Parent',
      })
      expect(parent.isParent).toBe(false)

      await testData.createUserChoice(payload, {
        title: 'IsParent Test Child',
        parent: parent.id,
      })

      const updated = await payload.findByID({
        collection: 'user-choices',
        id: parent.id,
        depth: 0,
      })
      expect(updated.isParent).toBe(true)
    })

    it('clears isParent when last child is deleted', async () => {
      const parent = await testData.createUserChoice(payload, {
        title: 'Delete Test Parent',
      })

      const child = await testData.createUserChoice(payload, {
        title: 'Delete Test Child',
        parent: parent.id,
      })

      // Verify parent has isParent set
      const beforeDelete = await payload.findByID({
        collection: 'user-choices',
        id: parent.id,
        depth: 0,
      })
      expect(beforeDelete.isParent).toBe(true)

      // Delete the child
      await payload.delete({
        collection: 'user-choices',
        id: child.id,
      })

      // Verify isParent is cleared
      const afterDelete = await payload.findByID({
        collection: 'user-choices',
        id: parent.id,
        depth: 0,
      })
      expect(afterDelete.isParent).toBe(false)
    })

    it('preserves isParent when other children remain', async () => {
      const parent = await testData.createUserChoice(payload, {
        title: 'Preserve Test Parent',
      })

      const child1 = await testData.createUserChoice(payload, {
        title: 'Preserve Test Child 1',
        parent: parent.id,
      })

      await testData.createUserChoice(payload, {
        title: 'Preserve Test Child 2',
        parent: parent.id,
      })

      // Delete one child
      await payload.delete({
        collection: 'user-choices',
        id: child1.id,
      })

      // Verify isParent is still true (other child remains)
      const afterDelete = await payload.findByID({
        collection: 'user-choices',
        id: parent.id,
        depth: 0,
      })
      expect(afterDelete.isParent).toBe(true)
    })

    it('clears isParent when child parent is removed', async () => {
      const parent = await testData.createUserChoice(payload, {
        title: 'Remove Parent Test',
      })

      const child = await testData.createUserChoice(payload, {
        title: 'Remove Parent Child',
        parent: parent.id,
      })

      // Verify parent has isParent set
      const beforeUpdate = await payload.findByID({
        collection: 'user-choices',
        id: parent.id,
        depth: 0,
      })
      expect(beforeUpdate.isParent).toBe(true)

      // Remove parent from child
      await payload.update({
        collection: 'user-choices',
        id: child.id,
        data: { parent: null },
      })

      // Verify isParent is cleared
      const afterUpdate = await payload.findByID({
        collection: 'user-choices',
        id: parent.id,
        depth: 0,
      })
      expect(afterUpdate.isParent).toBe(false)
    })
  })

  describe('API filtering', () => {
    it('filters out parent tags with where[isParent][not_equals]=true', async () => {
      const parent = await testData.createUserChoice(payload, {
        title: 'API Filter Parent',
      })

      const child = await testData.createUserChoice(payload, {
        title: 'API Filter Child',
        parent: parent.id,
      })

      const standalone = await testData.createUserChoice(payload, {
        title: 'API Filter Standalone',
      })

      const result = await payload.find({
        collection: 'user-choices',
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
      const parentTag = await testData.createUserChoice(payload, {
        title: 'Parent With Metadata',
        isFeatured: true,
      })

      const childTag = await testData.createUserChoice(payload, {
        title: 'Child With Metadata',
        isFeatured: false,
        parent: parentTag.id,
      })

      expect(parentTag.isFeatured).toBe(true)

      expect(childTag.isFeatured).toBe(false)
      // parent is auto-populated on create, extract ID for comparison
      const childParentId =
        typeof childTag.parent === 'object' && childTag.parent !== null
          ? childTag.parent.id
          : childTag.parent
      expect(childParentId).toBe(parentTag.id)
    })
  })

  describe('timings field', () => {
    it('defaults to empty array', async () => {
      const tag = await testData.createUserChoice(payload)
      expect(tag.timings).toEqual([])
    })

    it('can be set with multiple timings', async () => {
      const tag = await testData.createUserChoice(payload, {
        timings: ['morning', 'evening'],
      })
      expect(tag.timings).toEqual(expect.arrayContaining(['morning', 'evening']))
      expect(tag.timings).toHaveLength(2)
    })
  })

  describe('per-timing meditation assignments', () => {
    let tag: UserChoice
    let quickMeditation: { id: number }

    beforeAll(async () => {
      quickMeditation = await testData.createMeditation(payload, undefined, {
        type: 'quick',
        title: 'Quick Timing Test',
      })
      tag = await testData.createUserChoice(payload, {
        title: 'Timing Assignment Tag',
        timings: ['morning', 'afternoon'],
      })
    })

    it('assigns a meditation to morningMeditation (localized)', async () => {
      const updated = await payload.update({
        collection: 'user-choices',
        id: tag.id,
        locale: 'en',
        data: { morningMeditation: quickMeditation.id },
      })

      const morningId =
        typeof updated.morningMeditation === 'object' && updated.morningMeditation !== null
          ? updated.morningMeditation.id
          : updated.morningMeditation
      expect(morningId).toBe(quickMeditation.id)
    })

    it('supports different meditations per locale', async () => {
      const czechMeditation = await testData.createMeditation(payload, undefined, {
        type: 'quick',
        title: 'Czech Quick',
        locale: 'cs',
      })

      await payload.update({
        collection: 'user-choices',
        id: tag.id,
        locale: 'cs',
        data: { title: 'Testovací Tag', morningMeditation: czechMeditation.id },
      })

      // Verify English assignment is preserved
      const enResult = await payload.findByID({
        collection: 'user-choices',
        id: tag.id,
        locale: 'en',
        depth: 0,
      })
      expect(enResult.morningMeditation).toBe(quickMeditation.id)

      // Verify Czech assignment
      const csResult = await payload.findByID({
        collection: 'user-choices',
        id: tag.id,
        locale: 'cs',
        depth: 0,
      })
      expect(csResult.morningMeditation).toBe(czechMeditation.id)
    })

    it('populates meditation at depth=1', async () => {
      const result = await payload.findByID({
        collection: 'user-choices',
        id: tag.id,
        locale: 'en',
        depth: 1,
      })

      expect(result.morningMeditation).toBeDefined()
      const meditation = result.morningMeditation as { id: number; title: string | null }
      expect(meditation.id).toBe(quickMeditation.id)
      expect(meditation.title).toBe('Quick Timing Test')
    })
  })

  describe('mood vs goal type', () => {
    // Verifies the optional-fields-when-goal contract added with the rename.
    // mood-type behaviour stays covered by the suites above (createUserChoice
    // defaults to mood via the `defaultValue: 'mood'` on the field).
    it('defaults to mood when type is omitted', async () => {
      const choice = await testData.createUserChoice(payload, {
        title: 'Default-type Choice',
      })
      expect(choice.type).toBe('mood')
    })

    it('allows creating a goal-type choice without timings or per-timing meditation rels', async () => {
      const choice = await testData.createUserChoice(payload, {
        title: 'Sleep Better',
        type: 'goal',
      })
      expect(choice.type).toBe('goal')
      // Goal-type choices intentionally skip the mood-only fields server-side.
      expect(choice.timings ?? []).toEqual([])
      expect(choice.morningMeditation ?? null).toBeNull()
      expect(choice.afternoonMeditation ?? null).toBeNull()
      expect(choice.eveningMeditation ?? null).toBeNull()
      expect(choice.nightMeditation ?? null).toBeNull()
    })
  })
})
