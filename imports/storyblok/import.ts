/* eslint-disable no-console */

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
 *   pnpm import storyblok [flags]
 *
 * Flags:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 */

import * as fs from 'fs/promises'
import * as path from 'path'

import { BaseImporter, BaseImportOptions, parseArgs, MediaUploader } from '../lib'

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

class StoryblokImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Storyblok Path Steps'
  protected readonly cacheDir = CACHE_DIR

  private token: string
  private mediaUploader!: MediaUploader

  constructor(options: BaseImportOptions, token: string) {
    super(options)
    this.token = token
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  protected async setup(): Promise<void> {
    if (!this.options.dryRun) {
      this.mediaUploader = new MediaUploader(this.payload, this.logger)
    }

    // Setup additional cache directories
    await this.fileUtils.ensureDir(path.join(this.cacheDir, 'videos'))
    await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/audio'))
    await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/images'))
    await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/videos'))
    await this.fileUtils.ensureDir(path.join(this.cacheDir, 'assets/subtitles'))
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
    await this.logger.info('\n=== Importing Lessons ===')
    await this.logger.progress(0, stories.length, 'Lessons')

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i]

      try {
        await this.importLesson(story)
      } catch (error) {
        this.addError(`Importing lesson "${story.name}"`, error as Error)
      }

      await this.logger.progress(i + 1, stories.length, 'Lessons')
    }
  }

  private async importLesson(story: StoryblokStory): Promise<void> {
    const content = story.content as Record<string, any>
    const stepSlug = story.slug

    // Extract unit and step for natural key
    const unitNumber = content.Step_info?.[0]?.Unit_number || this.extractUnitFromSlug(stepSlug)
    const stepMatch = stepSlug.match(/step-(\d+)/)
    const stepNumber = stepMatch ? parseInt(stepMatch[1], 10) : 1

    await this.logger.info(`\nProcessing ${story.name} (Unit ${unitNumber}, Step ${stepNumber})...`)

    if (this.options.dryRun) {
      await this.logger.info(`[DRY RUN] Would upsert lesson: ${story.name}`)
      this.report.incrementSkipped()
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
      { locale: 'en' },
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
          const imageId = await this.createMediaFromUrl(panel.Image.url, panel.Title)
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
        video: videoId,
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
        const iconId = await this.createMediaFromUrl(
          content.Step_info[0].Step_Image.url,
          `Icon for ${story.name}`,
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
  // EXTERNAL VIDEO HELPERS
  // ============================================================================

  private async upsertExternalVideo(
    videoStory: StoryblokStory,
    thumbnailId: number | string,
  ): Promise<number | string> {
    const content = videoStory.content as Record<string, any>
    const videoUrl = content.Video_URL || ''

    const result = await this.upsert<{ id: number | string }>(
      'external-videos',
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

  private async createMediaFromUrl(url: string, alt?: string): Promise<number | string> {
    if (!url) {
      throw new Error('URL is required for creating media')
    }

    const filename = path.basename(url.split('?')[0])
    const destPath = path.join(this.cacheDir, 'assets/images', filename)

    await this.downloadFile(url, destPath)
    const webpPath = await this.convertImageToWebp(destPath)

    const result = await this.mediaUploader.uploadWithDeduplication(webpPath, {
      alt: alt || filename,
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
    let destPath: string
    let mimeType: string

    if (['.mp3', '.mpeg'].includes(ext)) {
      destPath = path.join(this.cacheDir, 'assets/audio', filename)
      mimeType = 'audio/mpeg'
    } else if (['.mp4'].includes(ext)) {
      destPath = path.join(this.cacheDir, 'assets/videos', filename)
      mimeType = 'video/mp4'
    } else if (['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(ext)) {
      // Image files should go to Images collection, not Files
      throw new Error(
        `Image files should use createMediaFromUrl() instead of createFileAttachment(). File: ${filename}`,
      )
    } else {
      throw new Error(`Unsupported file type: ${ext}`)
    }

    await this.downloadFile(url, destPath)

    const fileBuffer = await fs.readFile(destPath)

    const attachment = await this.payload.create({
      collection: 'files',
      data: {},
      file: {
        data: fileBuffer,
        name: path.basename(destPath),
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
            const thumbnailId = await this.createMediaFromUrl(content.Thumbnail?.filename || '')
            const externalVideoId = await this.upsertExternalVideo(videoStory, thumbnailId)

            children.push({
              type: 'relationship',
              relationTo: 'external-videos',
              value: { id: externalVideoId },
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

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs()

  const token = process.env.STORYBLOK_ACCESS_TOKEN
  if (!token) {
    console.error('Error: STORYBLOK_ACCESS_TOKEN environment variable is required')
    console.error('Please set the token in your environment to use this script.')
    process.exit(1)
  }

  const importer = new StoryblokImporter(options, token)
  await importer.run()
  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
