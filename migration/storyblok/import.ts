import 'dotenv/config'

import { getPayload } from 'payload'
import configPromise from '../../src/payload.config'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as sharp from 'sharp'
import type { CollectionSlug, Payload } from 'payload'
import { Logger, FileUtils, TagManager, MediaUploader } from '../lib'

const IMPORT_TAG = 'import-storyblok' // Tag for all imported documents and media
const CACHE_DIR = path.resolve(process.cwd(), 'migration/cache/storyblok')

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

interface ScriptOptions {
  dryRun: boolean
  clearCache: boolean
  reset: boolean
  unit?: string
}

interface ImportSummary {
  lessonsCreated: number
  mediaCreated: number
  externalVideosCreated: number
  fileAttachmentsCreated: number
  errors: string[]
  warnings: string[]
}

class StoryblokImporter {
  private token: string
  private payload!: Payload
  private options: ScriptOptions
  private logger!: Logger
  private fileUtils!: FileUtils
  private tagManager!: TagManager
  private mediaUploader!: MediaUploader
  private mediaTagId: string | null = null

  // In-memory ID mappings (no persistence)
  private idMaps = {
    lessons: new Map<string, string>(), // slug -> lesson ID
  }

  // Summary tracking
  private summary: ImportSummary = {
    lessonsCreated: 0,
    mediaCreated: 0,
    externalVideosCreated: 0,
    fileAttachmentsCreated: 0,
    errors: [],
    warnings: [],
  }

  constructor(token: string, options: ScriptOptions) {
    this.token = token
    this.options = options
  }

  private async initialize() {
    this.logger = new Logger(CACHE_DIR)
    this.fileUtils = new FileUtils(this.logger)
    this.tagManager = new TagManager(this.payload, this.logger)
    this.mediaUploader = new MediaUploader(this.payload, this.logger)
  }

  private addError(context: string, error: Error | string) {
    const message = error instanceof Error ? error.message : error
    const fullMessage = `${context}: ${message}`
    this.summary.errors.push(fullMessage)
    this.logger.error(fullMessage)
  }

  private addWarning(message: string) {
    this.summary.warnings.push(message)
    this.logger.warn(message)
  }

  async ensureMediaTag(): Promise<void> {
    if (this.mediaTagId) return
    this.mediaTagId = await this.tagManager.ensureMediaTag(IMPORT_TAG)
  }

  async downloadFile(url: string, destPath: string): Promise<void> {
    await this.fileUtils.downloadFileFetch(url, destPath)
  }

