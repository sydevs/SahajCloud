/**
 * Storyblok Path Steps Import Script
 *
 * Imports "Path Step" lessons from Storyblok CMS into Payload CMS.
 *
 * Features:
 * - Fetches lessons from Storyblok API
 * - Idempotent: safely re-runnable (updates existing, creates new)
 * - Uses unit + step as natural key for lessons
 * - Uses videoUrl as natural key for external videos
 *
 * Usage:
 *   pnpm seed storyblok [flags]
 *
 * Flags:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 */

import type { Payload } from 'payload'

import * as path from 'path'

import {
  BaseImporter,
  BaseImportOptions,
  fetchAsset,
  MediaUploader,
  rateLimitDelay,
  readCacheText,
  TagManager,
  writeCache,
} from '../lib'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DIR = path.resolve(process.cwd(), 'seeds/cache/storyblok')

// ============================================================================
// TYPES
// ============================================================================

interface StoryblokStory {
  id: number
  uuid: string
  name: string
  slug: string
  full_slug: string
  content: Record<string, unknown>
}

interface StoryblokResponse {
  stories: StoryblokStory[]
  cv?: number
  rels?: StoryblokStory[]
}

// ============================================================================
// STORYBLOK IMPORTER CLASS
// ============================================================================

export class StoryblokImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Storyblok Path Steps'
  protected readonly cacheDir = CACHE_DIR

  private token: string
  private mediaUploader!: MediaUploader
  private tagManager!: TagManager

  // Image tag IDs
  private lessonTagId: number | null = null
  private iconTagId: number | null = null
  private thumbnailTagId: number | null = null

  // Meditation lookup cache (lowercase title → id)
  private meditationTitleCache = new Map<string, number>()

  constructor(options: BaseImportOptions, token: string) {
    super(options)
    this.token = token
  }

  // ============================================================================
  // STATIC FACTORY METHOD (for migration use)
  // ============================================================================

  /**
   * Run the importer from a PayloadCMS migration.
   * Uses the provided Payload instance instead of creating a new one.
   * Requires STORYBLOK_ACCESS_TOKEN environment variable.
   */
  static async runFromMigration(payload: Payload): Promise<void> {
    const token = process.env.STORYBLOK_ACCESS_TOKEN
    if (!token) {
      throw new Error(
        'STORYBLOK_ACCESS_TOKEN environment variable is required for Storyblok migration',
      )
    }

    const importer = new StoryblokImporter(
      {
        dryRun: false,
        clearCache: false,
        payload,
      },
      token,
    )
    await importer.run()
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  protected async setup(): Promise<void> {
    if (!this.options.dryRun) {
      this.mediaUploader = new MediaUploader(this.payload, this.logger)
      this.tagManager = new TagManager(this.payload, this.logger)

      // Pre-load existing media to avoid D1 queries during import
      // This significantly reduces database load in Workers environment
      await this.mediaUploader.preloadExistingMedia()

      await this.setupImageTags()

      // Preload collections for efficient skip/update mode
      // Note: Lessons use compound key (unit+step), so we preload with a custom cache key
      await this.preloadCollection('lectures', 'videoUrl')
      // Preload lessons by building composite key from unit + step
      await this.preloadLessonsWithCompositeKey()
      // Preload meditations for lesson relationship lookups
      await this.preloadMeditationTitles()
    }

    // Setup additional cache directories (ensureDir is a no-op in Workers mode)
    await this.fileUtils.ensureDir(path.join(this.cacheDir, 'videos'))
    await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/audio'))
    await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/images'))
    await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/videos'))
    await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/subtitles'))
  }

  /**
   * Preload lessons with composite key (unit + step) for efficient skip/update mode.
   * Since lessons use a compound natural key, we build a custom cache key.
   */
  private async preloadLessonsWithCompositeKey(): Promise<void> {
    await this.logger.info('Preloading lessons with composite key...')

    const BATCH_SIZE = 100
    let page = 1
    let hasMore = true
    let count = 0

    while (hasMore) {
      const result = await this.payload.find({
        collection: 'lessons',
        limit: BATCH_SIZE,
        page,
        depth: 0,
        select: {
          id: true,
          unit: true,
          step: true,
        },
      })

      for (const doc of result.docs) {
        // Build composite key: "Unit 1-3" for unit="Unit 1", step=3
        const compositeKey = `${doc.unit}-${doc.step}`
        // Store in preload cache with 'lessons' collection
        if (!this.preloadCache.has('lessons')) {
          this.preloadCache.set('lessons', new Map())
        }
        // Cast through unknown to PreloadedDoc (doc has id from Payload)
        this.preloadCache
          .get('lessons')!
          .set(compositeKey, { id: doc.id, unit: doc.unit, step: doc.step })
        count++
      }

      hasMore = result.hasNextPage
      page++
    }

    await this.logger.info(`✓ Preloaded ${count} lessons with composite keys`)
  }

  /**
   * Preload meditation titles for efficient lesson relationship lookups.
   * Stores lowercase titles for case-insensitive matching and prefix search.
   */
  private async preloadMeditationTitles(): Promise<void> {
    await this.logger.info('Preloading meditation titles...')

    const BATCH_SIZE = 500
    let page = 1
    let hasMore = true

    while (hasMore) {
      const result = await this.payload.find({
        collection: 'meditations',
        limit: BATCH_SIZE,
        page,
        depth: 0,
        select: { id: true, title: true },
      })

      for (const doc of result.docs) {
        if (doc.title) {
          this.meditationTitleCache.set(doc.title.toLowerCase(), doc.id as number)
        }
      }
      hasMore = result.hasNextPage
      page++
    }

    await this.logger.info(`✓ Preloaded ${this.meditationTitleCache.size} meditation titles`)
  }

  /**
   * Setup image tags for content categorization.
   * Creates tags if they don't exist and caches their IDs.
   */
  private async setupImageTags(): Promise<void> {
    await this.logger.info('Setting up image tags...')

    const [lessonId, iconId, thumbnailId] = await Promise.all([
      this.tagManager.ensureTag('image-tags', 'lesson'),
      this.tagManager.ensureTag('image-tags', 'icon'),
      this.tagManager.ensureTag('image-tags', 'thumbnail'),
    ])

    this.lessonTagId = lessonId
    this.iconTagId = iconId
    this.thumbnailTagId = thumbnailId

    await this.logger.info('✓ Image tags ready')
  }

  // ============================================================================
  // MAIN IMPORT LOGIC
  // ============================================================================

  /**
   * Reconstruct ID maps from database when resuming paginated import
   */
  protected async reconstructIdMaps(): Promise<void> {
    await this.logger.info('Reconstructing ID maps from database...')

    // For Storyblok, the main cross-document dependencies are image tags
    // These are set up in setup() method, so we just log existing counts
    const lessons = await this.payload.find({ collection: 'lessons', limit: 1, depth: 0 })
    await this.logger.info(`✓ Found ${lessons.totalDocs} existing lessons`)

    const images = await this.payload.find({ collection: 'images', limit: 1, depth: 0 })
    await this.logger.info(`✓ Found ${images.totalDocs} existing images`)
  }

  protected async import(): Promise<void> {
    const isPaginated = this.isPaginated()
    const stories = await this.fetchAllPathSteps()

    // If not paginated, run full import
    if (!isPaginated) {
      await this.importLessons(stories)
      return
    }

    // If targeting lessons collection, import with pagination
    if (this.isCollectionTargeted('lessons')) {
      await this.importLessons(stories)
    }
  }

  // ============================================================================
  // STORYBLOK API
  // ============================================================================

  private async fetchStoryblokData(endpoint: string): Promise<StoryblokResponse> {
    const url = `https://api.storyblok.com/v2/cdn/${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${this.token}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Storyblok API error: ${response.statusText}`)
    }
    return response.json()
  }

  private async fetchAllPathSteps(): Promise<StoryblokStory[]> {
    await this.logger.info('Fetching all path steps from Storyblok...')
    const response: StoryblokResponse = await this.fetchStoryblokData(
      'stories?starts_with=path/path-steps&per_page=100',
    )
    await this.logger.info(`Fetched ${response.stories.length} path steps`)
    return response.stories
  }

  private async fetchStoryByUuid(uuid: string): Promise<StoryblokStory> {
    const cacheFile = path.join(this.cacheDir, 'videos', `${uuid}.json`)

    // Check cache first (returns null in Workers mode)
    const cached = await readCacheText(cacheFile)
    if (cached) {
      return JSON.parse(cached).story as StoryblokStory
    }

    // Fetch from API
    await this.logger.info(`Fetching video story ${uuid}...`)
    const response = await fetch(
      `https://api.storyblok.com/v2/cdn/stories/${uuid}?find_by=uuid&token=${this.token}`,
    )
    if (!response.ok) {
      throw new Error(`Storyblok API error: ${response.statusText}`)
    }
    const responseData = (await response.json()) as { story: StoryblokStory }

    // Cache for local dev (no-op in Workers mode)
    await writeCache(cacheFile, JSON.stringify(responseData, null, 2))

    return responseData.story
  }

  // ============================================================================
  // LESSONS IMPORT
  // ============================================================================

  private async importLessons(stories: StoryblokStory[]): Promise<void> {
    // Apply pagination if enabled for lessons collection
    const paginatedStories = this.paginateItems(stories)
    const total = stories.length
    const offset = this.options.pagination?.offset || 0

    for (let i = 0; i < paginatedStories.length; i++) {
      const story = paginatedStories[i]
      const globalIndex = offset + i
      let wasSkipped = false

      try {
        const result = await this.importLesson(story, globalIndex + 1, total)
        wasSkipped = result.wasSkipped
      } catch (error) {
        // Error already reported by upsert() - just log to report summary
        this.addError(`Importing lesson "${story.name}"`, error as Error)
      }

      // Add delay between lessons to avoid rate limiting (auto-skips locally)
      // OPTIMIZATION: Only delay after actual creates/updates, not skips
      if (!wasSkipped && i < paginatedStories.length - 1) {
        await rateLimitDelay(300)
      }
    }
  }

  private async importLesson(
    story: StoryblokStory,
    current: number,
    total: number,
  ): Promise<{ wasSkipped: boolean }> {
    const content = story.content as Record<string, any>
    const stepSlug = story.slug
    const identifier = story.name

    // Extract unit and step for natural key
    const unitNumber = content.Step_info?.[0]?.Unit_number || this.extractUnitFromSlug(stepSlug)
    const stepMatch = stepSlug.match(/step-(\d+)/)
    const stepNumber = stepMatch ? parseInt(stepMatch[1], 10) : 1

    if (this.options.dryRun) {
      this.report.incrementSkipped()
      await this.reportDocument('lessons', identifier, 'skipped', { current, total })
      return { wasSkipped: true }
    }

    // Build composite key for preload cache lookup (matches preloadLessonsWithCompositeKey format)
    const compositeKey = `Unit ${unitNumber}-${stepNumber}`

    // Check skip mode BEFORE file operations - avoid uploading files for skipped lessons
    if (!this.options.updateMode && this.hasPreloaded('lessons', compositeKey)) {
      this.report.incrementSkipped()
      await this.reportDocument('lessons', identifier, 'skipped', { current, total })
      return { wasSkipped: true }
    }

    // Build lesson data (uploads panel images/videos - only reached if creating/updating)
    const panels = await this.buildPanels(story)
    if (panels.length === 0) {
      this.addError(`No valid panels found for ${story.name}`, 'Skipping lesson creation')
      return { wasSkipped: true }
    }

    // Find related meditation if referenced
    let meditationId: number | undefined
    if (content.Meditation_reference?.[0]) {
      const expectedTitle = `Step ${stepNumber}`
      const foundMeditation = await this.findMeditationByTitle(expectedTitle)
      if (foundMeditation) {
        meditationId = foundMeditation
      } else {
        this.addWarning(`Meditation "${expectedTitle}" not found for ${story.name}`)
      }
    }

    // Parse subtitles if available
    let introSubtitles: Record<string, unknown> | undefined
    if (content.Audio_intro?.[0]?.Subtitles?.filename) {
      try {
        introSubtitles = await this.parseSubtitles(content.Audio_intro[0].Subtitles.filename)
      } catch (error) {
        this.addError(`Parsing subtitles for ${story.name}`, error as Error)
      }
    }

    // Convert article if available
    let article: Record<string, unknown> | undefined
    if (content.Delving_deeper_article?.[0]?.Blocks) {
      try {
        article = await this.convertLexicalBlocks(content.Delving_deeper_article[0].Blocks)
      } catch (error) {
        this.addError(`Converting article for ${story.name}`, error as Error)
      }
    }

    // Create icon from source data (required field - must be done before lesson creation)
    const iconId = await this.createLessonIcon(story, content)

    // Build lesson data
    const lessonData: Record<string, any> = {
      title: this.processTextField(story.name),
      unit: `Unit ${unitNumber}`,
      step: stepNumber,
      panels,
      icon: iconId,
    }

    if (meditationId) {
      lessonData.meditation = meditationId
    }
    if (introSubtitles) {
      lessonData.introSubtitles = introSubtitles
    }
    if (article) {
      lessonData.article = article
    }

    // Upsert lesson by unit + step (natural key)
    const result = await this.upsert<{ id: number | string }>(
      'lessons',
      {
        and: [{ unit: { equals: `Unit ${unitNumber}` } }, { step: { equals: stepNumber } }],
      },
      lessonData,
      { locale: 'en', identifier, current, total },
    )

    const lessonId = result.doc.id

    // Handle file attachments only if lesson was created or updated (not skipped)
    if (result.action !== 'skipped') {
      await this.attachLessonFiles(lessonId, story, content)
    }

    // Return whether this was a skip (for rate limiting optimization)
    return { wasSkipped: result.action === 'skipped' }
  }

  private async buildPanels(story: StoryblokStory): Promise<any[]> {
    const content = story.content as Record<string, any>
    const introStories = content.Intro_stories || []
    const sortedPanels = introStories.sort((a: any, b: any) => a.Order_number - b.Order_number)

    const panels: any[] = []

    // Add cover panel first (quote becomes text)
    panels.push({
      title: story.name,
      text: this.processTextareaField(content.Intro_quote || ''),
    })

    for (let i = 0; i < sortedPanels.length; i++) {
      const panel = sortedPanels[i]
      try {
        if (panel.Video && panel.Video.url) {
          const videoUrl = panel.Video.url
          await this.logger.info(`Creating video attachment from: ${videoUrl}`)
          const mediaId = await this.createFileAttachment(videoUrl)
          panels.push({ media: parseInt(mediaId) })
        } else if (panel.Image && panel.Image.url) {
          const imageUrl = panel.Image.url
          await this.logger.info(`Creating image attachment from: ${imageUrl}`)
          const mediaId = await this.createFileAttachment(imageUrl)
          panels.push({
            title: this.processTextField(panel.Title || ''),
            text: this.processTextareaField(panel.Text || ''),
            media: parseInt(mediaId),
          })
        } else {
          this.addWarning(
            `Panel missing both video and image for ${story.name} - ${this.processTextField(panel.Title || '')}`,
          )
        }

        // Add delay between panels to avoid rate limiting (auto-skips locally)
        if (i < sortedPanels.length - 1) {
          await rateLimitDelay(50)
        }
      } catch (error) {
        this.addError(`Processing panel for ${story.name}`, error as Error)
      }
    }

    return panels
  }

  /**
   * Creates and uploads the lesson icon from source data.
   * @throws Error if no icon URL is found in source data
   */
  private async createLessonIcon(
    story: StoryblokStory,
    content: Record<string, any>,
  ): Promise<number> {
    const iconUrl = content.Step_info?.[0]?.Step_Image?.url
    if (!iconUrl) {
      throw new Error(`No icon URL found in source data`)
    }

    const iconTags = [this.iconTagId, this.lessonTagId].filter((id): id is number => id !== null)
    const iconId = await this.createMediaFromUrl(iconUrl, `Icon for ${story.name}`, iconTags)
    return typeof iconId === 'string' ? parseInt(iconId) : iconId
  }

  private async attachLessonFiles(
    lessonId: number | string,
    story: StoryblokStory,
    content: Record<string, any>,
  ): Promise<void> {
    // Note: Icon is now created in importLesson() before the lesson is created

    // Create and attach intro audio (uploads to Files collection)
    if (content.Audio_intro?.[0]?.Audio_track?.filename) {
      try {
        const audioId = await this.createFileAttachment(content.Audio_intro[0].Audio_track.filename)
        await this.payload.update({
          collection: 'lessons',
          id: lessonId,
          data: { introAudio: parseInt(audioId) },
        })
        await this.logger.info(`✓ Added intro audio to lesson`)
      } catch (error) {
        this.addError(`Creating audio attachment for ${story.name}`, error as Error)
      }
    }
  }

  // ============================================================================
  // LECTURE HELPERS
  // ============================================================================

  private async upsertLecture(
    videoStory: StoryblokStory,
    thumbnailId: number | string,
  ): Promise<number | string> {
    const content = videoStory.content as Record<string, any>
    const videoUrl = content.Video_URL || ''

    const result = await this.upsert<{ id: number | string }>(
      'lectures',
      { videoUrl: { equals: videoUrl } },
      {
        title: videoStory.name,
        thumbnail: thumbnailId,
        videoUrl,
        subtitlesUrl: content.Subtitles?.filename || '',
        category: ['shri-mataji'],
      },
    )

    return result.doc.id
  }

  // ============================================================================
  // MEDIA HELPERS
  // ============================================================================

  private async createMediaFromUrl(
    url: string,
    alt?: string,
    tags?: number[],
  ): Promise<number | string> {
    if (!url) {
      throw new Error('URL is required for creating media')
    }

    const filename = path.basename(url.split('?')[0])
    const cachePath = path.join(this.cacheDir, 'assets/images', filename)

    // Retry loop for reliability
    const maxRetries = 5
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Fetch asset with caching (fetchAsset handles Workers vs local mode)
        const buffer = await fetchAsset(url, { cachePath })

        const result = await this.mediaUploader.uploadWithDeduplication(filename, {
          alt: alt || filename,
          tags,
          buffer,
        })

        if (!result) {
          throw new Error('MediaUploader returned null - check Payload logs for details')
        }

        // Add delay after successful upload to avoid rate limiting (auto-skips locally)
        await rateLimitDelay(50)
        return result.id
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        // Log the error to help with debugging
        // eslint-disable-next-line no-console
        console.error(
          `[Storyblok] Upload attempt ${attempt}/${maxRetries} failed for ${filename}:`,
          lastError.message,
        )
        if (attempt < maxRetries) {
          // Longer exponential backoff: 1s, 2s, 4s, 8s (auto-skips locally)
          const delay = 1000 * Math.pow(2, attempt - 1)
          await rateLimitDelay(delay)
        }
      }
    }

    throw lastError || new Error('Failed to upload media after retries')
  }

  // ============================================================================
  // FILE ATTACHMENT HELPERS
  // ============================================================================

  /**
   * Creates a file attachment for audio, video, and image files.
   * Uploads to the Files collection.
   */
  private async createFileAttachment(url: string): Promise<string> {
    if (!url) {
      throw new Error('URL is required for creating file attachment')
    }

    const filename = path.basename(url.split('?')[0])
    const ext = path.extname(filename).toLowerCase()
    let mimeType: string
    let cacheSubdir: string

    if (['.mp3', '.mpeg'].includes(ext)) {
      mimeType = 'audio/mpeg'
      cacheSubdir = 'audio'
    } else if (['.mp4'].includes(ext)) {
      mimeType = 'video/mp4'
      cacheSubdir = 'videos'
    } else if (['.jpg', '.jpeg'].includes(ext)) {
      mimeType = 'image/jpeg'
      cacheSubdir = 'images'
    } else if (['.png'].includes(ext)) {
      mimeType = 'image/png'
      cacheSubdir = 'images'
    } else if (['.webp'].includes(ext)) {
      mimeType = 'image/webp'
      cacheSubdir = 'images'
    } else {
      throw new Error(`Unsupported file type: ${ext}`)
    }

    // Determine cache path based on file type
    const cachePath = path.join(this.cacheDir, `assets/${cacheSubdir}`, filename)

    // Fetch asset with caching (fetchAsset handles Workers vs local mode)
    const fileBuffer = await fetchAsset(url, { cachePath })

    const attachment = await this.payload.create({
      collection: 'files',
      data: {},
      file: {
        data: fileBuffer,
        name: filename,
        size: fileBuffer.length,
        mimetype: mimeType,
      },
    })

    return String(attachment.id)
  }

  // ============================================================================
  // TEXT PROCESSING HELPERS
  // ============================================================================

  private processTextField(text: string): string {
    return text
      .replace(/\\\\n/g, ' ')
      .replace(/\\\n/g, ' ')
      .replace(/\\n/g, ' ')
      .replace(/\\\\t/g, ' ')
      .replace(/\\\t/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\\r/g, ' ')
      .replace(/\\\r/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
  }

  private processTextareaField(text: string): string {
    return text
      .replace(/\\\\n/g, '\n')
      .replace(/\\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\\\t/g, '\t')
      .replace(/\\\t/g, '\t')
      .replace(/\\t/g, '\t')
      .replace(/\\\\r/g, '\r')
      .replace(/\\\r/g, '\r')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
  }

  // ============================================================================
  // MEDITATION LOOKUP
  // ============================================================================

  private findMeditationByTitle(title: string): number | null {
    const searchLower = title.toLowerCase()

    // Exact match first (O(1) lookup)
    if (this.meditationTitleCache.has(searchLower)) {
      return this.meditationTitleCache.get(searchLower)!
    }

    // Prefix match in memory (avoids DB query)
    for (const [cachedTitle, id] of this.meditationTitleCache) {
      if (
        cachedTitle.startsWith(searchLower) &&
        (cachedTitle.length === searchLower.length ||
          !/\d/.test(cachedTitle.charAt(searchLower.length)))
      ) {
        return id
      }
    }

    return null
  }

  // ============================================================================
  // SUBTITLE PARSING
  // ============================================================================

  private async parseSubtitles(url: string): Promise<Record<string, unknown>> {
    const filename = path.basename(url.split('?')[0])
    const cachePath = path.join(this.cacheDir, 'assets/subtitles', filename)

    // Fetch asset with caching (fetchAsset handles Workers vs local mode)
    const buffer = await fetchAsset(url, { cachePath })
    const rawData = buffer.toString('utf-8')

    return JSON.parse(rawData) as Record<string, unknown>
  }

  // ============================================================================
  // LEXICAL CONVERSION
  // ============================================================================

  private async convertLexicalBlocks(
    blocks: Record<string, unknown>[],
  ): Promise<Record<string, unknown>> {
    const sortedBlocks = blocks.sort(
      (a, b) => ((a.Order as number) || 0) - ((b.Order as number) || 0),
    )
    const children: Record<string, unknown>[] = []

    for (const block of sortedBlocks) {
      switch (block.component) {
        case 'DD_Main_video': {
          if (block.Video_UUID) {
            const videoStory = await this.fetchStoryByUuid(block.Video_UUID as string)
            const content = videoStory.content as Record<string, any>
            const thumbnailTags = this.thumbnailTagId ? [this.thumbnailTagId] : []
            const thumbnailId = await this.createMediaFromUrl(
              content.Thumbnail?.filename || '',
              undefined,
              thumbnailTags,
            )
            const lectureId = await this.upsertLecture(videoStory, thumbnailId)

            children.push({
              type: 'relationship',
              relationTo: 'lectures',
              value: { id: lectureId },
              version: 1,
            })
          }
          break
        }

        case 'h1':
          children.push({
            type: 'heading',
            tag: 'h1',
            version: 1,
            children: [
              {
                type: 'text',
                version: 1,
                text: this.processTextareaField((block.Text as string) || ''),
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
              },
            ],
          })
          break

        case 'DD_H2':
          children.push({
            type: 'heading',
            tag: 'h2',
            version: 1,
            children: [
              {
                type: 'text',
                version: 1,
                text: this.processTextareaField((block.Text as string) || ''),
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
              },
            ],
          })
          break

        case 'DD_Paragraph':
          children.push({
            type: 'paragraph',
            version: 1,
            children: [
              {
                type: 'text',
                version: 1,
                text: this.processTextareaField((block.Text as string) || ''),
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
              },
            ],
          })
          break

        case 'DD_Quote': {
          children.push({
            type: 'quote',
            version: 1,
            children: [
              {
                type: 'paragraph',
                version: 1,
                children: [
                  {
                    type: 'text',
                    version: 1,
                    text: this.processTextareaField((block.Text as string) || ''),
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                  },
                ],
              },
              {
                type: 'paragraph',
                version: 1,
                children: [
                  {
                    type: 'text',
                    version: 1,
                    text: `— ${this.processTextField((block.Author_name as string) || '')}, ${this.processTextField((block.Author_who_is as string) || '')}`,
                    format: 2, // italic
                    detail: 0,
                    mode: 'normal',
                    style: '',
                  },
                ],
              },
            ],
          })
          break
        }

        case 'DD_Image':
        case 'DD_wide_image': {
          const blockData = block as Record<string, any>
          const imageUrl = blockData.Image_link?.url || blockData.Image_URL?.url
          if (imageUrl) {
            const mediaId = await this.createMediaFromUrl(imageUrl as string)
            const captionText = this.processTextField((blockData.Caption_text as string) || '')
            const align = block.component === 'DD_wide_image' ? 'wide' : 'center'

            children.push({
              type: 'upload',
              relationTo: 'images',
              value: { id: mediaId },
              version: 1,
              fields: {
                align,
                ...(captionText.trim() ? { caption: captionText } : {}),
              },
            })
          }
          break
        }
      }
    }

    return {
      root: {
        type: 'root',
        children,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    }
  }

  // ============================================================================
  // UTILITY HELPERS
  // ============================================================================

  private extractUnitFromSlug(slug: string): number {
    const match = slug.match(/step-(\d+)/)
    if (!match) return 1

    const stepNum = parseInt(match[1], 10)
    if (stepNum <= 6) return 1
    if (stepNum <= 11) return 2
    return 3
  }
}
