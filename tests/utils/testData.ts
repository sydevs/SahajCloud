import type { CollectionSlug, Payload, RequiredDataFromCollectionSlug, TypedUser } from 'payload'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import type { LocaleCode } from '@/lib/locales'
import type {
  AppCard,
  Narrator,
  Image,
  Meditation,
  Song,
  Album,
  Frame,
  Manager,
  Client,
  UserChoice,
  SubtleSystemNode,
  SongTag,
  Audience,
  Page,
  Lesson,
  File,
  Video,
  Author,
  Lecture,
  Event,
  Region,
  RoleSlug,
} from '@/payload-types'

/**
 * The manager-specific role subset.
 *
 * `@/payload-types` exports only the combined `RoleSlug` — all seven roles, which
 * the access plugin injects into the generated JSON schema — so this is derived
 * from the collection's own `roles` field and tracks it automatically.
 */
type ManagerRole = NonNullable<Manager['roles']>[number]

/**
 * Overrides for `dummyUser` — a hand-built mock auth user, not a real document.
 *
 * `roles` is declared apart from the generated doc types because manager roles
 * are **localized**: at runtime they arrive as a per-locale record, which is the
 * shape `filterAvailableLocales` reads, while Payload generates the field as a
 * flat array. Intersecting `{ roles?: … }` onto the doc type wouldn't override
 * that array, it would intersect with it — so `roles` is `Omit`ted from the doc
 * fields first. Locale keys are optional: a manager only has entries for locales
 * they hold a role in, and both readers already treat an absent key as "no roles"
 * (`extractRoles` does `roles[locale] || []`).
 */
type DummyUserOverrides = Partial<Omit<Manager, 'roles'> | Omit<Client, 'roles'>> & {
  roles?: RoleSlug[] | Partial<Record<LocaleCode, RoleSlug[]>>
}

/**
 * Checks a test factory's `create` payload, then hands it to `payload.create` at
 * the type that operation wants.
 *
 * Payload derives `create`'s `data` type from the generated *output* doc type, so
 * every field carrying a `defaultValue` or a value-filling hook is typed as
 * **required** even though Payload supplies it when omitted — `slug` (via
 * `slugField`), `appCards.default.aspectRatio`, `userChoices.type`, and more.
 * Factories additionally spread `Partial<Doc>` overrides into `data`, which
 * re-widens genuinely-required keys to `T | undefined`.
 *
 * So the payload is modelled as partial: Payload fills the remainder, and its own
 * validation — exercised by the int lane — is what enforces truly-required fields.
 * What `tsc` still checks here, and the reason this seam exists, is that every
 * field a test *does* pass is a real field of that collection with a valid type.
 * That's the rot #606 is about: a renamed field or a stale enum literal (say
 * `level: 'center'` after #605) now fails instantly instead of after a 7-minute
 * CI round.
 */
function createData<TSlug extends CollectionSlug>(
  data: Partial<RequiredDataFromCollectionSlug<TSlug>>,
): RequiredDataFromCollectionSlug<TSlug> {
  return data as RequiredDataFromCollectionSlug<TSlug>
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SAMPLE_FILES_DIR = path.join(__dirname, '../files')

/**
 * Creates minimal Lexical rich text content for testing
 * @param text - The text content to include
 * @returns Lexical root structure compatible with PayloadCMS richText fields
 */
export function createTestLexicalContent(text: string = 'Test content') {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text }],
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

/**
 * Test data factory functions for creating test entities with payload.create()
 */
