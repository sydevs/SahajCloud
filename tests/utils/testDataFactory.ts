import type { Payload } from 'payload'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Narrator, Media, Tag, Meditation, Music, Frame, User, MeditationFrame } from '@/payload-types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SAMPLE_FILES_DIR = path.join(__dirname, '../files')

/**
 * Test data factory functions for creating test entities with payload.create()
 */
export const testDataFactory = {
  /**
   * Create a narrator
   */
  async createNarrator(payload: Payload, overrides = {}): Promise<Narrator> {
    return await payload.create({
      collection: 'narrators',
      data: {
        name: 'Test Narrator',
        gender: 'male' as const,
        ...overrides,
      },
    }) as Narrator
  },

  /**
   * Create image media using sample file
   */
  async createMediaImage(payload: Payload, overrides = {}, sampleFile = 'image-1050x700.jpg'): Promise<Media> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    
    // Convert Buffer to Uint8Array for file-type compatibility
    const uint8Array = new Uint8Array(fileBuffer)
    
    return await payload.create({
      collection: 'media',
      data: {
        alt: 'Test image file',
        ...overrides,
      },
      file: {
        data: uint8Array as any, // Type assertion for Payload compatibility
        mimetype: `image/${path.extname(sampleFile).slice(1)}`,
        name: sampleFile,
        size: uint8Array.length,
      }
    }) as Media
  },

  /**
   * Create a tag
   */
  async createTag(payload: Payload, overrides = {}): Promise<Tag> {
    return await payload.create({
      collection: 'tags',
      data: {
        title: 'Test Tag',
        ...overrides,
      },
    }) as Tag
  },

  /**
   * Create a meditation with required dependencies (without audio file)
   */
  async createMeditation(payload: Payload, deps: { narrator: string; thumbnail: string; tags?: string[]; musicTag?: string }, overrides = {}): Promise<Meditation> {
    return await payload.create({
      collection: 'meditations',
      data: {
        title: 'Test Meditation',
        duration: 15,
        thumbnail: deps.thumbnail,
        narrator: deps.narrator,
        tags: deps.tags || [],
        musicTag: deps.musicTag,
        isPublished: false,
        ...overrides,
      },
    }) as Meditation
  },

  /**
   * Create a meditation with direct audio upload
   */
  async createMeditationWithAudio(payload: Payload, deps: { narrator: string; thumbnail: string; tags?: string[]; musicTag?: string }, overrides = {}, sampleFile = 'audio-42s.mp3'): Promise<Meditation> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    
    // Convert Buffer to Uint8Array for file-type compatibility
    const uint8Array = new Uint8Array(fileBuffer)
    
    return await payload.create({
      collection: 'meditations',
      data: {
        title: 'Test Meditation with Audio',
        duration: 15,
        thumbnail: deps.thumbnail,
        narrator: deps.narrator,
        tags: deps.tags || [],
        musicTag: deps.musicTag,
        isPublished: false,
        ...overrides,
      },
      file: {
        data: uint8Array as any, // Type assertion for Payload compatibility
        mimetype: path.extname(sampleFile).slice(1) === 'mp3' ? 'audio/mpeg' : `audio/${path.extname(sampleFile).slice(1)}`,
        name: sampleFile,
        size: uint8Array.length,
      }
    }) as Meditation
  },

  /**
   * Create music track using sample audio file
   */
  async createMusic(payload: Payload, overrides = {}, sampleFile = 'audio-42s.mp3'): Promise<Music> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    
    // Convert Buffer to Uint8Array for file-type compatibility
    const uint8Array = new Uint8Array(fileBuffer)
    
    return await payload.create({
      collection: 'music',
      data: {
        title: 'Test Music Track',
        credit: 'Test Artist',
        ...overrides,
      },
      file: {
        data: uint8Array as any, // Type assertion for Payload compatibility
        mimetype: path.extname(sampleFile).slice(1) === 'mp3' ? 'audio/mpeg' : `audio/${path.extname(sampleFile).slice(1)}`,
        name: sampleFile,
        size: uint8Array.length,
      }
    }) as Music
  },

  /**
   * Create frame with image file (default) or video file
   */
  async createFrame(payload: Payload, overrides = {}, sampleFile = 'image-1050x700.jpg'): Promise<Frame> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    
    // Convert Buffer to Uint8Array for file-type compatibility
    const uint8Array = new Uint8Array(fileBuffer)
    
    // Get correct mimetype based on file extension
    const extension = path.extname(sampleFile).slice(1).toLowerCase()
    let mimetype: string
    if (['jpg', 'jpeg'].includes(extension)) {
      mimetype = 'image/jpeg'
    } else if (extension === 'png') {
      mimetype = 'image/png'
    } else if (extension === 'webp') {
      mimetype = 'image/webp'
    } else if (extension === 'gif') {
      mimetype = 'image/gif'
    } else if (extension === 'mp4') {
      mimetype = 'video/mp4'
    } else if (extension === 'webm') {
      mimetype = 'video/webm'
    } else if (extension === 'mov') {
      mimetype = 'video/quicktime'
    } else {
      mimetype = `image/${extension}`
    }
    
    return await payload.create({
      collection: 'frames',
      data: {
        name: 'Test Frame Image',
        imageSet: 'male' as const,
        ...overrides,
      },
      file: {
        data: uint8Array as any, // Type assertion for Payload compatibility
        mimetype: mimetype,
        name: sampleFile,
        size: uint8Array.length,
      }
    }) as Frame
  },

  /**
   * Create a user
   */
  async createUser(payload: Payload, overrides = {}): Promise<User> {
    return await payload.create({
      collection: 'users',
      data: {
        email: 'test@example.com',
        password: 'password123',
        ...overrides,
      },
    }) as User
  },

  /**
   * Create a meditation frame relationship
   */
  async createMeditationFrame(payload: Payload, deps: { meditation: string; frame: string }, overrides = {}): Promise<MeditationFrame> {
    return await payload.create({
      collection: 'meditationFrames',
      data: {
        meditation: deps.meditation,
        frame: deps.frame,
        timestamp: 10.5, // Default timestamp of 10.5 seconds
        ...overrides,
      },
    }) as MeditationFrame
  },
}