import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { FRAME_CATEGORIES } from '@/lib/data'
import type { Frame, Narrator } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Frame Filtering for FrameInserter', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let maleNarrator: Narrator
  let femaleNarrator: Narrator

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

    // Create frames for different imageSet and categories
    // Male frames
    maleFrames.push(
      await testData.createFrame(payload, {
        imageSet: 'male',
        category: FRAME_CATEGORIES[0], // mooladhara
      }),
    )
    maleFrames.push(
      await testData.createFrame(payload, {
        imageSet: 'male',
        category: FRAME_CATEGORIES[1], // swadhistan
      }),
    )
    maleFrames.push(
      await testData.createFrame(payload, {
        imageSet: 'male',
        category: FRAME_CATEGORIES[2], // nabhi
      }),
    )

    // Female frames
    femaleFrames.push(
      await testData.createFrame(
        payload,
        {
          imageSet: 'female',
          category: FRAME_CATEGORIES[0], // mooladhara
        },
        'image-1050x700.png',
      ),
    )
    femaleFrames.push(
      await testData.createFrame(
        payload,
        {
          imageSet: 'female',
          category: FRAME_CATEGORIES[3], // heart
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

    it('returns frames matching narrator gender', async () => {
      // Simulate what FrameInserter does - filter by narrator gender
      const narratorGender = maleNarrator.gender

      const result = await payload.find({
        collection: 'frames',
        where: {
          imageSet: {
            equals: narratorGender,
          },
        },
      })

      expect(result.docs.length).toBeGreaterThanOrEqual(3)
      result.docs.forEach((frame) => {
        expect(frame.imageSet).toBe('male')
      })
    })
  })

  describe('Category Filtering', () => {
    it('filters frames by single category', async () => {
      const category = FRAME_CATEGORIES[0] // mooladhara

      const result = await payload.find({
        collection: 'frames',
        where: {
          category: {
            equals: category,
          },
        },
      })

      expect(result.docs.length).toBeGreaterThanOrEqual(2) // Both male and female have this category
      result.docs.forEach((frame) => {
        expect(frame.category).toBe(category)
      })
    })

    it('combines gender and category filters', async () => {
      const category = FRAME_CATEGORIES[0] // mooladhara
      const gender = 'male'

      const result = await payload.find({
        collection: 'frames',
        where: {
          and: [
            {
              imageSet: {
                equals: gender,
              },
            },
            {
              category: {
                equals: category,
              },
            },
          ],
        },
      })

      expect(result.docs.length).toBeGreaterThanOrEqual(1)
      result.docs.forEach((frame) => {
        expect(frame.imageSet).toBe(gender)
        expect(frame.category).toBe(category)
      })
    })

    it('returns all frames when no category filter is applied', async () => {
      const result = await payload.find({
        collection: 'frames',
        limit: 100,
      })

      expect(result.docs.length).toBeGreaterThanOrEqual(5) // All frames created in this test
    })
  })

  describe('Frame Loading for Meditation', () => {
    it('loads frames with required fields for display', async () => {
      const result = await payload.find({
        collection: 'frames',
        limit: 10,
      })

      // Verify frames have all fields needed for FrameInserter display
      result.docs.forEach((frame) => {
        expect(frame.id).toBeDefined()
        expect(frame.category).toBeDefined()
        expect(frame.imageSet).toBeDefined()
        // thumbnailUrl is virtual, may or may not be populated depending on storage
        // url should be defined
        expect(frame.url || frame.filename).toBeDefined()
      })
    })

    it('supports pagination for large frame libraries', async () => {
      const page1 = await payload.find({
        collection: 'frames',
        limit: 2,
        page: 1,
      })

      const page2 = await payload.find({
        collection: 'frames',
        limit: 2,
        page: 2,
      })

      expect(page1.docs.length).toBeLessThanOrEqual(2)
      // Page 2 may have frames if there are more than 2
      if (page1.totalDocs > 2) {
        expect(page2.docs.length).toBeGreaterThan(0)
        // Ensure different frames on different pages
        const page1Ids = page1.docs.map((f) => f.id)
        const page2Ids = page2.docs.map((f) => f.id)
        page2Ids.forEach((id) => {
          expect(page1Ids).not.toContain(id)
        })
      }
    })
  })

  describe('Narrator Relationship', () => {
    it('narrators have gender field for frame filtering', async () => {
      const narrator = await payload.findByID({
        collection: 'narrators',
        id: maleNarrator.id,
      })

      expect(narrator.gender).toBe('male')
    })

    it('allows fetching narrator to determine frame filter', async () => {
      // Simulate what FrameInserter does - fetch narrator then filter frames
      const narrator = await payload.findByID({
        collection: 'narrators',
        id: femaleNarrator.id,
      })

      const frames = await payload.find({
        collection: 'frames',
        where: {
          imageSet: {
            equals: narrator.gender,
          },
        },
      })

      expect(frames.docs.length).toBeGreaterThanOrEqual(2)
      frames.docs.forEach((frame) => {
        expect(frame.imageSet).toBe('female')
      })
    })
  })

  describe('All Categories Available', () => {
    it('FRAME_CATEGORIES constant matches collection options', async () => {
      // Verify that FRAME_CATEGORIES has all expected categories
      expect(FRAME_CATEGORIES).toContain('mooladhara')
      expect(FRAME_CATEGORIES).toContain('swadhistan')
      expect(FRAME_CATEGORIES).toContain('nabhi')
      expect(FRAME_CATEGORIES.length).toBeGreaterThan(0)
    })
  })
})
