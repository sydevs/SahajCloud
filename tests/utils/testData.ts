import type { Payload, TypedUser } from 'payload'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import type {
  Narrator,
  Image,
  Meditation,
  Music,
  Album,
  Frame,
  Manager,
  Client,
  MeditationTag,
  MusicTag,
  ImageTag,
  PageTag,
  Page,
  Lesson,
  File,
  Author,
  Lecture,
} from '@/payload-types'
import type { ManagerRole, ClientRole } from '@/types/roles'

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
  ): Promise<Image> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    // Convert Buffer to Uint8Array for compatibility with file-type library
    const fileData = new Uint8Array(fileBuffer)

    return (await payload.create({
      collection: 'images',
      data: {
        alt: 'Test image file',
        ...overrides,
      },
      file: {
        data: fileData as unknown as Buffer,
        mimetype: `image/${path.extname(sampleFile).slice(1)}`,
        name: sampleFile,
        size: fileData.length,
      },
    })) as Image
  },

  /**
   * Create an album using sample image file
   */
  async createAlbum(
    payload: Payload,
    overrides: Partial<Album> = {},
    sampleFile = 'image-1050x700.jpg',
  ): Promise<Album> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    // Convert Buffer to Uint8Array for compatibility with file-type library
    const fileData = new Uint8Array(fileBuffer)

    // Generate unique title to avoid collisions
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultTitle = overrides.title || `Test Album ${uniqueId}`
    const defaultArtist = overrides.artist || 'Test Artist'

    return (await payload.create({
      collection: 'albums',
      data: {
        title: defaultTitle,
        artist: defaultArtist,
        ...overrides,
      },
      file: {
        data: fileData as unknown as Buffer,
        mimetype: `image/${path.extname(sampleFile).slice(1)}`,
        name: sampleFile,
        size: fileData.length,
      },
    })) as Album
  },

  /**
   * Create a File using sample audio file
   * Note: Files collection only accepts audio/video/PDF (no images)
   */
  async createFile(
    payload: Payload,
    overrides = {},
    sampleFile = 'audio-42s.mp3',
  ): Promise<File> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    // Convert Buffer to Uint8Array for compatibility with file-type library
    const fileData = new Uint8Array(fileBuffer)

    // Determine MIME type based on extension
    const extension = path.extname(sampleFile).slice(1).toLowerCase()
    let mimetype: string
    if (extension === 'mp3') {
      mimetype = 'audio/mpeg'
    } else if (extension === 'wav') {
      mimetype = 'audio/wav'
    } else if (extension === 'mp4') {
      mimetype = 'video/mp4'
    } else if (extension === 'webm') {
      mimetype = 'video/webm'
    } else if (extension === 'mov') {
      mimetype = 'video/mpeg'
    } else if (extension === 'pdf') {
      mimetype = 'application/pdf'
    } else {
      mimetype = `audio/${extension}` // Default to audio
    }

    return (await payload.create({
      collection: 'files',
      data: {
        ...overrides,
      },
      file: {
        data: fileData as unknown as Buffer,
        mimetype,
        name: sampleFile,
        size: fileData.length,
      },
    })) as File
  },

  /**
   * Create a meditation tag (upload collection with SVG icon)
   * Note: SVG files need Buffer (not Uint8Array) for detectSvgFromXml to work
   */
  async createMeditationTag(
    payload: Payload,
    overrides: Partial<MeditationTag> = {},
    sampleFile = 'icon-test.svg',
  ): Promise<MeditationTag> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)

    // Generate unique filename to avoid collisions
    const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substring(7)}_${sampleFile}`

    // Generate unique title suffix if no title override provided
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultTitle = overrides.title || `Test Tag ${uniqueId}`

    return (await payload.create({
      collection: 'meditation-tags',
      data: {
        title: defaultTitle,
        color: '#FF5733',
        ...overrides,
      },
      file: {
        // Use Buffer directly - SVG detection requires Buffer.toString(encoding, start, end)
        data: fileBuffer,
        mimetype: 'image/svg+xml',
        name: uniqueFilename,
        size: fileBuffer.length,
      },
    })) as MeditationTag
  },

  /**
   * Create a music tag (upload collection with SVG icon)
   * Note: SVG files need Buffer (not Uint8Array) for detectSvgFromXml to work
   */
  async createMusicTag(
    payload: Payload,
    overrides: Partial<MusicTag> = {},
    sampleFile = 'icon-test.svg',
  ): Promise<MusicTag> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)

    // Generate unique filename to avoid collisions
    const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substring(7)}_${sampleFile}`

    // Generate unique title suffix if no title override provided
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultTitle = overrides.title || `Test Music Tag ${uniqueId}`

    return (await payload.create({
      collection: 'music-tags',
      data: {
        title: defaultTitle,
        ...overrides,
      },
      file: {
        // Use Buffer directly - SVG detection requires Buffer.toString(encoding, start, end)
        data: fileBuffer,
        mimetype: 'image/svg+xml',
        name: uniqueFilename,
        size: fileBuffer.length,
      },
    })) as MusicTag
  },

  /**
   * Create an image tag
   */
  async createImageTag(payload: Payload, overrides: Partial<ImageTag> = {}): Promise<ImageTag> {
    return (await payload.create({
      collection: 'image-tags',
      data: {
        title: 'Test Image Tag',
        ...overrides,
      },
    })) as ImageTag
  },

  /**
   * Create a page tag
   */
  async createPageTag(payload: Payload, overrides: Partial<PageTag> = {}): Promise<PageTag> {
    return (await payload.create({
      collection: 'page-tags',
      data: {
        title: 'Test Page Tag',
        ...overrides,
      },
    })) as PageTag
  },

  /**
   * Create a meditation with direct audio upload
   */
  async createMeditation(
    payload: Payload,
    deps?: { narrator?: number; thumbnail?: number },
    overrides: Partial<Meditation> = {},
    sampleFile = 'audio-42s.mp3',
  ): Promise<Meditation> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    // Convert Buffer to Uint8Array for compatibility with file-type library
    const fileData = new Uint8Array(fileBuffer)

    // Create dependencies if not provided
    let thumbnail = deps?.thumbnail
    let narrator = deps?.narrator

    if (!thumbnail) {
      const thumbMedia = await testData.createMediaImage(
        payload,
        {
          alt: 'Meditation thumbnail',
          hidden: false, // Explicitly ensure it's not hidden
        },
        'image-1050x700.webp',
      ) // Use landscape image
      thumbnail = thumbMedia.id
    }

    if (!narrator) {
      const defaultNarrator = await testData.createNarrator(payload, { name: 'Test Narrator' })
      narrator = defaultNarrator.id
    }

    // Generate unique title to avoid slug collisions
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultTitle = `Test Meditation ${uniqueId}`

    return (await payload.create({
      collection: 'meditations',
      data: {
        label: overrides.label || overrides.title || defaultTitle,
        title: overrides.title || defaultTitle,
        durationMinutes: overrides.durationMinutes || 15,
        thumbnail: thumbnail,
        narrator: narrator,
        tags: overrides.tags || [],
        locale: overrides.locale || 'en',
        ...overrides,
      },
      file: {
        data: fileData as unknown as Buffer,
        mimetype:
          path.extname(sampleFile).slice(1) === 'mp3'
            ? 'audio/mpeg'
            : `audio/${path.extname(sampleFile).slice(1)}`,
        name: sampleFile,
        size: fileData.length,
      },
    })) as Meditation
  },

  /**
   * Create music track using sample audio file
   * @param payload - Payload instance
   * @param overrides - Optional field overrides (including album)
   * @param sampleFile - Sample audio file to use
   */
  async createMusic(
    payload: Payload,
    overrides: Partial<Music> & { album?: number | Album } = {},
    sampleFile = 'audio-42s.mp3',
  ): Promise<Music> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    // Convert Buffer to Uint8Array for compatibility with file-type library
    const fileData = new Uint8Array(fileBuffer)

    // Extract album from overrides or create a default one
    let albumId: number
    if (overrides.album) {
      albumId = typeof overrides.album === 'object' ? overrides.album.id : overrides.album
    } else {
      const defaultAlbum = await testData.createAlbum(payload, { title: 'Default Test Album' })
      albumId = defaultAlbum.id
    }

    // Generate unique title to avoid collisions
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultTitle = overrides.title || `Test Music Track ${uniqueId}`

    // Prepare data without album (will add it separately to ensure correct type)
    const { album: _album, ...restOverrides } = overrides

    return (await payload.create({
      collection: 'music',
      data: {
        title: defaultTitle,
        album: albumId,
        ...restOverrides,
      },
      file: {
        data: fileData as unknown as Buffer,
        mimetype:
          path.extname(sampleFile).slice(1) === 'mp3'
            ? 'audio/mpeg'
            : `audio/${path.extname(sampleFile).slice(1)}`,
        name: sampleFile,
        size: fileData.length,
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
    // Convert Buffer to Uint8Array for compatibility with file-type library
    const fileData = new Uint8Array(fileBuffer)

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
        data: fileData as unknown as Buffer,
        mimetype: mimetype,
        name: sampleFile,
        size: fileData.length,
      },
    })) as Frame
  },

  /**
   * Create a manager with default roles
   * @param payload - Payload instance
   * @param overrides - Optional field overrides
   * @example
   * // Create admin manager
   * await createManager(payload, { type: 'admin' })
   * // Create regular manager
   * await createManager(payload, { type: 'manager' })
   * // Create inactive manager
   * await createManager(payload, { type: 'inactive' })
   * // Create translator manager with array (auto-localized for English)
   * await createManager(payload, { roles: ['translator'] })
   * // Create translator manager with localized object
   * await createManager(payload, { roles: { en: ['translator'], cs: ['translator'] } })
   */
  async createManager(
    payload: Payload,
    overrides: Partial<Omit<Manager, 'roles'>> & {
      roles?: ManagerRole[] | { en?: string[]; cs?: string[] } | null
    } = {},
  ) {
    const testEmail = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Handle roles field - when creating with locale='en', pass array directly
    let rolesData: ManagerRole[] = [] // Default: empty roles array (will be localized by Payload)
    if (overrides.roles) {
      if (Array.isArray(overrides.roles)) {
        // Simple array - Payload will localize it for the specified locale
        rolesData = overrides.roles
      } else {
        // Localized object - extract English roles for locale='en' create
        rolesData = (overrides.roles.en || []) as ManagerRole[]
      }
    }

    const manager = await payload.create({
      collection: 'managers',
      locale: 'en', // Create with English locale - roles will be auto-localized
      data: {
        name: 'Test Manager',
        email: `${testEmail}@example.com`,
        password: 'password123',
        type: 'manager', // Default to 'manager' type
        ...overrides,
        roles: rolesData, // Pass array directly, Payload handles localization
      },
    })

    return {
      collection: 'managers',
      ...manager,
    } as Manager & { collection: 'managers' }
  },

  /**
   * Create an API client with specific permissions
   * @param payload - Payload instance
   * @param managerId - Manager user ID (required)
   * @param overrides - Optional field overrides
   */
  async createClient(payload: Payload, managerId: number, overrides: Partial<Client> = {}) {
    const client = await payload.create({
      collection: 'clients',
      data: {
        name: 'Test Client',
        managers: [managerId],
        primaryContact: managerId,
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
    // Generate unique title to avoid slug collisions
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultTitle = `Test Page ${uniqueId}`

    return (await payload.create({
      collection: 'pages',
      data: {
        title: overrides.title || defaultTitle,
        tags: [],
        content: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                version: 1,
                children: [
                  {
                    type: 'text',
                    version: 1,
                    text: 'Test content',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                  },
                ],
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
   * Create a lesson with audio file
   */
  async createLesson(payload: Payload, overrides: Partial<Lesson> = {}): Promise<Lesson> {
    // Create a default meditation if not provided
    let meditation = overrides.meditation
    if (!meditation) {
      const defaultMeditation = await testData.createMeditation(payload)
      meditation = defaultMeditation.id
    }

    // Icon is optional in test environment
    const icon = overrides.icon

    // Create a default image if panels need images and they're not provided
    let defaultImage: Image | undefined
    if (!overrides.panels || overrides.panels.length === 0) {
      defaultImage = await testData.createMediaImage(payload)
    }

    // Ensure panels have the correct structure with blockType
    // First panel must be a CoverStoryBlock
    const panelsData = overrides.panels || [
      {
        blockType: 'cover' as const,
        title: 'Test Lesson Title',
        quote: 'Test quote from Shri Mataji',
      },
      {
        blockType: 'text' as const,
        title: 'Default Panel',
        text: 'Default panel text',
        image: defaultImage?.id,
      },
    ]

    // Add blockType to panels if missing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedPanels = panelsData.map((panel: any) => {
      if (!panel.blockType) {
        // Default to text block if it has title/text/image fields
        if ('title' in panel || 'text' in panel || 'image' in panel) {
          return { ...panel, blockType: 'text' as const }
        }
        // Default to video block if it has video field
        if ('video' in panel) {
          return { ...panel, blockType: 'video' as const }
        }
      }
      return panel
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lessonData: any = {
      title: overrides.title || 'Test Lesson',
      unit: overrides.unit || 'Unit 1',
      step: overrides.step || 1,
      panels: formattedPanels,
      meditation: typeof meditation === 'number' ? meditation : meditation?.id,
      introAudio: overrides.introAudio || undefined,
      introSubtitles: overrides.introSubtitles || undefined,
      article: overrides.article || undefined,
    }

    // Only add icon if provided
    if (icon) {
      lessonData.icon = icon
    }

    const lesson = (await payload.create({
      collection: 'lessons',
      data: lessonData,
      depth: 0, // Prevent auto-population of relationships
    })) as Lesson

    return lesson
  },

  /**
   * Create an author
   */
  async createAuthor(payload: Payload, overrides: Partial<Author> = {}): Promise<Author> {
    return (await payload.create({
      collection: 'authors',
      data: {
        name: 'Test Author',
        ...overrides,
      },
    })) as Author
  },

  /**
   * Create a lecture (requires thumbnail)
   */
  async createLecture(
    payload: Payload,
    deps?: { thumbnail?: number },
    overrides: Partial<Lecture> = {},
  ): Promise<Lecture> {
    let thumbnail = deps?.thumbnail
    if (!thumbnail) {
      const thumbMedia = await testData.createMediaImage(payload)
      thumbnail = thumbMedia.id
    }
    return (await payload.create({
      collection: 'lectures',
      data: {
        title: 'Test Lecture',
        thumbnail,
        videoUrl: 'https://example.com/video.mp4',
        ...overrides,
      },
    })) as Lecture
  },

  // Alias for createManager to maintain backward compatibility with tests
  async createUser(payload: Payload, overrides: Partial<Manager> = {}) {
    return this.createManager(payload, overrides)
  },

  /**
   * Create a dummy user for testing access control
   * @param collection - Collection type ('managers' or 'clients')
   * @param overrides - Optional field overrides
   * @example
   * // Create dummy admin manager
   * dummyUser('managers', { type: 'admin' })
   * // Create dummy manager
   * dummyUser('managers', { type: 'manager' })
   * // Create dummy inactive manager
   * dummyUser('managers', { type: 'inactive' })
   * // Create dummy translator with permissions
   * dummyUser('managers', {
   *   type: 'manager',
   *   roles: { en: ['translator'] },
   *   permissions: { pages: ['read', 'translate'], projects: ['wemeditate-web'] }
   * })
   */
  dummyUser(collection: 'managers' | 'clients', overrides: Partial<Manager | Client> = {}) {
    // Handle roles field based on collection type
    let defaultRoles: ManagerRole[] | ClientRole[] | { en: string[] }
    if (collection === 'managers') {
      // Managers have localized roles
      defaultRoles = overrides.roles || { en: [] }
    } else {
      // Clients have non-localized roles
      defaultRoles = overrides.roles || []
    }

    const baseUser = {
      collection,
      roles: defaultRoles,
      permissions: {}, // Empty permissions - will be computed from roles
      ...overrides,
    }

    // Add type field for managers
    if (collection === 'managers') {
      return {
        ...baseUser,
        type: 'manager', // Default to 'manager' type
        ...overrides, // Allow overriding type
      } as TypedUser
    }

    return baseUser as TypedUser
  },
}
