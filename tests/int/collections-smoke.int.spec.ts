/**
 * Collections smoke test.
 *
 * One-stop file that confirms each content-bearing collection is reachable
 * and basically functional: create + read, plus relationship populate where
 * applicable. This replaces a handful of per-collection files whose only
 * remaining content was Payload-core CRUD coverage.
 *
 * Project-specific behavior (custom hooks, virtual fields, access control,
 * filterOptions, etc.) lives in dedicated `[collection].int.spec.ts` files.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Lectures collection has a beforeChange hook (populateFromNirmalaVidya) that
// fetches metadata from the Nirmala Vidya API. Stub it so smoke tests never
// hit the network.
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
      title: 'Smoke Test Lecture',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      hlsUrl: 'https://example.com/video.m3u8',
      subtitles: [],
    }),
    downloadToBuffer: vi.fn().mockResolvedValue({
      data: new Uint8Array(imgBuffer),
      mimetype: 'image/jpeg',
      name: 'lecture-thumbnail.jpg',
      size: imgBuffer.length,
    }),
  }
})

describe('Collections smoke', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUserId = env.adminUser.id
  })

  afterAll(async () => {
    await cleanup()
  })

  // ---- Resources / dependency-free collections first ---------------------

  it('images: create + read', async () => {
    const image = await testData.createMediaImage(payload, { alt: 'Smoke image' })
    expect(image.id).toBeDefined()
    const found = await payload.findByID({ collection: 'images', id: image.id })
    expect(found.alt).toBe('Smoke image')
  })

  it('files: create + read', async () => {
    const file = await testData.createFile(payload)
    expect(file.id).toBeDefined()
    const found = await payload.findByID({ collection: 'files', id: file.id })
    expect(found.id).toBe(file.id)
  })

  it('narrators: create + read', async () => {
    const narrator = await testData.createNarrator(payload, { name: 'Smoke Narrator' })
    expect(narrator.id).toBeDefined()
    const found = await payload.findByID({ collection: 'narrators', id: narrator.id })
    expect(found.name).toBe('Smoke Narrator')
  })

  it('authors: create + read', async () => {
    const author = await testData.createAuthor(payload, { name: 'Smoke Author' })
    expect(author.id).toBeDefined()
    const found = await payload.findByID({ collection: 'authors', id: author.id })
    expect(found.name).toBe('Smoke Author')
  })

  // ---- Tag collections ---------------------------------------------------

  it('meditation-tags: create + read', async () => {
    const tag = await testData.createMeditationTag(payload, { title: 'Smoke MTag' })
    expect(tag.id).toBeDefined()
    const found = await payload.findByID({ collection: 'meditation-tags', id: tag.id })
    expect(found.title).toBe('Smoke MTag')
  })

  it('song-tags: create + read', async () => {
    const tag = await testData.createSongTag(payload, { title: 'Smoke STag' })
    expect(tag.id).toBeDefined()
    const found = await payload.findByID({ collection: 'song-tags', id: tag.id })
    expect(found.title).toBe('Smoke STag')
  })

  it('lecture-tags: create + read', async () => {
    const tag = await testData.createLectureTag(payload, { label: 'Smoke LTag' })
    expect(tag.id).toBeDefined()
    const found = await payload.findByID({ collection: 'lecture-tags', id: tag.id })
    expect(found.label).toBe('Smoke LTag')
  })

  // ---- Content collections ----------------------------------------------

  it('albums: create + read', async () => {
    const album = await testData.createAlbum(payload, { title: 'Smoke Album', artist: 'Smoke' })
    expect(album.id).toBeDefined()
    const found = await payload.findByID({ collection: 'albums', id: album.id })
    expect(found.title).toBe('Smoke Album')
  })

  it('songs: create + read + populate album relationship', async () => {
    const album = await testData.createAlbum(payload, { title: 'Songs Smoke Album' })
    const song = await testData.createSong(payload, { album: album.id })
    expect(song.id).toBeDefined()
    const found = await payload.findByID({ collection: 'songs', id: song.id, depth: 1 })
    expect(found.album).toBeTypeOf('object')
    expect((found.album as { id: number }).id).toBe(album.id)
  })

  it('pages: create + read', async () => {
    const page = await testData.createPage(payload)
    expect(page.id).toBeDefined()
    const found = await payload.findByID({ collection: 'pages', id: page.id })
    expect(found.id).toBe(page.id)
  })

  it('videos: create + read', async () => {
    const video = await testData.createVideo(payload, { title: 'Smoke Video' })
    expect(video.id).toBeDefined()
    const found = await payload.findByID({ collection: 'videos', id: video.id })
    expect(found.title).toBe('Smoke Video')
  })

  it('frames: create + read', async () => {
    const frame = await testData.createFrame(payload)
    expect(frame.id).toBeDefined()
    const found = await payload.findByID({ collection: 'frames', id: frame.id })
    expect(found.id).toBe(frame.id)
  })

  it('meditations: create + read', async () => {
    const meditation = await testData.createMeditation(payload)
    expect(meditation.id).toBeDefined()
    const found = await payload.findByID({
      collection: 'meditations',
      id: meditation.id,
      locale: 'all',
    })
    expect(found.id).toBe(meditation.id)
  })

  it('lessons: create + read + populate icon relationship', async () => {
    const lesson = await testData.createLesson(payload, { title: 'Smoke Lesson' })
    expect(lesson.id).toBeDefined()
    const found = await payload.findByID({
      collection: 'lessons',
      id: lesson.id,
      depth: 1,
    })
    expect(found.title).toBe('Smoke Lesson')
    expect(found.icon).toBeTypeOf('object')
  })

  it('lectures: create + read (with mocked Nirmala Vidya API)', async () => {
    const lecture = await testData.createLecture(payload)
    expect(lecture.id).toBeDefined()
    const found = await payload.findByID({ collection: 'lectures', id: lecture.id })
    expect(found.id).toBe(lecture.id)
  })

  it('lecture-clips: create + read (with parent populated through relationship)', async () => {
    const parent = await testData.createLecture(payload)
    const clip = await testData.createLectureClip(payload, { parent: parent.id })
    expect(clip.id).toBeDefined()

    const found = await payload.findByID({
      collection: 'lecture-clips',
      id: clip.id,
      depth: 1,
    })
    expect(found.id).toBe(clip.id)
    const populatedParent = found.parent as { id: number }
    expect(typeof populatedParent).toBe('object')
    expect(populatedParent.id).toBe(parent.id)
  })

  it('app-cards: create + read', async () => {
    const card = await testData.createAppCard(payload)
    expect(card.id).toBeDefined()
    const found = await payload.findByID({ collection: 'app-cards', id: card.id })
    expect(found.id).toBe(card.id)
  })

  // ---- Access collections ------------------------------------------------

  it('managers: create + read', async () => {
    const manager = await testData.createManager(payload, {
      name: 'Smoke Manager',
      email: 'smoke-manager@example.com',
      password: 'password123',
    })
    expect(manager.id).toBeDefined()
    const found = await payload.findByID({ collection: 'managers', id: manager.id })
    expect(found.email).toBe('smoke-manager@example.com')
  })

  it('clients: create + read + populate manager relationship', async () => {
    const client = await testData.createClient(payload, adminUserId, { name: 'Smoke Client' })
    expect(client.id).toBeDefined()
    const found = await payload.findByID({ collection: 'clients', id: client.id, depth: 1 })
    expect(found.name).toBe('Smoke Client')
    expect(found.primaryContact).toBeTypeOf('object')
  })
})
