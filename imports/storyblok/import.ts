 

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

import * as fs from 'fs/promises'
import * as path from 'path'

import { BaseImporter, BaseImportOptions, MediaUploader, TagManager } from '../lib'
import { isCloudflareWorker } from '../lib/runtime'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DIR = path.resolve(process.cwd(), 'imports/cache/storyblok')

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
      await this.setupImageTags()
    }

    // Setup additional cache directories (skip in Workers - no filesystem access)
    if (!isCloudflareWorker()) {
      await this.fileUtils.ensureDir(path.join(this.cacheDir, 'videos'))
      await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/audio'))
      await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/images'))
      await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/videos'))
      await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/subtitles'))
    }
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

  protected async import(): Promise<void> {
    const stories = await this.fetchAllPathSteps()
    await this.importLessons(stories)
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
    // In Workers: fetch directly without caching
    if (isCloudflareWorker()) {
      await this.logger.info(`Fetching video story ${uuid}...`)
      const response = await fetch(
        `https://api.storyblok.com/v2/cdn/stories/${uuid}?find_by=uuid&token=${this.token}`,
      )
      if (!response.ok) {
        throw new Error(`Storyblok API error: ${response.statusText}`)
      }
      const responseData = (await response.json()) as { story: StoryblokStory }
      return responseData.story
    }

    // Local dev: use file caching
    const cacheFile = path.join(this.cacheDir, 'videos', `${uuid}.json`)

    if (await this.fileUtils.fileExists(cacheFile)) {
      const data = await fs.readFile(cacheFile, 'utf-8')
      return JSON.parse(data).story as StoryblokStory
    }

    await this.logger.info(`Fetching video story ${uuid}...`)
    const response = await fetch(
      `https://api.storyblok.com/v2/cdn/stories/${uuid}?find_by=uuid&token=${this.token}`,
    )
    if (!response.ok) {
      throw new Error(`Storyblok API error: ${response.statusText}`)
    }
    const responseData = (await response.json()) as { story: StoryblokStory }
    await fs.writeFile(cacheFile, JSON.stringify(responseData, null, 2))
    return responseData.story
  }

  // ============================================================================
  // LESSONS IMPORT
  // ============================================================================

  private async importLessons(stories: StoryblokStory[]): Promise<void> {
    const total = stories.length
    for (let i = 0; i < total; i++) {
      const story = stories[i]

      try {
        await this.importLesson(story, i + 1, total)
      } catch (error) {
        // Error already reported by upsert() - just log to report summary
        this.addError(`Importing lesson "${story.name}"`, error as Error)
      }
    }
  }

  private async importLesson(
    story: StoryblokStory,
    current: number,
    total: number,
  ): Promise<void> {
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
      return
    }

    // Build lesson data
    const panels = await this.buildPanels(story)
    if (panels.length === 0) {
      this.addError(`No valid panels found for ${story.name}`, 'Skipping lesson creation')
      return
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

    // Build lesson data
    const lessonData: Record<string, any> = {
      title: this.processTextField(story.name),
      unit: `Unit ${unitNumber}`,
      step: stepNumber,
      panels,
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

    // Handle file attachments after lesson creation/update
    await this.attachLessonFiles(lessonId, story, content)
  }

  private async buildPanels(story: StoryblokStory): Promise<any[]> {
    const content = story.content as Record<string, any>
    const introStories = content.Intro_stories || []
    const sortedPanels = introStories.sort((a: any, b: any) => a.Order_number - b.Order_number)

    const panels: any[] = []
    const videoPanels: Array<{ insertAt: number; videoId: string }> = []
    let panelIndexCounter = 0

    // Add cover panel first
    panels.push({
      blockType: 'cover' as const,
      title: story.name,
      quote: this.processTextareaField(content.Intro_quote || ''),
    })

    for (const panel of sortedPanels) {
      try {
        if (panel.Video && panel.Video.url) {
          const videoUrl = panel.Video.url
          await this.logger.info(`Creating video attachment from: ${videoUrl}`)
          const videoId = await this.createFileAttachment(videoUrl)
          videoPanels.push({ insertAt: panelIndexCounter, videoId })
          panelIndexCounter++
        } else if (panel.Image && panel.Image.url) {
          const lessonTags = this.lessonTagId ? [this.lessonTagId] : []
          const imageId = await this.createMediaFromUrl(panel.Image.url, panel.Title, lessonTags)
          panels.push({
            blockType: 'text' as const,
            title: this.processTextField(panel.Title || ''),
            text: this.processTextareaField(panel.Text || ''),
            image: imageId,
          })
          panelIndexCounter++
        } else {
          this.addWarning(
            `Panel missing both video and image for ${story.name} - ${this.processTextField(panel.Title || '')}`,
          )
          panelIndexCounter++
        }
      } catch (error) {
        this.addError(`Processing panel for ${story.name}`, error as Error)
      }
    }

    // Insert video panels at correct positions
    const sortedVideoPanels = [...videoPanels].sort((a, b) => b.insertAt - a.insertAt)
    for (const { insertAt, videoId } of sortedVideoPanels) {
      const insertIndex = insertAt + 1 // +1 for cover panel
      panels.splice(insertIndex, 0, {
        blockType: 'video',
        video: parseInt(videoId),
      })
    }

    return panels
  }

  private async attachLessonFiles(
    lessonId: number | string,
    story: StoryblokStory,
    content: Record<string, any>,
  ): Promise<void> {
    // Create and attach icon (uploads to Images collection)
    if (content.Step_info?.[0]?.Step_Image?.url) {
      try {
        const iconTags = [this.iconTagId, this.lessonTagId].filter(
          (id): id is number => id !== null,
        )
        const iconId = await this.createMediaFromUrl(
          content.Step_info[0].Step_Image.url,
          `Icon for ${story.name}`,
          iconTags,
        )
        await this.payload.update({
          collection: 'lessons',
          id: lessonId,
          data: { icon: typeof iconId === 'string' ? parseInt(iconId) : iconId },
        })
        await this.logger.info(`✓ Added icon to lesson`)
      } catch (error) {
        this.addError(`Creating/attaching icon for ${story.name}`, error as Error)
      }
    }

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

    // In Workers: fetch directly and pass buffer to uploader
    if (isCloudflareWorker()) {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const result = await this.mediaUploader.uploadWithDeduplication(filename, {
        alt: alt || filename,
        tags,
        buffer,
      })

      if (!result) {
        throw new Error('Failed to upload media')
      }

      return result.id
    }

    // Local dev: download to cache, then upload from path
    const destPath = path.join(this.cacheDir, 'assets/images', filename)

    await this.downloadFile(url, destPath)
    const webpPath = await this.convertImageToWebp(destPath)

    const result = await this.mediaUploader.uploadWithDeduplication(webpPath, {
      alt: alt || filename,
      tags,
    })

    if (!result) {
      throw new Error('Failed to upload media')
    }

    return result.id
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    await this.fileUtils.downloadFileFetch(url, destPath)
  }

  private async convertImageToWebp(imagePath: string): Promise<string> {
    // Image conversion disabled for Cloudflare Workers compatibility
    // Return original image path without WebP conversion
    await this.logger.info(`Using original image: ${path.basename(imagePath)}`)
    return imagePath
  }

  // ============================================================================
  // FILE ATTACHMENT HELPERS
  // ============================================================================

  /**
   * Creates a file attachment for audio/video files.
   * Note: Image files should use createMediaFromUrl() instead, which uploads to Images collection.
   */
  private async createFileAttachment(url: string): Promise<string> {
    if (!url) {
      throw new Error('URL is required for creating file attachment')
    }

    const filename = path.basename(url.split('?')[0])
    const ext = path.extname(filename).toLowerCase()
    let mimeType: string

    if (['.mp3', '.mpeg'].includes(ext)) {
      mimeType = 'audio/mpeg'
    } else if (['.mp4'].includes(ext)) {
      mimeType = 'video/mp4'
    } else if (['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(ext)) {
      // Image files should go to Images collection, not Files
      throw new Error(
        `Image files should use createMediaFromUrl() instead of createFileAttachment(). File: ${filename}`,
      )
    } else {
      throw new Error(`Unsupported file type: ${ext}`)
    }

    let fileBuffer: Buffer

    // In Workers: fetch directly without file caching
    if (isCloudflareWorker()) {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)
    } else {
      // Local dev: download to cache then read
      const destPath =
        mimeType === 'audio/mpeg'
          ? path.join(this.cacheDir, 'assets/audio', filename)
          : path.join(this.cacheDir, 'assets/videos', filename)

      await this.downloadFile(url, destPath)
      fileBuffer = await fs.readFile(destPath)
    }

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

  private async findMeditationByTitle(title: string): Promise<number | null> {
    let result = await this.payload.find({
      collection: 'meditations',
      where: { title: { equals: title } },
      limit: 1,
    })

    if (result.docs.length > 0) {
      return result.docs[0].id as number
    }

    // Try prefix match
    result = await this.payload.find({
      collection: 'meditations',
      limit: 200,
    })

    const meditation = result.docs.find((doc) => {
      const titleLower = doc.title?.toLowerCase() || ''
      const searchLower = title.toLowerCase()
      return (
        titleLower.startsWith(searchLower) &&
        (titleLower.length === searchLower.length ||
          !/\d/.test(titleLower.charAt(searchLower.length)))
      )
    })

    return meditation ? (meditation.id as number) : null
  }

  // ============================================================================
  // SUBTITLE PARSING
  // ============================================================================

  private async parseSubtitles(url: string): Promise<Record<string, unknown>> {
    // In Workers: fetch directly without file caching
    if (isCloudflareWorker()) {
      await this.logger.info(`[DEBUG] Fetching subtitles from: ${url}`)
      const response = await fetch(url)

      if (!response.ok) {
        await this.logger.error(
          `[DEBUG] Subtitle fetch failed: ${response.status} ${response.statusText}`,
        )
        throw new Error(`Failed to download subtitles: ${response.status} ${response.statusText}`)
      }

      const text = await response.text()
      await this.logger.info(`[DEBUG] Subtitle response length: ${text.length} chars`)
      await this.logger.info(`[DEBUG] Subtitle response preview: ${text.substring(0, 200)}...`)

      try {
        const data = JSON.parse(text) as Record<string, unknown>
        await this.logger.info(`[DEBUG] Parsed subtitle keys: ${Object.keys(data).join(', ')}`)
        if (data.captions && Array.isArray(data.captions)) {
          await this.logger.info(`[DEBUG] Captions count: ${data.captions.length}`)
          if (data.captions[0]) {
            const firstCaption = data.captions[0] as Record<string, unknown>
            await this.logger.info(
              `[DEBUG] First caption keys: ${Object.keys(firstCaption).join(', ')}`,
            )
            await this.logger.info(
              `[DEBUG] First caption types: duration=${typeof firstCaption.duration}, startOfParagraph=${typeof firstCaption.startOfParagraph}, startTime=${typeof firstCaption.startTime}`,
            )
          }
        }
        return data
      } catch (parseError) {
        const errorMsg = parseError instanceof Error ? parseError.message : String(parseError)
        await this.logger.error(`[DEBUG] JSON parse failed: ${errorMsg}`)
        await this.logger.error(`[DEBUG] Raw response: ${text.substring(0, 500)}`)
        throw parseError
      }
    }

    // Local dev: download to cache then read
    const filename = path.basename(url.split('?')[0])
    const destPath = path.join(this.cacheDir, 'assets/subtitles', filename)

    await this.downloadFile(url, destPath)
    const data = await fs.readFile(destPath, 'utf-8')
    return JSON.parse(data)
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

