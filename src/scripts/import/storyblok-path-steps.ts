import * as dotenv from 'dotenv'
// Load environment variables FIRST before importing anything else
dotenv.config()

import { getPayload } from 'payload'
import { payloadConfig } from '@/payload.config'
import * as fs from 'fs/promises'
import { createWriteStream } from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as https from 'https'
import * as http from 'http'
import * as sharp from 'sharp'
import type { Payload } from 'payload'

const __filename = fileURLToPath(import.meta.url)

const CACHE_DIR = path.resolve(process.cwd(), 'import-cache/storyblok')
const STATE_FILE = path.join(CACHE_DIR, 'import-state.json')
const LOG_FILE = path.join(CACHE_DIR, 'import.log')

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

interface ImportState {
  lastUpdated: string
  phase: string
  unitsCreated: Record<string, string>
  lessonsCreated: Record<string, string>
  failed: string[]
}

interface ScriptOptions {
  dryRun: boolean
  clearCache: boolean
  reset: boolean
  resume: boolean
  unit?: string
}

class StoryblokImporter {
  private token: string
  private payload!: Payload
  private state: ImportState
  private options: ScriptOptions

  constructor(token: string, options: ScriptOptions) {
    this.token = token
    this.options = options
    this.state = {
      lastUpdated: new Date().toISOString(),
      phase: 'initializing',
      unitsCreated: {},
      lessonsCreated: {},
      failed: [],
    }
  }

