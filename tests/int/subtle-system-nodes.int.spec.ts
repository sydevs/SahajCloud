import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'

import type { Lecture, SubtleSystemNode } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Mock the Nirmala Vidya API client so creating Lectures in tests does not
// hit the network. Mirrors the pattern in lectures.int.spec.ts.
vi.mock('@/lib/nirmalaVidyaApi', async (importOriginal) => {
  const { readFileSync } = await import('fs')
  const { dirname, join } = await import('path')
  const { fileURLToPath: toPath } = await import('url')
  const imgBuffer = readFileSync(
    join(dirname(toPath(import.meta.url)), '../files/image-1050x700.jpg'),
  )
  const original = await importOriginal<typeof import('@/lib/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from Nirmala Vidya',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
      hlsUrl: 'https://example.com/video.m3u8',
      subtitles: [],
      duration: null,
    }),
    downloadToBuffer: vi.fn().mockResolvedValue({
      data: new Uint8Array(imgBuffer),
      mimetype: 'image/jpeg',
      name: 'lecture-thumbnail.jpg',
      size: imgBuffer.length,
    }),
  }
})

/**
 * Custom-behaviour tests for the SubtleSystemNodes collection.
 * Skips Payload-internal checks (required-field validation, basic CRUD).
 */
describe('SubtleSystemNodes Collection', () => {
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

  describe('slug uniqueness', () => {
    it('rejects creating two nodes with the same slug', async () => {
      await testData.createSubtleSystemNode(payload, {}, { slug: 'mooladhara' })

      await expect(
        testData.createSubtleSystemNode(payload, {}, { slug: 'mooladhara' }),
      ).rejects.toThrow()
    })
  })

  describe('reverse joins from related collections', () => {
    let node: SubtleSystemNode
    let lectureA: Lecture
    let lectureB: Lecture

    beforeAll(async () => {
      node = await testData.createSubtleSystemNode(payload, {}, { slug: 'anahat' })

      lectureA = await testData.createLecture(payload, undefined, {
        subtleSystemNodes: [node.id],
      })
      lectureB = await testData.createLecture(payload, undefined, {
        subtleSystemNodes: [node.id],
      })
    })

    it('exposes attached lectures via the lectures join', async () => {
      const fetched = await payload.findByID({
        collection: 'subtle-system-nodes',
        id: node.id,
        depth: 1,
      })

      const joined = fetched.lectures as
        | { docs: Array<number | { id: number }> }
        | undefined
      const ids = (joined?.docs ?? []).map((d) => (typeof d === 'number' ? d : d.id))
      expect(ids).toContain(lectureA.id)
      expect(ids).toContain(lectureB.id)
    })

    it('exposes attached frames via the frames join', async () => {
      const frame = await testData.createFrame(payload, {
        imageSet: 'male',
        subtleSystemNode: node.id,
      })

      const fetched = await payload.findByID({
        collection: 'subtle-system-nodes',
        id: node.id,
        depth: 1,
      })

      const joined = fetched.frames as
        | { docs: Array<number | { id: number }> }
        | undefined
      const ids = (joined?.docs ?? []).map((d) => (typeof d === 'number' ? d : d.id))
      expect(ids).toContain(frame.id)
    })
  })
})
