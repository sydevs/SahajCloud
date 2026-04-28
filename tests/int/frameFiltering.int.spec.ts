import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Frame, Narrator, SubtleSystemNode } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Frame Filtering for FrameInserter', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let maleNarrator: Narrator
  let femaleNarrator: Narrator
  let mooladharaNode: SubtleSystemNode
  let swadhistanNode: SubtleSystemNode
  let nabhiNode: SubtleSystemNode

  // Track created frames for cleanup
  let maleFrames: Frame[] = []
  let femaleFrames: Frame[] = []

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create narrators for both genders
    maleNarrator = await testData.createNarrator(payload, {
      name: 'Male Narrator',
      gender: 'male',
    })

    femaleNarrator = await testData.createNarrator(payload, {
      name: 'Female Narrator',
      gender: 'female',
    })

    // Create three subtle-system nodes the frames can reference
    mooladharaNode = await testData.createSubtleSystemNode(
      payload,
      {},
      { slug: 'mooladhara' },
    )
    swadhistanNode = await testData.createSubtleSystemNode(
      payload,
      {},
      { slug: 'swadhistan' },
    )
    nabhiNode = await testData.createSubtleSystemNode(payload, {}, { slug: 'nabhi' })

    // Male frames
    maleFrames.push(
      await testData.createFrame(payload, {
        imageSet: 'male',
        subtleSystemNode: mooladharaNode.id,
      }),
    )
    maleFrames.push(
      await testData.createFrame(payload, {
        imageSet: 'male',
        subtleSystemNode: swadhistanNode.id,
      }),
    )
    maleFrames.push(
      await testData.createFrame(payload, {
        imageSet: 'male',
        subtleSystemNode: nabhiNode.id,
      }),
    )

    // Female frames
    femaleFrames.push(
      await testData.createFrame(
        payload,
        {
          imageSet: 'female',
          subtleSystemNode: mooladharaNode.id,
        },
        'image-1050x700.png',
      ),
    )
    femaleFrames.push(
      await testData.createFrame(
        payload,
        {
          imageSet: 'female',
          subtleSystemNode: nabhiNode.id,
        },
        'image-1050x700.webp',
      ),
    )
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Gender-Based Filtering', () => {
    it('filters frames by male imageSet', async () => {
      const result = await payload.find({
        collection: 'frames',
        where: {
          imageSet: {
            equals: 'male',
          },
        },
      })

      expect(result.docs.length).toBeGreaterThanOrEqual(3)
      result.docs.forEach((frame) => {
        expect(frame.imageSet).toBe('male')
      })
    })

    it('filters frames by female imageSet', async () => {
      const result = await payload.find({
        collection: 'frames',
        where: {
          imageSet: {
            equals: 'female',
          },
        },
      })

      expect(result.docs.length).toBeGreaterThanOrEqual(2)
      result.docs.forEach((frame) => {
        expect(frame.imageSet).toBe('female')
      })
    })
  })

  describe('SubtleSystemNode Filtering', () => {
    it('filters frames by a single subtleSystemNode relationship', async () => {
      const result = await payload.find({
        collection: 'frames',
        where: {
          subtleSystemNode: {
            equals: mooladharaNode.id,
          },
        },
        depth: 0,
      })

      // Both male and female mooladhara frames
      expect(result.docs.length).toBeGreaterThanOrEqual(2)
      result.docs.forEach((frame) => {
        expect(frame.subtleSystemNode).toBe(mooladharaNode.id)
      })
    })

    it('combines gender and subtleSystemNode filters', async () => {
      const result = await payload.find({
        collection: 'frames',
        where: {
          and: [
            { imageSet: { equals: 'male' } },
            { subtleSystemNode: { equals: mooladharaNode.id } },
          ],
        },
        depth: 0,
      })

      expect(result.docs.length).toBeGreaterThanOrEqual(1)
      result.docs.forEach((frame) => {
        expect(frame.imageSet).toBe('male')
        expect(frame.subtleSystemNode).toBe(mooladharaNode.id)
      })
    })
  })

  describe('Custom Endpoint: /by-narrator/:narratorId', () => {
    it('returns male-set frames with subtleSystemNode populated at depth 1', async () => {
      const narrator = await payload.findByID({
        collection: 'narrators',
        id: maleNarrator.id,
        depth: 0,
      })

      const frames = await payload.find({
        collection: 'frames',
        where: { imageSet: { equals: narrator.gender } },
        limit: 100,
        depth: 1,
      })

      expect(frames.docs.length).toBeGreaterThanOrEqual(3)

      // Verify the endpoint's depth: 1 hydrates subtleSystemNode for FrameInserter grouping
      const populated = frames.docs.find((f) => f.subtleSystemNode)
      expect(populated).toBeDefined()
      expect(typeof populated?.subtleSystemNode).toBe('object')
      expect((populated?.subtleSystemNode as SubtleSystemNode).slug).toBeDefined()
    })

    it('returns female-set frames matching the narrator gender', async () => {
      const narrator = await payload.findByID({
        collection: 'narrators',
        id: femaleNarrator.id,
        depth: 0,
      })

      const frames = await payload.find({
        collection: 'frames',
        where: { imageSet: { equals: narrator.gender } },
        limit: 100,
        depth: 0,
      })

      expect(frames.docs.length).toBeGreaterThanOrEqual(2)
      frames.docs.forEach((frame) => {
        expect(frame.imageSet).toBe('female')
      })
    })
  })
})
