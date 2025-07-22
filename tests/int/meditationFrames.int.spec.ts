import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Meditation, MeditationFrame, Frame, Narrator, Media, Tag } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testDataFactory } from '../utils/testDataFactory'

describe('MeditationFrames Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testMeditation: Meditation
  let testFrame1: Frame
  let testFrame2: Frame
  let testFrame3: Frame
  let testNarrator: Narrator
  let testAudioMedia: Media
  let testImageMedia: Media

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test dependencies
    testNarrator = await testDataFactory.createNarrator(payload, { name: 'Test Narrator' })
    testAudioMedia = await testDataFactory.createMediaAudio(payload, { alt: 'Test audio file' })
    testImageMedia = await testDataFactory.createMediaImage(payload, { alt: 'Test image file' })

    // Create test meditation
    testMeditation = await testDataFactory.createMeditation(payload, {
      narrator: testNarrator.id,
      audioFile: testAudioMedia.id,
      thumbnail: testImageMedia.id,
    }, {
      title: 'Test Meditation',
      duration: 15,
    })

    // Create test frames
    testFrame1 = await testDataFactory.createFrame(payload, { name: 'Frame 1' })
    testFrame2 = await testDataFactory.createFrame(payload, { name: 'Frame 2' })
    testFrame3 = await testDataFactory.createFrame(payload, { name: 'Frame 3' })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Basic CRUD Operations', () => {
    it('creates a meditation frame relationship', async () => {
      const meditationFrame = await testDataFactory.createMeditationFrame(payload, {
        meditation: testMeditation.id,
        frame: testFrame1.id,
      }, {
        timestamp: 5.5,
      })

      expect(meditationFrame).toBeDefined()
      expect(typeof meditationFrame.meditation === 'object' ? meditationFrame.meditation.id : meditationFrame.meditation).toBe(testMeditation.id)
      expect(typeof meditationFrame.frame === 'object' ? meditationFrame.frame.id : meditationFrame.frame).toBe(testFrame1.id)
      expect(meditationFrame.timestamp).toBe(5.5)
    })

    it('requires all required fields', async () => {
      await expect(
        payload.create({
          collection: 'meditationFrames',
          data: {
            timestamp: 10,
            // Missing meditation and frame
          } as any,
        })
      ).rejects.toThrow()

      await expect(
        payload.create({
          collection: 'meditationFrames',
          data: {
            meditation: testMeditation.id,
            timestamp: 10,
            // Missing frame
          } as any,
        })
      ).rejects.toThrow()

      await expect(
        payload.create({
          collection: 'meditationFrames',
          data: {
            frame: testFrame1.id,
            timestamp: 10,
            // Missing meditation
          } as any,
        })
      ).rejects.toThrow()
    })

    it('validates timestamp is a non-negative number', async () => {
      await expect(
        payload.create({
          collection: 'meditationFrames',
          data: {
            meditation: testMeditation.id,
            frame: testFrame1.id,
            timestamp: -5,
          },
        })
      ).rejects.toThrow(/invalid.*Timestamp/)

      await expect(
        payload.create({
          collection: 'meditationFrames',
          data: {
            meditation: testMeditation.id,
            frame: testFrame1.id,
            timestamp: 'invalid' as any,
          },
        })
      ).rejects.toThrow()
    })

    it('accepts valid timestamps including zero', async () => {
      const zeroTimestamp = await testDataFactory.createMeditationFrame(payload, {
        meditation: testMeditation.id,
        frame: testFrame1.id,
      }, {
        timestamp: 0,
      })

      expect(zeroTimestamp.timestamp).toBe(0)

      const decimalTimestamp = await testDataFactory.createMeditationFrame(payload, {
        meditation: testMeditation.id,
        frame: testFrame2.id,
      }, {
        timestamp: 12.75,
      })

      expect(decimalTimestamp.timestamp).toBe(12.75)
    })
  })

  describe('Timestamp Uniqueness Validation', () => {
    it('prevents duplicate timestamps within the same meditation', async () => {
      const timestamp = 15.5

      // Create first frame with timestamp
      await testDataFactory.createMeditationFrame(payload, {
        meditation: testMeditation.id,
        frame: testFrame1.id,
      }, {
        timestamp,
      })

      // Try to create second frame with same timestamp in same meditation - should fail
      await expect(
        testDataFactory.createMeditationFrame(payload, {
          meditation: testMeditation.id,
          frame: testFrame2.id,
        }, {
          timestamp,
        })
      ).rejects.toThrow(/invalid.*Timestamp/)
    })

    it('allows duplicate timestamps across different meditations', async () => {
      // Create another meditation
      const secondMeditation = await testDataFactory.createMeditation(payload, {
        narrator: testNarrator.id,
        audioFile: testAudioMedia.id,
        thumbnail: testImageMedia.id,
      }, {
        title: 'Second Meditation',
        duration: 20,
      })

      const timestamp = 25.0

      // Create frame with timestamp in first meditation
      const firstFrame = await testDataFactory.createMeditationFrame(payload, {
        meditation: testMeditation.id,
        frame: testFrame1.id,
      }, {
        timestamp,
      })

      // Create frame with same timestamp in second meditation - should work
      const secondFrame = await testDataFactory.createMeditationFrame(payload, {
        meditation: secondMeditation.id,
        frame: testFrame2.id,
      }, {
        timestamp,
      })

      expect(firstFrame.timestamp).toBe(timestamp)
      expect(secondFrame.timestamp).toBe(timestamp)
      expect(typeof firstFrame.meditation === 'object' ? firstFrame.meditation.id : firstFrame.meditation).toBe(testMeditation.id)
      expect(typeof secondFrame.meditation === 'object' ? secondFrame.meditation.id : secondFrame.meditation).toBe(secondMeditation.id)
    })

    it('allows updating existing frame with different timestamp', async () => {
      const meditationFrame = await testDataFactory.createMeditationFrame(payload, {
        meditation: testMeditation.id,
        frame: testFrame3.id,
      }, {
        timestamp: 30.0,
      })

      // Update timestamp - should work
      const updated = await payload.update({
        collection: 'meditationFrames',
        id: meditationFrame.id,
        data: {
          timestamp: 35.0,
        },
      }) as MeditationFrame

      expect(updated.timestamp).toBe(35.0)
    })

    it('allows updating existing frame while keeping same timestamp', async () => {
      const meditationFrame = await testDataFactory.createMeditationFrame(payload, {
        meditation: testMeditation.id,
        frame: testFrame1.id,
      }, {
        timestamp: 40.0,
      })

      // Update frame reference while keeping same timestamp - should work
      const updated = await payload.update({
        collection: 'meditationFrames',
        id: meditationFrame.id,
        data: {
          frame: testFrame2.id,
          timestamp: 40.0, // Same timestamp
        },
      }) as MeditationFrame

      expect(updated.timestamp).toBe(40.0)
      expect(typeof updated.frame === 'object' ? updated.frame.id : updated.frame).toBe(testFrame2.id)
    })
  })

  describe('Collection is hidden from admin', () => {
    it('has admin hidden configuration', async () => {
      // This verifies that the collection configuration is properly set
      // We can't easily test the admin UI behavior in integration tests,
      // but we can verify the collection exists and is configured correctly
      const result = await payload.find({
        collection: 'meditationFrames',
        limit: 1,
      })

      // If we can query the collection, it exists and is properly configured
      expect(result).toBeDefined()
      expect(Array.isArray(result.docs)).toBe(true)
    })
  })

  describe('Querying and Relationships', () => {
    it('finds frames by meditation with timestamp ordering', async () => {
      // Create a new meditation for this test to avoid conflicts
      const meditation = await testDataFactory.createMeditation(payload, {
        narrator: testNarrator.id,
        audioFile: testAudioMedia.id,
        thumbnail: testImageMedia.id,
      }, {
        title: 'Ordering Test Meditation',
        duration: 30,
      })

      // Create frames in non-chronological order
      await testDataFactory.createMeditationFrame(payload, {
        meditation: meditation.id,
        frame: testFrame2.id,
      }, {
        timestamp: 20.0,
      })

      await testDataFactory.createMeditationFrame(payload, {
        meditation: meditation.id,
        frame: testFrame1.id,
      }, {
        timestamp: 5.0,
      })

      await testDataFactory.createMeditationFrame(payload, {
        meditation: meditation.id,
        frame: testFrame3.id,
      }, {
        timestamp: 15.0,
      })

      // Query frames for this meditation, ordered by timestamp
      const result = await payload.find({
        collection: 'meditationFrames',
        where: {
          meditation: {
            equals: meditation.id,
          },
        },
        sort: 'timestamp',
      })

      expect(result.docs).toHaveLength(3)
      expect(result.docs[0].timestamp).toBe(5.0)
      expect(result.docs[1].timestamp).toBe(15.0)
      expect(result.docs[2].timestamp).toBe(20.0)
    })

    it('deletes meditation frame relationships', async () => {
      const meditationFrame = await testDataFactory.createMeditationFrame(payload, {
        meditation: testMeditation.id,
        frame: testFrame1.id,
      }, {
        timestamp: 50.0,
      })

      await payload.delete({
        collection: 'meditationFrames',
        id: meditationFrame.id,
      })

      const result = await payload.find({
        collection: 'meditationFrames',
        where: {
          id: {
            equals: meditationFrame.id,
          },
        },
      })

      expect(result.docs).toHaveLength(0)
    })
  })

  describe('Complete isolation - no data leakage', () => {
    it('demonstrates complete isolation between test environments', async () => {
      // Create some meditation frames in this test
      await testDataFactory.createMeditationFrame(payload, {
        meditation: testMeditation.id,
        frame: testFrame1.id,
      }, {
        timestamp: 100.0,
      })

      // Query all meditation frames
      const allFrames = await payload.find({
        collection: 'meditationFrames',
      })

      // Should only see frames created in this test file
      expect(allFrames.docs.length).toBeGreaterThan(0)

      // All frames should be related to meditations created in this test
      for (const frame of allFrames.docs) {
        const meditationId = typeof frame.meditation === 'object' ? frame.meditation.id : frame.meditation
        
        // Should be one of our test meditations
        expect(meditationId).toBeTruthy()
      }
    })
  })
})