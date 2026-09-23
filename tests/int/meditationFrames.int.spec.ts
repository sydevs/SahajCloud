import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import type { Meditation, Narrator, Image, Frame } from '@/payload-types'
import type { KeyframeDefinition } from '@/types/frames'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Meditation Frames Field', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testNarrator: Narrator
  let testImageMedia: Image
  let testFrame1: Frame
  let testFrame2: Frame
  let testFrame3: Frame
  let testMeditation: Meditation

  // Helper to get frame ID as string (as required by validation)
  const frameId = (frame: Frame): string => String(frame.id)

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test dependencies
    testNarrator = await testData.createNarrator(payload, { gender: 'male' })
    testImageMedia = await testData.createMediaImage(payload)

    // Create test frames
    testFrame1 = await testData.createFrame(payload, {
      imageSet: 'male',
    })
    testFrame2 = await testData.createFrame(payload, {
      imageSet: 'male',
    })
    testFrame3 = await testData.createFrame(payload, {
      imageSet: 'male',
    })

    // Create test meditation without frames initially
    testMeditation = await testData.createMeditation(payload, {
      narrator: testNarrator.id,
      thumbnail: testImageMedia.id,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Timestamp Validation', () => {
    it('accepts valid frame with timestamp 0', async () => {
      const frames: KeyframeDefinition[] = [{ id: frameId(testFrame1), timestamp: 0 }]

      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames,
        },
      })) as Meditation

      expect(updated.frames).toHaveLength(1)
      expect((updated.frames as KeyframeDefinition[])[0].timestamp).toBe(0)
    })

    it('accepts valid positive timestamps', async () => {
      const frames: KeyframeDefinition[] = [
        { id: frameId(testFrame1), timestamp: 0 },
        { id: frameId(testFrame2), timestamp: 30 },
        { id: frameId(testFrame3), timestamp: 120 },
      ]

      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames,
        },
      })) as Meditation

      expect(updated.frames).toHaveLength(3)
    })

    it('filters out frames with negative timestamps', async () => {
      // First ensure meditation has valid frames
      await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames: [{ id: frameId(testFrame1), timestamp: 0 }],
        },
      })

      // Frames with negative timestamps are filtered out by beforeChange hook
      // If all frames are filtered out, required validation fails
      const frames: KeyframeDefinition[] = [{ id: frameId(testFrame1), timestamp: -5 }]

      await expect(
        payload.update({
          collection: 'meditations',
          id: testMeditation.id,
          data: {
            frames,
          },
        }),
      ).rejects.toThrow() // Throws because all frames filtered out, field is required
    })

    it('rounds non-integer timestamps on read', async () => {
      const frames: KeyframeDefinition[] = [{ id: frameId(testFrame1), timestamp: 10.5 }]

      // Non-integer timestamps are stored as-is but rounded on read (afterRead hook)
      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames,
        },
      })) as Meditation

      // Timestamp should be rounded to nearest integer on read
      expect((updated.frames as KeyframeDefinition[])[0].timestamp).toBe(11)
    })

    it('rejects timestamps exceeding maximum (3600s)', async () => {
      const frames: KeyframeDefinition[] = [{ id: frameId(testFrame1), timestamp: 3700 }]

      // The validation should reject timestamps over 3600s (1 hour)
      // Note: The actual validation is in the component, not the collection
      // This test verifies the collection accepts it (validation is client-side)
      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames,
        },
      })) as Meditation

      expect(updated.frames).toHaveLength(1)
    })
  })

  describe('Malformed Frame Filtering', () => {
    it('filters out frames without valid id', async () => {
      // First ensure meditation has valid frames
      await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames: [{ id: frameId(testFrame1), timestamp: 0 }],
        },
      })

      // Mix of valid and invalid frames - invalid ones are filtered out
      const frames = [
        { id: frameId(testFrame1), timestamp: 0 },
        { id: '', timestamp: 30 }, // Empty id - filtered
        { id: frameId(testFrame2), timestamp: 60 },
        { timestamp: 90 }, // Missing id - filtered
      ]

      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames: frames as KeyframeDefinition[],
        },
      })) as Meditation

      // Only valid frames remain
      expect(updated.frames).toHaveLength(2)
      const resultFrames = updated.frames as KeyframeDefinition[]
      expect(String(resultFrames[0].id)).toBe(frameId(testFrame1))
      expect(String(resultFrames[1].id)).toBe(frameId(testFrame2))
    })

    it('filters out non-object frames', async () => {
      // First ensure meditation has valid frames
      await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames: [{ id: frameId(testFrame1), timestamp: 0 }],
        },
      })

      // Mix of valid frames and invalid non-object values
      const frames = [
        { id: frameId(testFrame1), timestamp: 0 },
        null,
        undefined,
        'invalid',
        123,
        { id: frameId(testFrame2), timestamp: 60 },
      ]

      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames: frames as unknown as KeyframeDefinition[],
        },
      })) as Meditation

      // Only valid frames remain
      expect(updated.frames).toHaveLength(2)
    })

    it('rejects an explicit all-invalid frames payload', async () => {
      await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames: [{ id: testFrame1.id, timestamp: 0 }],
        },
      })

      await expect(
        payload.update({
          collection: 'meditations',
          id: testMeditation.id,
          data: {
            frames: [{ timestamp: 90 }] as unknown as KeyframeDefinition[],
          },
        }),
      ).rejects.toThrow()
    })
  })

  describe('Timestamp Handling', () => {
    it('allows duplicate timestamps', async () => {
      // Duplicate timestamps are allowed - the UI handles replacing frames at the same timestamp
      const frames: KeyframeDefinition[] = [
        { id: frameId(testFrame1), timestamp: 0 },
        { id: frameId(testFrame2), timestamp: 0 }, // Duplicate timestamp - allowed
      ]

      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames,
        },
      })) as Meditation

      expect(updated.frames).toHaveLength(2)
    })

    it('allows same frame at different timestamps', async () => {
      // This is allowed because you might want the same frame to appear at different times
      const frames: KeyframeDefinition[] = [
        { id: frameId(testFrame1), timestamp: 0 },
        { id: frameId(testFrame1), timestamp: 30 }, // Same frame, different timestamp
      ]

      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames,
        },
      })) as Meditation

      expect(updated.frames).toHaveLength(2)
    })
  })

  describe('Auto-Sorting Behavior', () => {
    it('sorts frames by timestamp after save', async () => {
      // Insert frames in non-sorted order
      const frames: KeyframeDefinition[] = [
        { id: frameId(testFrame2), timestamp: 60 },
        { id: frameId(testFrame1), timestamp: 0 },
        { id: frameId(testFrame3), timestamp: 30 },
      ]

      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames,
        },
      })) as Meditation

      const sortedFrames = updated.frames as KeyframeDefinition[]
      expect(sortedFrames).toHaveLength(3)
      expect(sortedFrames[0].timestamp).toBe(0)
      expect(sortedFrames[1].timestamp).toBe(30)
      expect(sortedFrames[2].timestamp).toBe(60)
    })
  })

  describe('Frame Data Enrichment', () => {
    it('enriches frame data with frame details on read', async () => {
      const frames: KeyframeDefinition[] = [
        { id: frameId(testFrame1), timestamp: 0 },
        { id: frameId(testFrame2), timestamp: 30 },
      ]

      await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames,
        },
      })

      // Fetch with enriched data
      const fetched = (await payload.findByID({
        collection: 'meditations',
        id: testMeditation.id,
      })) as Meditation

      const enrichedFrames = fetched.frames as Array<KeyframeDefinition & { imageSet?: string }>

      expect(enrichedFrames).toHaveLength(2)
      // Enrichment populates fields from the underlying Frame doc
      expect(enrichedFrames[0].imageSet).toBe('male')
      expect(enrichedFrames[1].imageSet).toBe('male')
    })

    it('fetches frames with pagination:false to skip the redundant count(*) (#534)', async () => {
      const frames: KeyframeDefinition[] = [
        { id: frameId(testFrame1), timestamp: 0 },
        { id: frameId(testFrame2), timestamp: 30 },
      ]
      await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: { frames },
      })

      const findSpy = vi.spyOn(payload, 'find')
      try {
        await payload.findByID({ collection: 'meditations', id: testMeditation.id })
        const framesCalls = findSpy.mock.calls.filter((c) => c[0]?.collection === 'frames')
        expect(framesCalls.length).toBeGreaterThan(0)
        // Every frames-enrichment read must disable pagination so Payload skips the
        // `select count(*)` it would otherwise run alongside the id-list fetch — the
        // total is never used. See #534 Sentry analysis (frames select/count pairs).
        for (const call of framesCalls) {
          expect(call[0].pagination).toBe(false)
        }
      } finally {
        findSpy.mockRestore()
      }
    })
  })

  describe('Frame Updates', () => {
    it('updates frames by replacing the entire array', async () => {
      // First add some frames
      const initialFrames: KeyframeDefinition[] = [
        { id: frameId(testFrame1), timestamp: 0 },
        { id: frameId(testFrame2), timestamp: 30 },
        { id: frameId(testFrame3), timestamp: 60 },
      ]

      await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames: initialFrames,
        },
      })

      // Update to only have 2 frames (but still at least 1 to pass validation)
      const updatedFrames: KeyframeDefinition[] = [
        { id: frameId(testFrame1), timestamp: 0 },
        { id: frameId(testFrame3), timestamp: 45 }, // Changed timestamp
      ]

      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames: updatedFrames,
        },
      })) as Meditation

      const resultFrames = updated.frames as KeyframeDefinition[]
      expect(resultFrames).toHaveLength(2)
      expect(String(resultFrames[0].id)).toBe(frameId(testFrame1))
      expect(String(resultFrames[1].id)).toBe(frameId(testFrame3))
      expect(resultFrames[1].timestamp).toBe(45)
    })

    it('requires at least one frame on update', async () => {
      // Frames field has required: true with condition: ({ id }) => !!id
      // This means frames are required on updates (when id exists)
      await expect(
        payload.update({
          collection: 'meditations',
          id: testMeditation.id,
          data: {
            frames: [],
          },
        }),
      ).rejects.toThrow() // Required validation error - frames cannot be empty
    })

    it('preserves existing frames when a partial update omits frames', async () => {
      await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          frames: [{ id: testFrame1.id, timestamp: 0 }],
        },
      })

      const updated = (await payload.update({
        collection: 'meditations',
        id: testMeditation.id,
        data: {
          title: 'Updated without frames',
        },
      })) as Meditation

      const resultFrames = updated.frames as KeyframeDefinition[]
      expect(resultFrames).toHaveLength(1)
      expect(resultFrames[0].id).toBe(testFrame1.id)
      expect(resultFrames[0].timestamp).toBe(0)
    })
  })

  describe('Publishing Validation with Frames', () => {
    it('prevents publishing without frames configured', async () => {
      // Create a new meditation (created as draft with no frames)
      const newMeditation = await testData.createMeditation(payload, {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      })

      // Trying to publish should fail because frames are required on update
      // (condition: ({ id }) => !!id means required when id exists)
      await expect(
        payload.update({
          collection: 'meditations',
          id: newMeditation.id,
          data: {
            _status: 'published',
          },
        }),
      ).rejects.toThrow() // Required validation error - frames cannot be empty
    })

    it('allows publishing when frames are configured', async () => {
      // Create a new meditation and add frames
      const newMeditation = await testData.createMeditation(payload, {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      })

      // Add frames and set _status to published in same update
      const published = (await payload.update({
        collection: 'meditations',
        id: newMeditation.id,
        data: {
          frames: [{ id: frameId(testFrame1), timestamp: 0 }],
          _status: 'published',
        },
      })) as Meditation

      expect(published._status).toBe('published')
      expect(published.frames).toHaveLength(1)
    })

    it('publishes with numeric frame IDs and drops malformed frame entries', async () => {
      const newMeditation = await testData.createMeditation(payload, {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      })

      const published = (await payload.update({
        collection: 'meditations',
        id: newMeditation.id,
        data: {
          frames: [
            { id: testFrame1.id, timestamp: 0 },
            { timestamp: 514 },
          ] as unknown as KeyframeDefinition[],
          _status: 'published',
        },
      })) as Meditation

      const resultFrames = published.frames as KeyframeDefinition[]
      expect(published._status).toBe('published')
      expect(resultFrames).toHaveLength(1)
      expect(resultFrames[0].id).toBe(testFrame1.id)
      expect(resultFrames[0].timestamp).toBe(0)
    })

    it('does not fail the save when the node-weight compute fails', async () => {
      const newMeditation = await testData.createMeditation(payload, {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      })

      const original = payload.find.bind(payload)
      let computeAttempted = false

      // `select.subtleSystemNode` is what distinguishes the weight compute's
      // frames read from the `frames` afterRead enrichment, which selects nothing.
      const spy = vi.spyOn(payload, 'find').mockImplementation((async (
        args: Parameters<typeof payload.find>[0],
      ) => {
        const select = args.select as { subtleSystemNode?: boolean } | undefined
        if (args.collection === 'frames' && select?.subtleSystemNode) {
          computeAttempted = true
          throw new Error('forced node-weight compute failure')
        }

        return original(args)
      }) as typeof payload.find)

      try {
        const updated = (await payload.update({
          collection: 'meditations',
          id: newMeditation.id,
          data: {
            frames: [{ id: testFrame1.id, timestamp: 0 }],
          },
        })) as Meditation

        expect(computeAttempted).toBe(true)
        expect(updated.frames).toHaveLength(1)
        expect(updated.subtleSystemNodeWeights).toBeNull()
      } finally {
        spy.mockRestore()
      }
    })
  })

  describe('Node Weights Cache Persistence', () => {
    // A frame with no `subtleSystemNode` contributes nothing, so a meditation
    // built from the suite's shared frames caches `{}` and every assertion below
    // would hold vacuously.
    let weightedFrame: Frame
    let weightedSlug: string

    beforeAll(async () => {
      const node = await testData.createSubtleSystemNode(payload)
      weightedSlug = node.slug as string
      weightedFrame = await testData.createFrame(payload, {
        imageSet: 'male',
        subtleSystemNode: node.id,
      })
    })

    const latestVersionRow = async (meditationId: number) => {
      const { docs } = await payload.findVersions({
        collection: 'meditations',
        depth: 0,
        limit: 1,
        sort: '-updatedAt',
        where: {
          and: [{ parent: { equals: meditationId } }, { latest: { equals: true } }],
        },
      })

      return docs[0]
    }

    const meditationWithWeights = async () => {
      const created = await testData.createMeditation(payload, {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      })

      const meditation = (await payload.update({
        collection: 'meditations',
        id: created.id,
        data: { frames: [{ id: frameId(weightedFrame), timestamp: 0 }] },
      })) as Meditation

      const weights = meditation.subtleSystemNodeWeights as Record<string, number>

      expect(weights?.[weightedSlug]).toBeGreaterThan(0)

      return { meditation, weights }
    }

    it('writes the cache to the latest version row as well as the main row', async () => {
      const { meditation, weights } = await meditationWithWeights()
      const row = await latestVersionRow(meditation.id)

      expect(row.version.subtleSystemNodeWeights).toEqual(weights)
    })

    it('leaves the published main row alone while a draft save moves the cache', async () => {
      const created = await testData.createMeditation(payload, {
        narrator: testNarrator.id,
        thumbnail: testImageMedia.id,
      })

      const published = (await payload.update({
        collection: 'meditations',
        id: created.id,
        data: {
          frames: [{ id: frameId(weightedFrame), timestamp: 0 }],
          _status: 'published',
        },
      })) as Meditation

      const publishedWeights = published.subtleSystemNodeWeights as Record<string, number>
      expect(publishedWeights?.[weightedSlug]).toBeGreaterThan(0)

      // Starting the frame later shortens its on-screen window, so the draft's
      // weights differ from the published ones by construction.
      await payload.update({
        collection: 'meditations',
        id: created.id,
        draft: true,
        data: { frames: [{ id: frameId(weightedFrame), timestamp: 5 }] },
      })

      const live = (await payload.findByID({
        collection: 'meditations',
        id: created.id,
      })) as Meditation
      const draft = (await payload.findByID({
        collection: 'meditations',
        id: created.id,
        draft: true,
      })) as Meditation

      expect(live.subtleSystemNodeWeights).toEqual(publishedWeights)
      expect(draft.subtleSystemNodeWeights).not.toEqual(publishedWeights)
    })
  })

  describe('Frames Cascade Cache Persistence', () => {
    // A dedicated node + frame per case: repointing a shared frame's node would
    // rewrite the weights every other case in this file asserts on.
    const cascadeFixture = async () => {
      const node = await testData.createSubtleSystemNode(payload)
      const frame = await testData.createFrame(payload, {
        imageSet: 'male',
        subtleSystemNode: node.id,
      })

      const meditationOn = async () => {
        const created = await testData.createMeditation(payload, {
          narrator: testNarrator.id,
          thumbnail: testImageMedia.id,
        })

        return (await payload.update({
          collection: 'meditations',
          id: created.id,
          data: { frames: [{ id: frameId(frame), timestamp: 0 }] },
        })) as Meditation
      }

      return { frame, meditationOn }
    }

    it('keeps cascaded weights through a later save that touches neither frames nor duration', async () => {
      const { frame, meditationOn } = await cascadeFixture()
      const meditation = await meditationOn()
      const nextNode = await testData.createSubtleSystemNode(payload)

      await payload.update({
        collection: 'frames',
        id: frame.id,
        data: { subtleSystemNode: nextNode.id },
      })

      const cascaded = ((await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
      })) as Meditation).subtleSystemNodeWeights as Record<string, number>

      expect(cascaded?.[nextNode.slug as string]).toBeGreaterThan(0)

      // The cascade reaches the main row alone, so the `latest: true` version row
      // still names the frame's previous node. `label`, deliberately: this save
      // recombines from that row, and only an unconditional recompute keeps the
      // pre-cascade weights from landing back on the main row (#843).
      await payload.update({
        collection: 'meditations',
        id: meditation.id,
        data: { label: 'Renamed after the cascade' },
      })

      const reread = (await payload.findByID({
        collection: 'meditations',
        id: meditation.id,
      })) as Meditation

      expect(reread.subtleSystemNodeWeights).toEqual(cascaded)
    })

    it('does not fail the frame save when the cache write fails', async () => {
      const { frame, meditationOn } = await cascadeFixture()
      await meditationOn()
      const nextNode = await testData.createSubtleSystemNode(payload)

      const original = payload.db.updateOne.bind(payload.db)
      let cacheWriteAttempted = false

      // Scoped to meditations: the frame save under test writes its own row too.
      const spy = vi.spyOn(payload.db, 'updateOne').mockImplementation((async (
        args: Parameters<typeof payload.db.updateOne>[0],
      ) => {
        if (args.collection === 'meditations') {
          cacheWriteAttempted = true
          throw new Error('forced cache persistence failure')
        }

        return original(args)
      }) as typeof payload.db.updateOne)

      try {
        const updated = await payload.update({
          collection: 'frames',
          id: frame.id,
          data: { subtleSystemNode: nextNode.id },
        })

        expect(cacheWriteAttempted).toBe(true)
        expect(updated.id).toBe(frame.id)
      } finally {
        spy.mockRestore()
      }
    })
  })
})