export const testData = {
  /**
   * Create an app card with image relationship
   */
  async createAppCard(payload: Payload, overrides: Partial<AppCard> = {}): Promise<AppCard> {
    const uniqueId = Math.random().toString(36).substring(7)
    const { default: defaultOverrides, ...restOverrides } = overrides

    const defaultTitle = (defaultOverrides as { title?: string })?.title || `Test Card ${uniqueId}`

    // Create image for the card unless a default.image is already provided
    const providedImage = (defaultOverrides as { image?: number | object | null })?.image
    let imageId: number
    if (providedImage && typeof providedImage === 'number') {
      imageId = providedImage
    } else {
      const img = await testData.createMediaImage(payload, { alt: 'App card image' })
      imageId = img.id
    }

    return (await payload.create({
      collection: 'app-cards',
      data: createData<'app-cards'>({
        label: `Test Card ${uniqueId}`,
        type: 'standard',
        ...restOverrides,
        default: {
          title: defaultTitle,
          header: 'Test Header',
          textColor: 'black',
          image: imageId,
          // `default` is a nested group, so `createData`'s top-level `Partial`
          // doesn't reach inside it — and both of these are `required: true` with
          // a `defaultValue` in AppCards. Pass the collection's own declared
          // defaults, which is what Payload would have filled in anyway.
          aspectRatio: 'square',
          alignment: 'center',
          ...defaultOverrides,
        },
      }),
    })) as AppCard
  },

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
   * Create an album with artwork image relationship
   */
  async createAlbum(payload: Payload, overrides: Partial<Album> = {}): Promise<Album> {
    // Generate unique title to avoid collisions
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultTitle = overrides.title || `Test Album ${uniqueId}`
    const defaultArtist = overrides.artist || 'Test Artist'

    // Create image for artwork unless already provided
    let artworkId = overrides.artwork
    if (!artworkId || typeof artworkId === 'object') {
      const img = await testData.createMediaImage(payload, { alt: 'Album artwork' })
      artworkId = img.id
    }

    return (await payload.create({
      collection: 'albums',
      data: {
        title: defaultTitle,
        artist: defaultArtist,
        artwork: artworkId,
        ...overrides,
      },
    })) as Album
  },

  /**
   * Create a File using sample file
   * Note: Files collection accepts audio, video, PDF, and images (jpeg, png, webp)
   */
  async createFile(payload: Payload, overrides = {}, sampleFile = 'audio-42s.mp3'): Promise<File> {
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
    } else if (extension === 'jpg' || extension === 'jpeg') {
      mimetype = 'image/jpeg'
    } else if (extension === 'png') {
      mimetype = 'image/png'
    } else if (extension === 'webp') {
      mimetype = 'image/webp'
    } else if (extension === 'vtt') {
      mimetype = 'text/vtt'
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
  async createUserChoice(
    payload: Payload,
    overrides: Partial<UserChoice> = {},
    sampleFile = 'icon-test.svg',
  ): Promise<UserChoice> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)

    // Generate unique filename to avoid collisions
    const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substring(7)}_${sampleFile}`

    // Generate unique title suffix if no title override provided
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultTitle = overrides.title || `Test Choice ${uniqueId}`

    return (await payload.create({
      collection: 'user-choices',
      data: createData<'user-choices'>({
        title: defaultTitle,
        color: '#FF5733',
        ...overrides,
      }),
      file: {
        // Use Buffer directly - SVG detection requires Buffer.toString(encoding, start, end)
        data: fileBuffer,
        mimetype: 'image/svg+xml',
        name: uniqueFilename,
        size: fileBuffer.length,
      },
    })) as UserChoice
  },

  /**
   * Create a SubtleSystemNode (chakra/nadi metadata) along with a placeholder Page.
   *
   * Picks an unused slug from the closed 12-element enum each call to allow
   * multiple nodes per test. Pass `slug` in overrides to pin a specific value
   * (e.g. when seeding a known node for backfill testing).
   */
  async createSubtleSystemNode(
    payload: Payload,
    deps: { page?: number } = {},
    overrides: Partial<SubtleSystemNode> = {},
  ): Promise<SubtleSystemNode> {
    const NODE_SLUGS = [
      'mooladhara',
      'swadhistan',
      'nabhi',
      'void',
      'anahat',
      'vishuddhi',
      'agnya',
      'sahasrara',
      'kundalini',
      'pingala',
      'ida',
      'sushumna',
    ] as const

    let pageId = deps.page
    if (pageId === undefined) {
      const placeholder = await testData.createPage(payload)
      pageId = placeholder.id
    }

    let slug = (overrides.slug as (typeof NODE_SLUGS)[number] | undefined) ?? null
    if (!slug) {
      const existing = await payload.find({
        collection: 'subtle-system-nodes',
        select: { slug: true },
        limit: NODE_SLUGS.length,
        depth: 0,
      })
      const taken = new Set(existing.docs.map((d) => d.slug))
      const available = NODE_SLUGS.find((s) => !taken.has(s))
      if (!available) {
        throw new Error('No SubtleSystemNode slugs available — all 12 enum values are taken')
      }
      slug = available
    }

    return (await payload.create({
      collection: 'subtle-system-nodes',
      data: {
        slug,
        page: pageId,
        ...overrides,
      },
    })) as SubtleSystemNode
  },

  /**
   * Create a song tag (upload collection with SVG icon)
   * Note: SVG files need Buffer (not Uint8Array) for detectSvgFromXml to work
   */
  async createSongTag(
    payload: Payload,
    overrides: Partial<SongTag> = {},
    sampleFile = 'icon-test.svg',
  ): Promise<SongTag> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)

    // Generate unique filename to avoid collisions
    const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substring(7)}_${sampleFile}`

    // Generate unique title suffix if no title override provided
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultTitle = overrides.title || `Test Song Tag ${uniqueId}`

    return (await payload.create({
      collection: 'song-tags',
      data: createData<'song-tags'>({
        title: defaultTitle,
        ...overrides,
      }),
      file: {
        // Use Buffer directly - SVG detection requires Buffer.toString(encoding, start, end)
        data: fileBuffer,
        mimetype: 'image/svg+xml',
        name: uniqueFilename,
        size: fileBuffer.length,
      },
    })) as SongTag
  },

  /**
   * Create an audience with optional progress ranges and/or country gate.
   * All fields are optional — omit a range to leave it unbounded; omit
   * country to match all countries.
   */
  async createAudience(payload: Payload, overrides: Partial<Audience> = {}): Promise<Audience> {
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultLabel = overrides.label || `Test Audience ${uniqueId}`

    return (await payload.create({
      collection: 'audiences',
      data: {
        label: defaultLabel,
        ...overrides,
      },
    })) as Audience
  },

  // Note: createImageTag, createPageTag, createVideoTag removed
  // These tags are now inline enum select values, not separate collections

  /**
   * Create a video with file upload
   * Note: In test environment without Cloudflare Stream, uses local storage
   */
  async createVideo(
    payload: Payload,
    overrides: Partial<Video> = {},
    sampleFile = 'video-30s.mp4',
  ): Promise<Video> {
    const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
    const fileBuffer = fs.readFileSync(filePath)
    // Convert Buffer to Uint8Array for compatibility with file-type library
    const fileData = new Uint8Array(fileBuffer)

    // Determine MIME type based on extension
    const extension = path.extname(sampleFile).slice(1).toLowerCase()
    let mimetype: string
    if (extension === 'mp4') {
      mimetype = 'video/mp4'
    } else if (extension === 'webm') {
      mimetype = 'video/webm'
    } else if (extension === 'mov') {
      mimetype = 'video/quicktime'
    } else {
      mimetype = `video/${extension}`
    }

    // Generate unique title to avoid collisions
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultTitle = overrides.title || `Test Video ${uniqueId}`

    return (await payload.create({
      collection: 'videos',
      data: {
        title: defaultTitle,
        tags: 'testimonial', // Default tag for required field (single select, not hasMany)
        ...overrides,
      },
      file: {
        data: fileData as unknown as Buffer,
        mimetype,
        name: sampleFile,
        size: fileData.length,
      },
    })) as Video
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

    // Unique label keeps the upload filename / internal name collision-free.
    // `title` is now a virtual field, so a `title` override is mapped onto
    // `label` (the stored, queryable identifier) rather than written directly.
    const uniqueId = Math.random().toString(36).substring(7)
    const defaultLabel = `Test Meditation ${uniqueId}`

    return (await payload.create({
      collection: 'meditations',
      // locale option provides request-level locale context for join subqueries
      // that reference localized fields on other collections (e.g., user-choices)
      locale: overrides.locale || 'en',
      data: {
        label: overrides.label || overrides.title || defaultLabel,
        thumbnail: thumbnail,
        narrator: narrator,
        locale: overrides.locale || 'en',
        type: overrides.type || 'daily', // Default to 'daily' type
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
   * Create song track using sample audio file
   * @param payload - Payload instance
   * @param overrides - Optional field overrides (including album)
   * @param sampleFile - Sample audio file to use
   */
  async createSong(
    payload: Payload,
    overrides: Partial<Song> & { album?: number | Album } = {},
    sampleFile = 'audio-42s.mp3',
  ): Promise<Song> {
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
    const defaultTitle = overrides.title || `Test Song ${uniqueId}`

    // Prepare data without album (will add it separately to ensure correct type)
    const { album: _album, ...restOverrides } = overrides

    return (await payload.create({
      collection: 'songs',
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
    })) as Song
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
        label: 'Test Frame',
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

    // `collection` last: the access-control mocks in `.claude/rules/tests.md`
    // require the discriminator, so it must not be spreadable-away.
    return { ...manager, collection: 'managers' as const }
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
        _status: 'published', // Published = active (publish/unpublish is the auth gate)
        ...overrides,
      },
    })

    return { ...client, collection: 'clients' as const }
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
      data: createData<'pages'>({
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
      }),
    })) as Page
  },

  /**
   * Create a lesson with panels.
   *
   * `meditation` accepts either a bare id (shorthand for a meditation link) or
   * an explicit polymorphic `{ relationTo, value }` wrapper — pass
   * `{ relationTo: 'videos', value: id }` to link a video instead. Both are
   * normalized to the polymorphic shape the field now stores.
   */
  async createLesson(
    payload: Payload,
    overrides: Omit<Partial<Lesson>, 'meditation'> & {
      meditation?: number | Lesson['meditation']
    } = {},
  ): Promise<Lesson> {
    // Create a default meditation if not provided
    // Note: Lessons collection filters meditations by type='lesson'
    let meditation = overrides.meditation
    if (meditation == null) {
      const defaultMeditation = await testData.createMeditation(payload, undefined, {
        type: 'lesson',
      })
      meditation = defaultMeditation.id
    }
    const meditationRel =
      typeof meditation === 'number'
        ? { relationTo: 'meditations' as const, value: meditation }
        : meditation

    // Icon is required - create a default image if not provided
    let icon = overrides.icon
    if (!icon) {
      const iconImage = await testData.createMediaImage(payload)
      icon = iconImage.id
    }

    // Use provided panels or create default panels
    const panelsData = overrides.panels || [
      {
        title: 'Test Lesson Title',
        text: 'Test intro text',
      },
    ]

    const lessonData: any = {
      title: overrides.title || 'Test Lesson',
      unit: overrides.unit || 'Unit 1',
      step: overrides.step || 1,
      panels: panelsData,
      meditation: meditationRel,
      introAudio: overrides.introAudio || undefined,
      introSubtitles: overrides.introSubtitles || undefined,
      article: overrides.article || undefined,
      icon,
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
      data: createData<'authors'>({
        name: 'Test Author',
        ...overrides,
      }),
    })) as Author
  },

  /**
   * Create a lecture (bypasses the populateFromNirmalaVidya hook by providing all
   * fields directly). The `nirmalVidyaVimeoUrl` is required on the collection,
   * so it is always included — but in test environments the API client is mocked
   * via vi.mock('@/lib/lectures/nirmalaVidyaApi') in lectures.int.spec.ts.
   *
   * For tests in other spec files that call this factory without a mock, the hook
   * will still try to call `fetchNirmalaVidyaVideo`. Those tests should add
   * vi.mock('@/lib/lectures/nirmalaVidyaApi', ...) at the top of the file to prevent
   * real network calls.
   */
  async createLecture(
    payload: Payload,
    deps?: { thumbnail?: number },
    overrides: Partial<Lecture> = {},
  ): Promise<Lecture> {
    // Thumbnail is an optional editor override — only set it when the caller asks.
    const thumbnail = deps?.thumbnail
    // Generate a numeric vimeo id per call so each lecture lands on a distinct
    // Vimeo URL (the underlying NV mock keys on it). `populateFromNirmalaVidya`
    // also enforces uniqueness across full lectures.
    const uniqueVimeoId = `${Date.now()}${Math.floor(Math.random() * 1000)}`
    return (await payload.create({
      collection: 'lectures',
      data: {
        type: 'full',
        title: 'Test Lecture',
        ...(thumbnail !== undefined ? { thumbnail } : {}),
        nirmalVidyaVimeoUrl: `https://vimeo.com/${uniqueVimeoId}`,
        ...overrides,
      },
    })) as Lecture
  },

  /**
   * Create a clip Lecture (`type: 'clip'`) referencing a parent full lecture
   * via `fullLecture`, plus playback bounds.
   *
   * Pass `deps.fullLecture` to reuse an existing parent. If omitted, a new
   * parent is created via `createLecture` — requires the Nirmala Vidya API
   * mock (`vi.mock('@/lib/lectures/nirmalaVidyaApi', ...)`) to be in place.
   *
   * The clip's own `nirmalVidyaVimeoUrl` is intentionally not set: clips
   * source NV metadata from their parent (#338).
   */
  async createLectureExcerpt(
    payload: Payload,
    deps?: { fullLecture?: number },
    overrides: Partial<Lecture> = {},
  ): Promise<Lecture> {
    let fullLecture = deps?.fullLecture
    if (!fullLecture) {
      const parentLecture = await testData.createLecture(payload)
      fullLecture = parentLecture.id
    }
    return (await payload.create({
      collection: 'lectures',
      data: {
        type: 'clip',
        title: 'Test Lecture Excerpt',
        startTime: 0,
        stopTime: 60,
        fullLecture,
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
   *   roles: { en: ['web-translator'] },
   *   permissions: { pages: ['read', 'translate'], projects: ['wemeditate-web'] }
   * })
   */
  dummyUser(collection: 'managers' | 'clients', overrides: DummyUserOverrides = {}) {
    // Handle roles field based on collection type
    let defaultRoles: NonNullable<DummyUserOverrides['roles']>
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

    // Add status for clients (bypass requires _status === 'published')
    return {
      ...baseUser,
      _status: 'published', // Default to a published (active) client
      ...overrides, // Allow overriding _status
    } as TypedUser
  },

  /**
   * Create a region (city-level) for testing
   * Regions require name, level, and mapboxId (unique)
   * For manual locations, also provide latitude, longitude, and radius
   */
  async createRegion(payload: Payload, overrides: Partial<Region> = {}): Promise<Region> {
    const uniqueId = Math.random().toString(36).substring(7)
    const name = overrides.name || `Test City ${uniqueId}`
    const mapboxId = overrides.mapboxId || `manual-test-${Date.now()}-${uniqueId}`

    return (await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        name,
        level: 'city',
        mapboxId,
        // Required for manual locations (mapboxId starts with 'manual-')
        latitude: 0,
        longitude: 0,
        radius: 1000,
        ...overrides,
      }),
    })) as Region
  },

  /**
   * Create an image using sample file
   * Alias for createMediaImage for convenience in cleanup tests
   */
  async createImage(payload: Payload, overrides = {}): Promise<Image> {
    return this.createMediaImage(payload, overrides)
  },

  /**
   * Create an event with all required fields populated
   * Events require: title, languages, region, manager, schedule (with firstDate when not inactive)
   */
  async createEvent(payload: Payload, overrides: Partial<Event> = {}): Promise<Event> {
    const uniqueId = Math.random().toString(36).substring(7)

    // Create required relationships if not provided
    let managerId = overrides.manager
    if (!managerId) {
      const manager = await testData.createManager(payload)
      managerId = manager.id
    }
    if (typeof managerId === 'object') {
      managerId = managerId.id
    }

    let regionId = overrides.region
    if (!regionId) {
      const region = await testData.createRegion(payload)
      regionId = region.id
    }
    if (typeof regionId === 'object') {
      regionId = regionId.id
    }

    // Default to inactive (simplest case): no schedule required, but needs contact info
    const eventData: any = {
      title: overrides.title || `Test Event ${uniqueId}`,
      languages: overrides.languages || ['en'],
      manager: managerId,
      region: regionId,
      verificationStage: overrides.verificationStage || 'verified',
      inactive: true, // Default to inactive to avoid schedule complexity
      contactPhone: overrides.contactPhone || '+1-555-0100',
      contactName: overrides.contactName || 'Test Contact',
      ...overrides,
    }

    return (await payload.create({
      collection: 'events',
      data: eventData,
    })) as Event
  },
}