  async log(message: string, isError = false) {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}\n`
    console.log(message)
    await fs.appendFile(LOG_FILE, logMessage)
    if (isError) {
      this.state.failed.push(message)
    }
  }

  async saveState() {
    this.state.lastUpdated = new Date().toISOString()
    await fs.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2))
  }

  async loadState() {
    try {
      const data = await fs.readFile(STATE_FILE, 'utf-8')
      this.state = JSON.parse(data)
      await this.log(`Loaded state from ${STATE_FILE}`)
    } catch {
      await this.log('No previous state found, starting fresh')
    }
  }

  async downloadFile(url: string, destPath: string): Promise<void> {
    const fileExists = await fs
      .access(destPath)
      .then(() => true)
      .catch(() => false)

    if (fileExists) {
      const stats = await fs.stat(destPath)
      if (stats.size > 0) {
        return
      }
    }

    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http
      let attempts = 0
      const maxAttempts = 3

      const attemptDownload = () => {
        attempts++
        protocol
          .get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
              if (response.headers.location) {
                url = response.headers.location
                attemptDownload()
                return
              }
            }

            if (response.statusCode !== 200) {
              reject(new Error(`Failed to download: ${response.statusCode}`))
              return
            }

            const fileStream = createWriteStream(destPath)
            response.pipe(fileStream)
            fileStream.on('finish', () => {
              fileStream.close()
              resolve()
            })
            fileStream.on('error', (err: Error) => {
              fs.unlink(destPath).catch(() => {})
              reject(err)
            })
          })
          .on('error', (err: Error) => {
            if (attempts < maxAttempts) {
              setTimeout(attemptDownload, 1000 * Math.pow(2, attempts))
            } else {
              reject(err)
            }
          })
      }

      attemptDownload()
    })
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
    await this.log('Fetching all path steps from Storyblok...')
    const response: StoryblokResponse = await this.fetchStoryblokData(
      'stories?starts_with=path/path-steps&per_page=100',
    )
    await this.log(`Fetched ${response.stories.length} path steps`)
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

    await this.log(`Fetching video story ${uuid}...`)
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
      await sharp.default(imagePath).webp({ quality: 90 }).toFile(webpPath)
      await this.log(`Converted ${path.basename(imagePath)} to WebP`)
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

    const fileBuffer = await fs.readFile(webpPath)
    const media = await this.payload.create({
      collection: 'media',
      data: {
        alt: alt || filename,
      },
      file: {
        data: fileBuffer,
        name: path.basename(webpPath),
        size: fileBuffer.length,
        mimetype: 'image/webp',
      },
    })

    return media.id as string
  }

  async createFileAttachment(
    url: string,
    ownerCollection?: 'lessons' | 'lesson-units',
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

    return attachment.id as string
  }

  async updateFileAttachmentOwner(
    attachmentId: string,
    ownerCollection: 'lessons' | 'lesson-units',
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

            const uploadNode: Record<string, unknown> = {
              type: 'upload',
              relationTo: 'media',
              value: {
                id: mediaId,
              },
              version: 1,
            }

            // Add caption field if caption text exists
            if (captionText.trim()) {
              uploadNode.fields = {
                caption: captionText,
              }
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

  async createLessonUnits(stories: StoryblokStory[]): Promise<void> {
    await this.log('\n=== Creating Lesson Units ===')
    this.state.phase = 'creating-units'
    await this.saveState()

    const units = new Map<number, { stories: StoryblokStory[]; color: string }>()

    for (const story of stories) {
      const content = story.content as Record<string, any>
      const unitNumber = content.Step_info?.[0]?.Unit_number || this.extractUnitFromSlug(story.slug)

      if (!units.has(unitNumber)) {
        units.set(unitNumber, {
          stories: [],
          color: content.Audio_intro?.[0]?.Background_color || '#000000',
        })
      }
      units.get(unitNumber)!.stories.push(story)
    }

    for (const [unitNumber, { color }] of units) {
      if (this.state.unitsCreated[`unit-${unitNumber}`]) {
        await this.log(`Unit ${unitNumber} already created, skipping`)
        continue
      }

      if (this.options.dryRun) {
        await this.log(`[DRY RUN] Would create Unit ${unitNumber} with color ${color}`)
        continue
      }

      const unit = await this.payload.create({
        collection: 'lesson-units',
        data: {
          title: `Unit ${unitNumber}`,
          color,
          position: unitNumber,
          steps: [],
        },
      })

      this.state.unitsCreated[`unit-${unitNumber}`] = unit.id as string
      await this.saveState()
      await this.log(`✓ Created Unit ${unitNumber} (ID: ${unit.id})`)
    }
  }

  async createLessons(stories: StoryblokStory[]): Promise<void> {
    await this.log('\n=== Creating Lessons ===')
    this.state.phase = 'importing-lessons'
    await this.saveState()

    for (const story of stories) {
      const stepSlug = story.slug

      if (this.state.lessonsCreated[stepSlug]) {
        await this.log(`Lesson ${stepSlug} already created, skipping`)
        continue
      }

      try {
        await this.log(`\nProcessing ${story.name} (${stepSlug})...`)

        if (this.options.dryRun) {
          await this.log(`[DRY RUN] Would create lesson: ${story.name}`)
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
        for (const panel of sortedPanels) {
          try {
            if (panel.Video && panel.Video.filename) {
              const videoUrl = panel.Video.filename
              const videoId = await this.createFileAttachment(videoUrl)
              panels.push({
                blockType: 'video' as const,
                video: videoId,
              })
            } else if (panel.Image && panel.Image.url) {
              const imageId = await this.createMediaFromUrl(panel.Image.url, panel.Title)
              panels.push({
                blockType: 'text' as const,
                title: this.processTextField(panel.Title || ''), // Process as text field
                text: this.processTextareaField(panel.Text || ''), // Process as textarea field
                image: imageId,
              })
            } else {
              await this.log(`Warning: Panel missing both video and image for ${story.name}`)
            }
          } catch (error) {
            await this.log(`Error processing panel for ${story.name}: ${error}`, true)
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
              await this.log(`✓ Found meditation: ${expectedMeditationTitle}`)
            } else {
              await this.log(
                `Warning: Meditation "${expectedMeditationTitle}" not found for ${story.name}`,
                true,
              )
              meditationId = undefined
            }
          } else {
            await this.log(
              `Warning: Could not extract step number from slug "${stepSlug}" for ${story.name}`,
              true,
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
            await this.log(
              `Warning: Failed to create audio attachment for ${story.name}: ${error}`,
              true,
            )
          }
        }

        let introSubtitles: Record<string, unknown> | undefined = undefined
        if (content.Audio_intro?.[0]?.Subtitles?.filename) {
          try {
            introSubtitles = await this.parseSubtitles(content.Audio_intro[0].Subtitles.filename)
          } catch (error) {
            await this.log(`Warning: Failed to parse subtitles for ${story.name}: ${error}`, true)
          }
        }

        let article: Record<string, unknown> | undefined = undefined
        if (content.Delving_deeper_article?.[0]?.Blocks) {
          try {
            article = await this.convertLexicalBlocks(content.Delving_deeper_article[0].Blocks)
          } catch (error) {
            await this.log(`Warning: Failed to convert article for ${story.name}: ${error}`, true)
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
          await this.log(
            `Error: No valid panels found for ${story.name}, skipping lesson creation`,
            true,
          )
          continue
        }

        // Extract step number from slug (e.g., "step-1" -> 1)
        const stepMatch = stepSlug.match(/step-(\d+)/)
        const stepNumber = stepMatch ? parseInt(stepMatch[1], 10) : 1

        // Extract color from audio intro or use default
        const color = content.Audio_intro?.[0]?.Background_color || '#000000'

        const lessonData: any = {
          title: this.processTextField(story.name), // Process as text field - converts \\n to spaces
          unit: unitNumber,
          step: stepNumber,
          color: color,
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
        })

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
            await this.log(`✓ Added intro audio to lesson`)
          } catch (error) {
            await this.log(`Warning: Failed to add intro audio to lesson: ${error}`, true)
          }
        }

        this.state.lessonsCreated[stepSlug] = lesson.id as string
        await this.saveState()
        await this.log(`✓ Created lesson: ${story.name} (ID: ${lesson.id})`)

        const unitId = this.state.unitsCreated[`unit-${unitNumber}`]
        if (unitId && content.Step_info?.[0]?.Step_Image?.url) {
          const iconId = await this.createFileAttachment(
            content.Step_info[0].Step_Image.url,
            'lesson-units',
            unitId,
          )

          const unit = await this.payload.findByID({
            collection: 'lesson-units',
            id: unitId,
          })

          const steps = unit.steps || []
          steps.push({
            lesson: lesson.id as string,
            icon: iconId,
          })

          await this.payload.update({
            collection: 'lesson-units',
            id: unitId,
            data: {
              steps,
            },
          })

          await this.log(`✓ Added step to Unit ${unitNumber}`)
        }
      } catch (error) {
        await this.log(`Error creating lesson ${stepSlug}: ${error}`, true)
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
    await this.log('\n=== Resetting Collections ===')

    const collections: Array<'lessons' | 'lesson-units' | 'file-attachments' | 'external-videos'> =
      ['lessons', 'lesson-units', 'file-attachments', 'external-videos']

    for (const collection of collections) {
      await this.log(`Deleting all documents from ${collection}...`)
      const result = await this.payload.find({
        collection,
        limit: 1000,
      })

      for (const doc of result.docs) {
        await this.payload.delete({
          collection,
          id: doc.id,
        })
      }

      await this.log(`✓ Deleted ${result.docs.length} documents from ${collection}`)
    }

    this.state = {
      lastUpdated: new Date().toISOString(),
      phase: 'initializing',
      unitsCreated: {},
      lessonsCreated: {},
      failed: [],
    }
    await this.saveState()
    await this.log('✓ Reset complete')
  }

  async run() {
    this.payload = await getPayload({ config: payloadConfig() })

    if (!this.token) {
      throw new Error('STORYBLOK_ACCESS_TOKEN environment variable is required')
    }

    await this.log('=== Storyblok Path Steps Import ===')
    await this.log(`Options: ${JSON.stringify(this.options)}`)

    if (this.options.clearCache) {
      await this.log('Clearing cache...')
      await fs.rm(CACHE_DIR, { recursive: true, force: true })
      await fs.mkdir(CACHE_DIR, { recursive: true })
      await fs.mkdir(path.join(CACHE_DIR, 'videos'), { recursive: true })
      await fs.mkdir(path.join(CACHE_DIR, 'assets/audio'), { recursive: true })
      await fs.mkdir(path.join(CACHE_DIR, 'assets/images'), { recursive: true })
      await fs.mkdir(path.join(CACHE_DIR, 'assets/videos'), { recursive: true })
      await fs.mkdir(path.join(CACHE_DIR, 'assets/subtitles'), { recursive: true })
    }

    if (this.options.reset) {
      await this.resetCollections()
    }

    if (this.options.resume) {
      await this.loadState()
    }

    const stories = await this.fetchAllPathSteps()

    let filteredStories = stories
    if (this.options.unit) {
      const unitNum = parseInt(this.options.unit, 10)
      filteredStories = stories.filter((s) => {
        const content = s.content as Record<string, any>
        return (
          content.Step_info?.[0]?.Unit_number === unitNum ||
          this.extractUnitFromSlug(s.slug) === unitNum
        )
      })
      await this.log(`Filtered to ${filteredStories.length} stories for unit ${unitNum}`)
    }

    await this.createLessonUnits(filteredStories)
    await this.createLessons(filteredStories)

    await this.log('\n=== Import Complete ===')
    await this.log(`Created ${Object.keys(this.state.unitsCreated).length} units`)
    await this.log(`Created ${Object.keys(this.state.lessonsCreated).length} lessons`)
    if (this.state.failed.length > 0) {
      await this.log(`\nFailed operations: ${this.state.failed.length}`)
      this.state.failed.forEach((msg) => this.log(`  - ${msg}`))
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const options: ScriptOptions = {
    dryRun: args.includes('--dry-run'),
    clearCache: args.includes('--clear-cache'),
    reset: args.includes('--reset'),
    resume: args.includes('--resume'),
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
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
