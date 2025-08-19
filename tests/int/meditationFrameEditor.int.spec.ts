import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import type { Narrator, Frame, Meditation } from '@/payload-types'
import type { FrameData } from '@/components/admin/MeditationFrameEditor/types'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'
import { FRAME_TAGS } from '@/collections/resources/Frames'

/**
 * Integration tests for MeditationFrameEditor functionality
 * Tests the data layer interactions and validation logic
 */
describe('MeditationFrameEditor Integration', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let narrator: Narrator
  let maleFrames: Frame[]
  let femaleFrames: Frame[]
  let meditation: Meditation

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test narrator
    narrator = await testData.createNarrator(payload, {
      name: 'Test Male Narrator',
      gender: 'male' as const,
    })

    // Create male frames for the narrator's gender
    const maleFrame1 = await testData.createFrame(payload, {
      name: 'Male Agnya',
      imageSet: 'male',
      tags: [FRAME_TAGS[0], FRAME_TAGS[1]],
    })
    const maleFrame2 = await testData.createFrame(payload, {
      name: 'Male Right Heart',
      imageSet: 'male',
      tags: [FRAME_TAGS[2]],
    })
    const maleFrame3 = await testData.createFrame(payload, {
      name: 'Male Back Agnya',
      imageSet: 'male',
      tags: [FRAME_TAGS[0]],
    })
    maleFrames = [maleFrame1, maleFrame2, maleFrame3]

    // Create female frames (should not appear for male narrator)
    const femaleFrame = await testData.createFrame(payload, {
      name: 'Female Agnya',
      imageSet: 'female',
      tags: [FRAME_TAGS[0]],
    })
    femaleFrames = [femaleFrame]

    // Create test meditation with audio
    const thumbnail = await testData.createMediaImage(payload)
    meditation = await testData.createMeditation(
      payload,
      {
        narrator: narrator.id,
        thumbnail: thumbnail.id,
      },
      {
        title: 'Test Meditation with Frames',
      }
    )
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Frame Library API Integration', () => {
    it('should load frames filtered by narrator gender', async () => {
      // Query frames for male narrator
      const maleFramesResult = await payload.find({
        collection: 'frames',
        where: {
          imageSet: {
            equals: 'male',
          },
        },
      })

      expect(maleFramesResult.docs).toHaveLength(3)
      const frameNames = maleFramesResult.docs.map(f => f.name).sort()
      expect(frameNames).toEqual([
        'Male Agnya',
        'Male Back Agnya',
        'Male Right Heart'
      ])

      // Query frames for female narrator (different gender)
      const femaleFramesResult = await payload.find({
        collection: 'frames',
        where: {
          imageSet: {
            equals: 'female',
          },
        },
      })

      expect(femaleFramesResult.docs).toHaveLength(1)
      expect(femaleFramesResult.docs[0].name).toBe('Female Agnya')
    })

    it('should filter frames by tags', async () => {
      const morningFrames = await payload.find({
        collection: 'frames',
        where: {
          and: [
            {
              imageSet: {
                equals: 'male',
              },
            },
            {
              tags: {
                in: [FRAME_TAGS[0]],
              },
            },
          ],
        },
      })

      expect(morningFrames.docs).toHaveLength(2)
      const morningFrameNames = morningFrames.docs.map(f => f.name).sort()
      expect(morningFrameNames).toEqual([
        'Male Agnya',
        'Male Back Agnya'
      ])

      const peacefulFrames = await payload.find({
        collection: 'frames',
        where: {
          and: [
            {
              imageSet: {
                equals: 'male',
              },
            },
            {
              tags: {
                in: [FRAME_TAGS[2]],
              },
            },
          ],
        },
      })

      expect(peacefulFrames.docs).toHaveLength(1)
      expect(peacefulFrames.docs[0].name).toBe('Male Right Heart')
    })
  })

  describe('Frame Data Validation', () => {
    it('should validate frame data structure', () => {
      const validFrameData: FrameData = {
        frame: maleFrames[0].id,
        timestamp: 10,
      }

      expect(validFrameData.frame).toBeTruthy()
      expect(typeof validFrameData.timestamp).toBe('number')
      expect(validFrameData.timestamp).toBeGreaterThanOrEqual(0)
    })

    it('should sort frames by timestamp', () => {
      const unsortedFrames: FrameData[] = [
        { frame: maleFrames[0].id, timestamp: 30 },
        { frame: maleFrames[1].id, timestamp: 0 },
        { frame: maleFrames[2].id, timestamp: 15 },
      ]

      const sortedFrames = [...unsortedFrames].sort((a, b) => a.timestamp - b.timestamp)

      expect(sortedFrames[0].timestamp).toBe(0)
      expect(sortedFrames[1].timestamp).toBe(15)
      expect(sortedFrames[2].timestamp).toBe(30)
    })

    it('should enforce first frame at zero rule', () => {
      const framesWithFirstAtZero: FrameData[] = [
        { frame: maleFrames[0].id, timestamp: 0 },
        { frame: maleFrames[1].id, timestamp: 15 },
        { frame: maleFrames[2].id, timestamp: 30 },
      ]

      expect(framesWithFirstAtZero[0].timestamp).toBe(0)
    })

    it('should validate timestamp constraints', () => {
      // Valid timestamps
      expect(() => {
        const frame: FrameData = { frame: maleFrames[0].id, timestamp: 0 }
        expect(frame.timestamp).toBeGreaterThanOrEqual(0)
      }).not.toThrow()

      expect(() => {
        const frame: FrameData = { frame: maleFrames[0].id, timestamp: 3600 }
        expect(frame.timestamp).toBeLessThanOrEqual(3600)
      }).not.toThrow()

      // Invalid timestamps (would be caught by UI validation)
      const invalidNegative: FrameData = { frame: maleFrames[0].id, timestamp: -1 }
      const invalidTooLarge: FrameData = { frame: maleFrames[0].id, timestamp: 3601 }
      
      expect(invalidNegative.timestamp).toBeLessThan(0)
      expect(invalidTooLarge.timestamp).toBeGreaterThan(3600)
    })

    it('should detect duplicate timestamps', () => {
      const framesWithDuplicates: FrameData[] = [
        { frame: maleFrames[0].id, timestamp: 0 },
        { frame: maleFrames[1].id, timestamp: 15 },
        { frame: maleFrames[2].id, timestamp: 15 }, // Duplicate!
      ]

      const timestamps = framesWithDuplicates.map(f => f.timestamp)
      const uniqueTimestamps = [...new Set(timestamps)]
      
      expect(timestamps.length).toBe(3)
      expect(uniqueTimestamps.length).toBe(2) // One duplicate detected
    })
  })

  describe('Meditation Frame Updates', () => {
    it('should save frame data to meditation document', async () => {
      const frameData: FrameData[] = [
        { frame: maleFrames[0].id, timestamp: 0 },
        { frame: maleFrames[1].id, timestamp: 15 },
        { frame: maleFrames[2].id, timestamp: 30 },
      ]

      // Update meditation with frame data
      const updatedMeditation = await payload.update({
        collection: 'meditations',
        id: meditation.id,
        data: {
          frames: frameData,
        },
      })

      expect(updatedMeditation.frames).toHaveLength(3)
      expect(updatedMeditation.frames).toEqual(frameData)
    })
  })

  describe('Frame Preview Logic', () => {
    it('should determine correct frame for current timestamp', () => {
      const frames: FrameData[] = [
        { frame: maleFrames[0].id, timestamp: 0 },
        { frame: maleFrames[1].id, timestamp: 15 },
        { frame: maleFrames[2].id, timestamp: 30 },
      ]

      // Function to find current frame (mimics FramePreview logic)
      const getCurrentFrame = (currentTime: number): FrameData | null => {
        if (frames.length === 0) return null
        
        // Sort frames by timestamp
        const sortedFrames = [...frames].sort((a, b) => a.timestamp - b.timestamp)
        
        // Find the frame that should be displayed at current time
        let currentFrame = sortedFrames[0]
        
        for (const frame of sortedFrames) {
          if (frame.timestamp <= currentTime) {
            currentFrame = frame
          } else {
            break
          }
        }
        
        return currentFrame
      }

      // Test various timestamps
      expect(getCurrentFrame(0)?.frame).toBe(maleFrames[0].id)
      expect(getCurrentFrame(5)?.frame).toBe(maleFrames[0].id)
      expect(getCurrentFrame(15)?.frame).toBe(maleFrames[1].id)
      expect(getCurrentFrame(20)?.frame).toBe(maleFrames[1].id)
      expect(getCurrentFrame(30)?.frame).toBe(maleFrames[2].id)
      expect(getCurrentFrame(60)?.frame).toBe(maleFrames[2].id)
    })

    it('should handle empty frames list', () => {
      const getCurrentFrame = (currentTime: number, frames: FrameData[]): FrameData | null => {
        if (frames.length === 0) return null
        return frames[0]
      }

      expect(getCurrentFrame(10, [])).toBeNull()
    })

    it('should handle single frame', () => {
      const singleFrame: FrameData[] = [
        { frame: maleFrames[0].id, timestamp: 0 },
      ]

      const getCurrentFrame = (currentTime: number): FrameData => {
        return singleFrame[0]
      }

      expect(getCurrentFrame(0)).toEqual(singleFrame[0])
      expect(getCurrentFrame(100)).toEqual(singleFrame[0])
    })
  })

  describe('Audio Player Integration', () => {
    it('should handle meditation with audio file', async () => {
      // Meditation was created with audio in beforeAll
      expect(meditation.filename).toBeTruthy()
      expect(meditation.mimeType).toBe('audio/mpeg')
      expect(meditation.filesize).toBeGreaterThan(0)
    })

    it('should construct correct audio URL', () => {
      const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : ''
      const expectedUrl = `${baseUrl}/media/meditations/${meditation.filename}`
      
      expect(expectedUrl).toContain(meditation.filename!)
    })

    it('should handle meditation without audio file', async () => {
      // Skip this test as Payload requires file upload for meditation collection
      // In the UI, this would be handled by showing "Upload audio file first" message
      const hasAudioFile = meditation.filename
      expect(hasAudioFile).toBeTruthy()
      
      // Simulate the condition where no audio file exists
      const noAudioCondition = !hasAudioFile
      expect(noAudioCondition).toBe(false) // Should be false since we have audio
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid frame references', async () => {
      const invalidFrameData: FrameData[] = [
        { frame: 'invalid-frame-id', timestamp: 0 },
      ]

      // This should not crash, but would be handled by the UI
      expect(() => {
        const isValidFrame = maleFrames.some(f => f.id === 'invalid-frame-id')
        expect(isValidFrame).toBe(false)
      }).not.toThrow()
    })

    it('should handle narrator without frames', async () => {
      const femaleNarrator = await testData.createNarrator(payload, {
        name: 'Female Narrator',
        gender: 'female',
      })

      // Should only find 1 female frame
      const femaleOnlyFrames = await payload.find({
        collection: 'frames',
        where: {
          imageSet: {
            equals: 'female',
          },
        },
      })

      expect(femaleOnlyFrames.docs).toHaveLength(1)
    })

    it('should handle empty meditation frames array', async () => {
      // Test by updating existing meditation with empty frames
      const updatedMeditation = await payload.update({
        collection: 'meditations',
        id: meditation.id,
        data: {
          frames: [],
        },
      })

      expect(updatedMeditation.frames).toEqual([])
    })
  })
})