  async fetchStoryblokData(endpoint: string): Promise<StoryblokResponse> {
    const url = `https://api.storyblok.com/v2/cdn/${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${this.token}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Storyblok API error: ${response.statusText}`)
    }
    return response.json()
  }

  async fetchAllPathSteps(): Promise<StoryblokStory[]> {
    await this.logger.info('Fetching all path steps from Storyblok...')
    const response: StoryblokResponse = await this.fetchStoryblokData(
      'stories?starts_with=path/path-steps&per_page=100',
    )
    await this.logger.info(`Fetched ${response.stories.length} path steps`)
    return response.stories
  }

  async fetchStoryByUuid(uuid: string): Promise<StoryblokStory> {
    const cacheFile = path.join(CACHE_DIR, 'videos', `${uuid}.json`)

    const fileExists = await fs
      .access(cacheFile)
      .then(() => true)
      .catch(() => false)

    if (fileExists) {
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
    const responseData = await response.json()
    await fs.writeFile(cacheFile, JSON.stringify(responseData, null, 2))
    return responseData.story as StoryblokStory
  }

  async convertImageToWebp(imagePath: string): Promise<string> {
    const ext = path.extname(imagePath)
    if (ext.toLowerCase() === '.webp') {
      return imagePath
    }

    const webpPath = imagePath.replace(ext, '.webp')
    const fileExists = await fs
      .access(webpPath)
      .then(() => true)
      .catch(() => false)

    if (!fileExists) {
      const sharpInstance = sharp.default ? sharp.default(imagePath) : (sharp as any)(imagePath)
      await sharpInstance.webp({ quality: 90 }).toFile(webpPath)
      await this.logger.info(`Converted ${path.basename(imagePath)} to WebP`)
    }

    return webpPath
  }

  async createMediaFromUrl(url: string, alt?: string): Promise<string> {
    if (!url) {
      throw new Error('URL is required for creating media')
    }
    const filename = path.basename(url.split('?')[0])
    const destPath = path.join(CACHE_DIR, 'assets/images', filename)

    await this.downloadFile(url, destPath)
    const webpPath = await this.convertImageToWebp(destPath)

    // Ensure media tag exists
    await this.ensureMediaTag()

    // Upload with deduplication
    const tags = this.mediaTagId ? [this.mediaTagId] : []
    const result = await this.mediaUploader.uploadWithDeduplication(webpPath, {
      alt: alt || filename,
      tags,
    })

    if (!result) {
      throw new Error('Failed to upload media')
    }

    if (!result.wasReused) {
      this.summary.mediaCreated++
    }
    return result.id
  }

  async createFileAttachment(
    url: string,
    ownerCollection?: 'lessons',
    ownerId?: string,
  ): Promise<string> {
    if (!url) {
      throw new Error('URL is required for creating file attachment')
    }
    const filename = path.basename(url.split('?')[0])
    const ext = path.extname(filename).toLowerCase()
    let destPath: string
    let mimeType: string

    if (['.mp3', '.mpeg'].includes(ext)) {
      destPath = path.join(CACHE_DIR, 'assets/audio', filename)
      mimeType = 'audio/mpeg'
    } else if (['.mp4', '.mpeg'].includes(ext)) {
      destPath = path.join(CACHE_DIR, 'assets/videos', filename)
      mimeType = ext === '.mp4' ? 'video/mp4' : 'video/mpeg'
    } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      destPath = path.join(CACHE_DIR, 'assets/images', filename)
      const webpFilename = filename.replace(ext, '.webp')
      destPath = path.join(CACHE_DIR, 'assets/images', webpFilename)
      mimeType = 'image/webp'

      const originalPath = path.join(CACHE_DIR, 'assets/images', filename)
      await this.downloadFile(url, originalPath)
      await this.convertImageToWebp(originalPath)
    } else {
      throw new Error(`Unsupported file type: ${ext}`)
    }

    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      await this.downloadFile(url, destPath)
    }

    const fileBuffer = await fs.readFile(destPath)
    const data: any = {}

    // Only set owner if we have valid owner info and ownerId is not a temporary ID
    if (ownerCollection && ownerId && !ownerId.startsWith('temp-')) {
      data.owner = {
        relationTo: ownerCollection,
        value: ownerId,
      }
    }

    const attachment = await this.payload.create({
      collection: 'file-attachments',
      data,
      file: {
        data: fileBuffer,
        name: path.basename(destPath),
        size: fileBuffer.length,
        mimetype: mimeType,
      },
    })

    this.summary.fileAttachmentsCreated++
    return attachment.id as string
  }

  async updateFileAttachmentOwner(
    attachmentId: string,
    ownerCollection: 'lessons',
    ownerId: string,
  ): Promise<void> {
    await this.payload.update({
      collection: 'file-attachments',
      id: attachmentId,
      data: {
        owner: {
          relationTo: ownerCollection,
          value: ownerId,
        },
      },
    })
  }

  async parseSubtitles(url: string): Promise<Record<string, unknown>> {
    if (!url) {
      throw new Error('URL is required for parsing subtitles')
    }
    const filename = path.basename(url.split('?')[0])
    const destPath = path.join(CACHE_DIR, 'assets/subtitles', filename)

    await this.downloadFile(url, destPath)
    const data = await fs.readFile(destPath, 'utf-8')
    const subtitles = JSON.parse(data)

    return subtitles
  }

  async findMeditationByTitle(title: string): Promise<string | null> {
    // First try exact match
    let result = await this.payload.find({
      collection: 'meditations',
      where: {
        title: {
          equals: title,
        },
      },
      limit: 1,
    })

    if (result.docs.length > 0) {
      return result.docs[0].id as string
    }

    // Get all meditations and filter in memory for more precise matching
    result = await this.payload.find({
      collection: 'meditations',
      limit: 200, // Get all meditations
    })

    // Find meditation that starts with the title followed by a non-digit character
    // This prevents "Step 1" from matching "Step 16" by requiring the number to be followed by : or - or space
    const meditation = result.docs.find((doc) => {
      const titleLower = doc.title?.toLowerCase() || ''
      const searchLower = title.toLowerCase()

      // Check if it starts with our search term followed by a non-digit character
      return (
        titleLower.startsWith(searchLower) &&
        (titleLower.length === searchLower.length ||
          !/\d/.test(titleLower.charAt(searchLower.length)))
      )
    })

    if (meditation) {
      return meditation.id as string
    }

    return null
  }

  async convertLexicalBlocks(blocks: Record<string, unknown>[]): Promise<Record<string, unknown>> {
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
            const externalVideo = await this.payload.create({
              collection: 'external-videos',
              data: {
                title: videoStory.name,
                thumbnail: await this.createMediaFromUrl(content.Thumbnail?.filename || ''),
                videoUrl: content.Video_URL || '',
                subtitlesUrl: content.Subtitles?.filename || '',
                category: ['shri-mataji'],
              },
            })

            this.summary.externalVideosCreated++

            children.push({
              type: 'relationship',
              relationTo: 'external-videos',
              value: {
                id: externalVideo.id,
              },
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
                text: this.processTextareaField((block.Text as string) || ''), // Rich text content
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
                text: this.processTextareaField((block.Text as string) || ''), // Rich text content
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
                text: this.processTextareaField((block.Text as string) || ''), // Rich text content
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
              },
            ],
          })
          break

        case 'DD_Quote': {
          // Convert quote blocks to blockquote paragraphs instead of custom blocks
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
                    text: this.processTextareaField((block.Text as string) || ''), // Rich text content
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
                    text: `— ${this.processTextField((block.Author_name as string) || '')}, ${this.processTextField((block.Author_who_is as string) || '')}`, // Author names as text fields
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

            // Determine alignment based on block type
            const align = block.component === 'DD_wide_image' ? 'wide' : 'center'

            const uploadNode: Record<string, unknown> = {
              type: 'upload',
              relationTo: 'media',
              value: {
                id: mediaId,
              },
              version: 1,
              fields: {
                align,
                ...(captionText.trim() ? { caption: captionText } : {}),
              },
            }

            children.push(uploadNode)
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

  async createLessons(stories: StoryblokStory[]): Promise<void> {
    await this.logger.info('\n=== Creating Lessons ===')

    for (const story of stories) {
      const stepSlug = story.slug

      // Skip if already created
      if (this.idMaps.lessons.has(stepSlug)) {
        await this.logger.info(`Lesson ${stepSlug} already created, skipping`)
        continue
      }

      try {
        await this.logger.info(`\nProcessing ${story.name} (${stepSlug})...`)

        if (this.options.dryRun) {
          await this.logger.info(`[DRY RUN] Would create lesson: ${story.name}`)
          continue
        }

        const content = story.content as Record<string, any>
        const unitNumber = content.Step_info?.[0]?.Unit_number || this.extractUnitFromSlug(stepSlug)

        const introStories = content.Intro_stories || []
        const sortedPanels = introStories.sort((a: any, b: any) => a.Order_number - b.Order_number)

        const panels: Array<{
          blockType: 'text' | 'video' | 'cover'
          title?: string
          text?: string
          quote?: string
          image?: string
          video?: string
        }> = []
        const videoPanels: Array<{ insertAt: number; videoId: string }> = [] // Track video panels to add later
        let panelIndexCounter = 0 // Track position in original panel order
        for (const panel of sortedPanels) {
          try {
            if (panel.Video && panel.Video.url) {
              const videoUrl = panel.Video.url
              await this.logger.info(`Creating video attachment from: ${videoUrl}`)
              const videoId = await this.createFileAttachment(videoUrl)
              await this.logger.info(`✓ Created video attachment: ${videoId}`)

              // Don't add video panels initially - we'll insert them after lesson creation
              // Track where this video panel should be inserted
              videoPanels.push({ insertAt: panelIndexCounter, videoId })
              panelIndexCounter++
            } else if (panel.Image && panel.Image.url) {
              const imageId = await this.createMediaFromUrl(panel.Image.url, panel.Title)
              panels.push({
                blockType: 'text' as const,
                title: this.processTextField(panel.Title || ''), // Process as text field
                text: this.processTextareaField(panel.Text || ''), // Process as textarea field
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

        let meditationId: string | undefined = undefined
        if (content.Meditation_reference?.[0]) {
          // Extract step number from story slug (e.g., "step-1" -> "1")
          const stepMatch = stepSlug.match(/step-(\d+)/)
          if (stepMatch) {
            const stepNumber = stepMatch[1]
            const expectedMeditationTitle = `Step ${stepNumber}`

            const foundId = await this.findMeditationByTitle(expectedMeditationTitle)
            if (foundId) {
              meditationId = foundId
              // Get the full meditation details to retrieve the actual title
              await this.payload.findByID({
                collection: 'meditations',
                id: foundId,
              })
              await this.logger.info(`✓ Found meditation: ${expectedMeditationTitle}`)
            } else {
              this.addWarning(`Meditation "${expectedMeditationTitle}" not found for ${story.name}`)
              meditationId = undefined
            }
          } else {
            this.addWarning(
              `Could not extract step number from slug "${stepSlug}" for ${story.name}`,
            )
            meditationId = undefined
          }
        }

        let introAudioId: string | undefined = undefined
        if (content.Audio_intro?.[0]?.Audio_track?.filename) {
          try {
            introAudioId = await this.createFileAttachment(
              content.Audio_intro[0].Audio_track.filename,
            )
          } catch (error) {
            this.addError(`Creating audio attachment for ${story.name}`, error as Error)
          }
        }

        let introSubtitles: Record<string, unknown> | undefined = undefined
        if (content.Audio_intro?.[0]?.Subtitles?.filename) {
          try {
            introSubtitles = await this.parseSubtitles(content.Audio_intro[0].Subtitles.filename)
          } catch (error) {
            this.addError(`Parsing subtitles for ${story.name}`, error as Error)
          }
        }

        let article: Record<string, unknown> | undefined = undefined
        if (content.Delving_deeper_article?.[0]?.Blocks) {
          try {
            article = await this.convertLexicalBlocks(content.Delving_deeper_article[0].Blocks)
          } catch (error) {
            this.addError(`Converting article for ${story.name}`, error as Error)
          }
        }

        // Add CoverStoryBlock as the first panel for every lesson
        const coverPanel = {
          blockType: 'cover' as const,
          title: story.name, // Preserve \\n as literal text in cover panel title
          quote: this.processTextareaField(content.Intro_quote || ''), // Process as textarea field
        }
        // Insert at the beginning
        panels.unshift(coverPanel)

        // Ensure we have at least one panel
        if (panels.length === 0) {
          this.addError(`No valid panels found for ${story.name}, skipping lesson creation`, '')
          continue
        }

        // Extract step number from slug (e.g., "step-1" -> 1)
        const stepMatch = stepSlug.match(/step-(\d+)/)
        const stepNumber = stepMatch ? parseInt(stepMatch[1], 10) : 1

        const lessonData: any = {
          title: this.processTextField(story.name), // Process as text field - converts \\n to spaces
          unit: `Unit ${unitNumber}`,
          step: stepNumber,
          panels: panels as any,
        }

        // Only add fields that have valid values
        if (meditationId) {
          lessonData.meditation = meditationId
        }
        if (introSubtitles) {
          lessonData.introSubtitles = introSubtitles
        }
        if (article) {
          lessonData.article = article
        }

        const lesson = await this.payload.create({
          collection: 'lessons',
          data: lessonData,
          locale: 'en',
        })

        // Create and attach icon after lesson creation
        if (content.Step_info?.[0]?.Step_Image?.url) {
          try {
            const iconId = await this.createFileAttachment(
              content.Step_info[0].Step_Image.url,
              'lessons',
              lesson.id as string,
            )
            await this.logger.info(`✓ Created icon attachment for lesson`)

            // Update lesson with icon
            await this.payload.update({
              collection: 'lessons',
              id: lesson.id as string,
              data: {
                icon: iconId,
              },
            })
            await this.logger.info(`✓ Added icon to lesson`)
          } catch (error) {
            this.addError(`Creating/attaching icon for ${story.name}`, error as Error)
          }
        } else {
          this.addWarning(`Missing Step_Image for lesson: ${story.name}`)
        }

        // Update lesson with intro audio after creation to avoid validation issues
        if (introAudioId) {
          try {
            await this.payload.update({
              collection: 'lessons',
              id: lesson.id as string,
              data: {
                introAudio: introAudioId,
              },
            })
            await this.logger.info(`✓ Added intro audio to lesson`)
          } catch (error) {
            this.addError(`Adding intro audio to lesson ${story.name}`, error as Error)
          }
        }

        // Insert video panels after lesson creation
        // This avoids validation issues with file attachment filters on new documents
        if (videoPanels.length > 0) {
          try {
            // Fetch the current lesson to get its panels
            const currentLesson = await this.payload.findByID({
              collection: 'lessons',
              id: lesson.id as string,
            })

            const updatedPanels = [...(currentLesson.panels as Array<Record<string, unknown>>)]

            // Insert video panels at their correct positions
            // Sort by insertAt position in reverse order to maintain correct indices
            const sortedVideoPanels = [...videoPanels].sort((a, b) => b.insertAt - a.insertAt)

            for (const { insertAt, videoId } of sortedVideoPanels) {
              // +1 to account for cover panel at index 0
              const insertIndex = insertAt + 1
              updatedPanels.splice(insertIndex, 0, {
                blockType: 'video',
                video: videoId,
              })
              await this.updateFileAttachmentOwner(videoId, 'lessons', lesson.id as string)
            }

            await this.payload.update({
              collection: 'lessons',
              id: lesson.id as string,
              data: {
                panels: updatedPanels,
              },
            })
            await this.logger.info(
              `✓ Inserted ${videoPanels.length} video panel(s) into lesson`,
            )
          } catch (error) {
            this.addError(`Inserting video panels for ${story.name}`, error as Error)
          }
        }

        this.idMaps.lessons.set(stepSlug, lesson.id as string)
        this.summary.lessonsCreated++
        await this.logger.success(`✓ Created lesson: ${story.name} (ID: ${lesson.id})`)
      } catch (error) {
        // Log full error details for debugging
        if (error instanceof Error && (error as any).data) {
          console.error('Full error details:', JSON.stringify((error as any).data, null, 2))
        }
        this.addError(`Creating lesson ${stepSlug}`, error as Error)
        continue // Keep going!
      }
    }
  }

  extractUnitFromSlug(slug: string): number {
    const match = slug.match(/step-(\d+)/)
    if (!match) return 1

    const stepNum = parseInt(match[1], 10)
    if (stepNum <= 6) return 1
    if (stepNum <= 11) return 2
    return 3
  }

  /**
   * Process text for text fields - converts various \\n patterns to spaces and handles other escape sequences
   */
  private processTextField(text: string): string {
    return text
      .replace(/\\\\n/g, ' ') // Convert \\\\n to spaces for text fields
      .replace(/\\\n/g, ' ') // Convert \\\n to spaces for text fields
      .replace(/\\n/g, ' ') // Convert \\n to spaces for text fields
      .replace(/\\\\t/g, ' ') // Convert \\\\t to spaces
      .replace(/\\\t/g, ' ') // Convert \\\t to spaces
      .replace(/\\t/g, ' ') // Convert \\t to spaces
      .replace(/\\\\r/g, ' ') // Convert \\\\r to spaces
      .replace(/\\\r/g, ' ') // Convert \\\r to spaces
      .replace(/\\r/g, ' ') // Convert \\r to spaces
      .replace(/\\\\/g, '\\') // Convert \\\\ to single backslash
      .replace(/\\"/g, '"') // Convert \\" to quote
      .replace(/\\'/g, "'") // Convert \\' to apostrophe
  }

  /**
   * Process text for textarea fields - converts various \\n patterns to newlines and handles other escape sequences
   */
  private processTextareaField(text: string): string {
    return text
      .replace(/\\\\n/g, '\n') // Convert \\\\n to actual newlines for textareas
      .replace(/\\\n/g, '\n') // Convert \\\n to actual newlines for textareas
      .replace(/\\n/g, '\n') // Convert \\n to actual newlines for textareas
      .replace(/\\\\t/g, '\t') // Convert \\\\t to tabs
      .replace(/\\\t/g, '\t') // Convert \\\t to tabs
      .replace(/\\t/g, '\t') // Convert \\t to tabs
      .replace(/\\\\r/g, '\r') // Convert \\\\r to carriage returns
      .replace(/\\\r/g, '\r') // Convert \\\r to carriage returns
      .replace(/\\r/g, '\r') // Convert \\r to carriage returns
      .replace(/\\\\/g, '\\') // Convert \\\\ to single backslash
      .replace(/\\"/g, '"') // Convert \\" to quote
      .replace(/\\'/g, "'") // Convert \\' to apostrophe
  }

  async resetCollections() {
    await this.logger.info('\n=== Resetting Collections ===')

    const collections: Array<CollectionSlug> = ['lessons', 'external-videos', 'media']

    // Ensure media tag exists for filtering
    await this.ensureMediaTag()

    for (const collection of collections) {
      await this.logger.info(`Deleting documents with tag ${IMPORT_TAG} from ${collection}...`)

      try {
        // For media collection, filter by tag
        let result
        if (collection === 'media' && this.mediaTagId) {
          result = await this.payload.find({
            collection,
            where: {
              tags: { contains: this.mediaTagId },
            },
            limit: 1000,
          })
        } else {
          // For other collections, delete all (they're owned by lessons)
          result = await this.payload.find({
            collection,
            limit: 1000,
          })
        }

        for (const doc of result.docs) {
          await this.payload.delete({
            collection,
            id: doc.id,
          })
        }

        await this.logger.success(`✓ Deleted ${result.docs.length} documents from ${collection}`)
      } catch (error) {
        this.addError(`Resetting collection ${collection}`, error as Error)
      }
    }

    await this.logger.success('✓ Reset complete')
  }

  printSummary() {
    console.log('\n' + '='.repeat(60))
    console.log('IMPORT SUMMARY')
    console.log('='.repeat(60))

    // Get MediaUploader stats
    const mediaStats = this.mediaUploader.getStats()

    console.log(`\n📊 Records Created:`)
    console.log(`  Lessons:             ${this.summary.lessonsCreated}`)
    console.log(`  Media Files:         ${mediaStats.uploaded}`)
    console.log(`  External Videos:     ${this.summary.externalVideosCreated}`)
    console.log(`  File Attachments:    ${this.summary.fileAttachmentsCreated}`)

    const totalRecords =
      this.summary.lessonsCreated +
      mediaStats.uploaded +
      this.summary.externalVideosCreated +
      this.summary.fileAttachmentsCreated

    console.log(`\n  Total Records:       ${totalRecords}`)
    console.log(`  Media Reused:        ${mediaStats.reused}`)

    if (this.summary.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${this.summary.warnings.length}):`)
      this.summary.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`)
      })
    }

    if (this.summary.errors.length > 0) {
      console.log(`\n❌ Errors (${this.summary.errors.length}):`)
      this.summary.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`)
      })
    }

    if (this.summary.errors.length === 0 && this.summary.warnings.length === 0) {
      console.log(`\n✨ No errors or warnings - import completed successfully!`)
    }

    console.log('\n' + '='.repeat(60))
  }

  async run() {
    try {
      // Validate environment variables
      if (!this.token) {
        throw new Error('STORYBLOK_ACCESS_TOKEN environment variable is required')
      }

      // Initialize Payload
      const payloadConfig = await configPromise
      this.payload = await getPayload({ config: payloadConfig })
      await this.initialize()

      await this.logger.info('=== Storyblok Path Steps Import ===')
      await this.logger.info(`Options: ${JSON.stringify(this.options)}`)

      // Setup cache directories
      await this.fileUtils.ensureDir(CACHE_DIR)
      await this.fileUtils.ensureDir(path.join(CACHE_DIR, 'videos'))
      await this.fileUtils.ensureDir(path.join(CACHE_DIR, 'assets/audio'))
      await this.fileUtils.ensureDir(path.join(CACHE_DIR, 'assets/images'))
      await this.fileUtils.ensureDir(path.join(CACHE_DIR, 'assets/videos'))
      await this.fileUtils.ensureDir(path.join(CACHE_DIR, 'assets/subtitles'))

      if (this.options.clearCache) {
        await this.logger.info('Clearing cache...')
        await this.fileUtils.clearDir(CACHE_DIR)
        await this.fileUtils.ensureDir(path.join(CACHE_DIR, 'videos'))
        await this.fileUtils.ensureDir(path.join(CACHE_DIR, 'assets/audio'))
        await this.fileUtils.ensureDir(path.join(CACHE_DIR, 'assets/images'))
        await this.fileUtils.ensureDir(path.join(CACHE_DIR, 'assets/videos'))
        await this.fileUtils.ensureDir(path.join(CACHE_DIR, 'assets/subtitles'))
      }

      if (this.options.reset) {
        await this.resetCollections()
      }

      const stories = await this.fetchAllPathSteps()

      let filteredStories = stories
      if (this.options.unit) {
        const unitNum = parseInt(this.options.unit, 10)
        filteredStories = stories.filter((s) => {
          const content = s.content as Record<string, unknown>
          const stepInfo = content.Step_info as Array<{ Unit_number?: number }> | undefined
          return (
            stepInfo?.[0]?.Unit_number === unitNum || this.extractUnitFromSlug(s.slug) === unitNum
          )
        })
        await this.logger.info(`Filtered to ${filteredStories.length} stories for unit ${unitNum}`)
      }

      await this.createLessons(filteredStories)

      this.printSummary()
    } catch (error) {
      console.error('Fatal error:', error)
      throw error
    } finally {
      // Cleanup: close Payload database connection
      if (this.payload?.db?.destroy) {
        await this.payload.db.destroy()
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const options: ScriptOptions = {
    dryRun: args.includes('--dry-run'),
    clearCache: args.includes('--clear-cache'),
    reset: args.includes('--reset'),
    unit: args.find((arg) => arg.startsWith('--unit='))?.split('=')[1],
  }

  const token = process.env.STORYBLOK_ACCESS_TOKEN
  if (!token) {
    console.error('Error: STORYBLOK_ACCESS_TOKEN environment variable is required')
    console.error('Please set the token in your environment to use this script.')
    console.error('This script is designed to import data from Storyblok CMS.')
    process.exit(1)
  }

  const importer = new StoryblokImporter(token, options)
  await importer.run()
  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
