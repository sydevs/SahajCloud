import type { Payload, TypedUser } from 'payload'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type {
  Narrator,
  Media,
  Meditation,
  Music,
  Frame,
  Manager,
  Client,
  MeditationTag,
  MediaTag,
  Page,
  LessonUnit,
  Lesson,
} from '@/payload-types'
import { TEST_ADMIN_ID } from './testHelpers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SAMPLE_FILES_DIR = path.join(__dirname, '../files')

/**
 * Test data factory functions for creating test entities with payload.create()
 */
export const testData = {
  /**
   * Create a narrator
   */
  async createNarrator(payload: Payload, overrides = {}): Promise<Narrator> {
    return (await payload.create({
      collection: 'narrators',
      data: {
        name: 'Test Narrator',
        gender: 'male' as const,
        ...overrides,
      },
    })) as Narrator
  },

  /**
   * Create image media using sample file
   */
  async createMediaImage(
    payload: Payload,
    overrides = {},
    sampleFile = 'image-1050x700.jpg',
  ): Promise<Media> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)

    // Convert Buffer to Uint8Array for file-type compatibility
    const uint8Array = new Uint8Array(fileBuffer)

    return (await payload.create({
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
      },
    })) as Media
  },

  /**
   * Create a tag
   */
  async createMeditationTag(
    payload: Payload,
    overrides: Partial<MeditationTag> = {},
  ): Promise<MeditationTag> {
    return (await payload.create({
      collection: 'meditation-tags',
      data: {
        name: 'test-tag',
        title: 'Test Tag',
        ...overrides,
      },
    })) as MeditationTag
  },

  /**
   * Create a tag
   */
  async createMusicTag(
    payload: Payload,
    overrides: Partial<MeditationTag> = {},
  ): Promise<MeditationTag> {
    return (await payload.create({
      collection: 'music-tags',
      data: {
        name: 'test-tag',
        title: 'Test Tag',
        ...overrides,
      },
    })) as MeditationTag
  },

  /**
   * Create a tag
   */
  async createMediaTag(payload: Payload, overrides: Partial<MediaTag> = {}): Promise<MediaTag> {
    return (await payload.create({
      collection: 'media-tags',
      data: {
        name: 'test-tag',
        ...overrides,
      },
    })) as MediaTag
  },

  /**
   * Create a meditation with direct audio upload
   */
  async createMeditation(
    payload: Payload,
    deps: { narrator: string; thumbnail: string },
    overrides = {},
    sampleFile = 'audio-42s.mp3',
  ): Promise<Meditation> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)

    // Convert Buffer to Uint8Array for file-type compatibility
    const uint8Array = new Uint8Array(fileBuffer)

    return (await payload.create({
      collection: 'meditations',
      data: {
        title: 'Test Meditation with Audio',
        duration: 15,
        thumbnail: deps.thumbnail,
        narrator: deps.narrator,
        tags: [],
        locale: 'en',
        ...overrides,
      },
      file: {
        data: uint8Array as any, // Type assertion for Payload compatibility
        mimetype:
          path.extname(sampleFile).slice(1) === 'mp3'
            ? 'audio/mpeg'
            : `audio/${path.extname(sampleFile).slice(1)}`,
        name: sampleFile,
        size: uint8Array.length,
      },
    })) as Meditation
  },

  /**
   * Create music track using sample audio file
   */
  async createMusic(
    payload: Payload,
    overrides = {},
    sampleFile = 'audio-42s.mp3',
  ): Promise<Music> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)

    // Convert Buffer to Uint8Array for file-type compatibility
    const uint8Array = new Uint8Array(fileBuffer)

    return (await payload.create({
      collection: 'music',
      data: {
        title: 'Test Music Track',
        credit: 'Test Artist',
        ...overrides,
      },
      file: {
        data: uint8Array as any, // Type assertion for Payload compatibility
        mimetype:
          path.extname(sampleFile).slice(1) === 'mp3'
            ? 'audio/mpeg'
            : `audio/${path.extname(sampleFile).slice(1)}`,
        name: sampleFile,
        size: uint8Array.length,
      },
    })) as Music
  },

  /**
   * Create frame with image file (default) or video file
   */
  async createFrame(
    payload: Payload,
    overrides = {},
    sampleFile = 'image-1050x700.jpg',
  ): Promise<Frame> {
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

    return (await payload.create({
      collection: 'frames',
      data: {
        imageSet: 'male' as const,
        category: 'mooladhara' as const,
        ...overrides,
      },
      file: {
        data: uint8Array as any, // Type assertion for Payload compatibility
        mimetype: mimetype,
        name: sampleFile,
        size: uint8Array.length,
      },
    })) as Frame
  },

  /**
   * Create a manager with default admin privileges
   */
  async createManager(payload: Payload, overrides: Partial<Manager> = {}) {
    const testEmail = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`

    const manager = await payload.create({
      collection: 'managers',
      data: {
        name: 'Test Manager',
        email: `${testEmail}@example.com`,
        password: 'password123',
        active: true,
        admin: false,
        ...overrides,
      },
    })

    return {
      collection: 'managers',
      ...manager,
    } as Manager & { collection: 'managers' }
  },

  /**
   * Create an API client with specific permissions
   */
  async createClient(payload: Payload, overrides: Partial<Client> = {}) {
    const client = await payload.create({
      collection: 'clients',
      data: {
        name: 'Test Client',
        managers: [TEST_ADMIN_ID],
        primaryContact: TEST_ADMIN_ID,
        enableAPIKey: true,
        ...overrides,
      },
    })

    return {
      collection: 'clients',
      ...client,
    } as Client & { collection: 'clients' }
  },

  /**
   * Create a page
   */
  async createPage(payload: Payload, overrides: Partial<Page> = {}): Promise<Page> {
    return (await payload.create({
      collection: 'pages',
      data: {
        title: 'Test Page',
        category: 'knowledge',
        tags: ['wisdom'],
        content: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                version: 1,
                children: [{
                  type: 'text',
                  version: 1,
                  text: 'Test content',
                  format: 0,
                  detail: 0,
                  mode: 'normal',
                  style: '',
                }],
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
          },
        },
        ...overrides,
      },
    })) as Page
  },

  /**
   * Create a lesson unit
   */
  async createLessonUnit(payload: Payload, overrides: Partial<LessonUnit> = {}): Promise<LessonUnit> {
    return (await payload.create({
      collection: 'lesson-units',
      data: {
        title: 'Test Lesson Unit',
        color: '#FF0000',
        ...overrides,
      },
    })) as LessonUnit
  },

  /**
   * Create a lesson with audio file
   */
  async createLesson(payload: Payload, overrides: Partial<Lesson> = {}, sampleFile = 'audio-42s.mp3'): Promise<Lesson> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    const uint8Array = new Uint8Array(fileBuffer)

    // Create a default media if panels need images and they're not provided
    let defaultMedia: Media | undefined
    if (!overrides.panels || overrides.panels.length === 0) {
      defaultMedia = await testData.createMediaImage(payload)
    }

    const panelsData = overrides.panels || [
      {
        title: 'Default Panel',
        text: 'Default panel text',
        image: defaultMedia!.id,
      },
    ]

    return (await payload.create({
      collection: 'lessons',
      data: {
        title: 'Test Lesson',
        color: '#00FF00',
        order: 0,
        ...overrides,
        panels: panelsData,
        file: {
          data: uint8Array,
          mimetype: 'audio/mpeg',
          name: sampleFile,
          size: uint8Array.length,
        },
      },
    })) as Lesson
  },

  dummyUser(collection: 'managers' | 'clients', overrides: Partial<Manager | Client> = {}) {
    return {
      collection,
      admin: false,
      active: true,
      permissions: [],
      ...overrides,
    } as TypedUser
  },
}
