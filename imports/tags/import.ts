/**
 * Meditation & Music Tags Import Script
 *
 * Imports MeditationTags (24 items) and MusicTags (4 items) from Cloudinary-hosted SVG assets.
 *
 * Features:
 * - Downloads SVG icons from Cloudinary URLs
 * - Replaces mapped colors with `currentColor` for theming flexibility
 * - Creates tags with specified slugs
 * - Imports only English (`en`) locale for localized title fields
 * - Updates existing tags on duplicate slugs
 *
 * Usage:
 *   npx tsx imports/tags/import.ts [flags]
 *
 * Flags:
 *   --dry-run      Validate data without writing to database
 *   --reset        Delete existing tags before import
 *   --clear-cache  Clear download cache before import
 */

import 'dotenv/config'

import { getPayload } from 'payload'
import configPromise from '../../src/payload.config'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { Payload } from 'payload'
import { Logger, FileUtils } from '../lib'

// ============================================================================
// CONFIGURATION
// ============================================================================

const IMPORT_TAG = 'import-tags' // Tag for tracking imported documents
const CACHE_DIR = path.resolve(process.cwd(), 'imports/cache/tags')

// ============================================================================
// TYPES
// ============================================================================

interface TagData {
  title: string
  slug: string
  color: string
  iconUrl: string
}

interface ScriptOptions {
  dryRun: boolean
  clearCache: boolean
  reset: boolean
}

interface ImportSummary {
  meditationTagsCreated: number
  meditationTagsUpdated: number
  musicTagsCreated: number
  musicTagsUpdated: number
  errors: string[]
  warnings: string[]
}

// ============================================================================
// TAG DATA CONSTANTS
// ============================================================================

const MEDITATION_TAGS: TagData[] = [
  {
    title: 'Excited for the day',
    slug: 'excited-today',
    color: '#FFD591',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989226/meditation-icons/user-states/Excited_for_the_day_2ae1a99e.svg',
  },
  {
    title: "Stressed and tense (Can't let go of the day)",
    slug: 'stressed-tense',
    color: '#DF8D7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989231/meditation-icons/user-states/Stressed_and_tense_Can_t_let_go_of_the_day_2ae1a99e.svg',
  },
  {
    title: 'Sad, emotionally down',
    slug: 'emotionally-down',
    color: '#DF8E7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989234/meditation-icons/user-states/Sad_emotionally_down_2ae1a99e.svg',
  },
  {
    title: "Can't wake up, lethargic",
    slug: 'feeling-lethargic',
    color: '#A4D9D1',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989238/meditation-icons/user-states/Can_t_wake_up_lethargic_2ae1a99e.svg',
  },
  {
    title: 'Too many thoughts, hard to focus',
    slug: 'hard-to-focus',
    color: '#DF8D7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989244/meditation-icons/user-states/Too_many_thoughts_hard_to_focus_2ae1a99e.svg',
  },
  {
    title: 'Feel guilty and regretful',
    slug: 'guilty-regretful',
    color: '#DF8E7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989247/meditation-icons/user-states/Feel_guilty_and_regretful_2ae1a99e.svg',
  },
  {
    title: 'Demotivated, uninspired',
    slug: 'demotivated-uninspired',
    color: '#A4C7D9',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989251/meditation-icons/user-states/Demotivated_uninspired_2ae1a99e.svg',
  },
  {
    title: 'Feel fine, just want to unwind',
    slug: 'want-to-unwind',
    color: '#A1C3D7',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989256/meditation-icons/user-states/Feel_fine_just_want_to_unwind_2ae1a99e.svg',
  },
  {
    title: 'Feel lonely',
    slug: 'feel-lonely',
    color: '#A6D6D1',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989259/meditation-icons/user-states/Feel_lonely_2ae1a99e.svg',
  },
  {
    title: 'Restless, too many thoughts',
    slug: 'restless-thoughts',
    color: '#DF8D7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989272/meditation-icons/user-states/Restless_too_many_thoughts_2ae1a99e.svg',
  },
  {
    title: "Mind is racing, can't relax",
    slug: 'mind-racing',
    color: '#DF8D7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989275/meditation-icons/user-states/Mind_is_racing_can_t_relax_2ae1a99e.svg',
  },
  {
    title: 'Fine, just want to reconnect',
    slug: 'want-to-reconnect',
    color: '#A1C3D7',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989280/meditation-icons/user-states/Fine_just_want_to_reconnect_2ae1a99e.svg',
  },
  {
    title: 'Wired and agitated',
    slug: 'wired-agitated',
    color: '#A6D6D0',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989283/meditation-icons/user-states/Wired_and_agitated_2ae1a99e.svg',
  },
  {
    title: 'Feel Insecure, lacking self esteem',
    slug: 'low-self-esteem',
    color: '#A6D6D0',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989286/meditation-icons/user-states/Feel_Insecure_lacking_self_esteem_2ae1a99e.svg',
  },
  {
    title: 'Tired and overwhelmed',
    slug: 'tired-overwhelmed',
    color: '#A4C7D9',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989289/meditation-icons/user-states/Tired_and_overwhelmed_2ae1a99e.svg',
  },
  {
    title: 'Had a great day, feeling good!',
    slug: 'feeling-good',
    color: '#DF8E79',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989292/meditation-icons/user-states/Had_a_great_day_feeling_good_2ae1a99e.svg',
  },
  {
    title: 'Feel Anxious and Overwhelmed',
    slug: 'anxious-overwhelmed',
    color: '#FED593',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989295/meditation-icons/user-states/Feel_Anxious_and_Overwhelmed_2ae1a99e.svg',
  },
  {
    title: 'Feel stressed',
    slug: 'feel-stressed',
    color: '#DF8D7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989298/meditation-icons/user-states/Feel_stressed_2ae1a99e.svg',
  },
  {
    title: 'Feel Exhausted',
    slug: 'feel-exhausted',
    color: '#A4C7D9',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989301/meditation-icons/user-states/Feel_Exhausted_2ae1a99e.svg',
  },
  {
    title: 'Feel Angry',
    slug: 'feel-angry',
    color: '#FED593',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989304/meditation-icons/user-states/Feel_Angry_2ae1a99e.svg',
  },
  {
    title: 'Feeling Fine',
    slug: 'feeling-fine',
    color: '#A1C3D7',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989307/meditation-icons/user-states/Feeling_Fine_2ae1a99e.svg',
  },
  {
    title: 'Low on energy, need a boost',
    slug: 'need-energy-boost',
    color: '#A4C7D9',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989310/meditation-icons/user-states/Low_on_energy_need_a_boost_2ae1a99e.svg',
  },
  {
    title: 'Overwhelmed, need to pause',
    slug: 'need-to-pause',
    color: '#A4C7D9',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989313/meditation-icons/user-states/Overwhelmed_need_to_pause_2ae1a99e.svg',
  },
  {
    title: 'Seeking deeper spiritual experience',
    slug: 'spiritual-experience',
    color: '#A4D9D1',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989317/meditation-icons/user-states/Seeking_deeper_spiritual_experience_2ae1a99e.svg',
  },
]

const MUSIC_TAGS: TagData[] = [
  {
    title: 'Nature',
    slug: 'nature',
    color: '#1E6C71', // Note: MusicTags collection doesn't have a color field, kept for reference
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763990177/meditation-icons/music-icons/Nature.svg',
  },
  {
    title: 'Flute',
    slug: 'flute',
    color: '#1E6C71',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763990180/meditation-icons/music-icons/Flute.svg',
  },
  {
    title: 'None',
    slug: 'none',
    color: '#1E6C71',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763990181/meditation-icons/music-icons/None.svg',
  },
  {
    title: 'Strings',
    slug: 'strings',
    color: '#1E6C71',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763990183/meditation-icons/music-icons/Strings.svg',
  },
]

// ============================================================================
// MAIN IMPORTER CLASS
// ============================================================================

class TagsImporter {
  private payload!: Payload
  private options: ScriptOptions
  private logger!: Logger
  private fileUtils!: FileUtils

  // Summary tracking
  private summary: ImportSummary = {
    meditationTagsCreated: 0,
    meditationTagsUpdated: 0,
    musicTagsCreated: 0,
    musicTagsUpdated: 0,
    errors: [],
    warnings: [],
  }

  constructor(options: ScriptOptions) {
    this.options = options
  }

  private async initialize() {
    this.logger = new Logger(CACHE_DIR)
    this.fileUtils = new FileUtils(this.logger)
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

  /**
   * Download SVG from URL and return its content
   */
  private async downloadSvg(url: string, cacheFilename: string): Promise<string> {
    const cachePath = path.join(CACHE_DIR, 'assets', cacheFilename)

    // Check cache first
    if (await this.fileUtils.fileExists(cachePath)) {
      await this.logger.info(`Using cached SVG: ${cacheFilename}`)
      return fs.readFile(cachePath, 'utf-8')
    }

    // Download from URL
    await this.logger.info(`Downloading SVG: ${cacheFilename}`)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download SVG: ${response.status} ${response.statusText}`)
    }

    const svgContent = await response.text()

    // Cache the original SVG
    await this.fileUtils.ensureDir(path.dirname(cachePath))
    await fs.writeFile(cachePath, svgContent, 'utf-8')

    return svgContent
  }

  /**
   * Convert ALL hardcoded colors in SVG to currentColor for theming flexibility
   * Replaces both 6-digit (#RRGGBB) and 3-digit (#RGB) hex colors
   */
  private convertToCurrentColor(svgContent: string): string {
    // Match both 6-digit and 3-digit hex colors (case-insensitive)
    // The negative lookbehind (?<![\w]) prevents matching hex in URLs or other contexts
    const hexColorRegex = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![\w])/g
    return svgContent.replace(hexColorRegex, 'currentColor')
  }

  /**
   * Create a file object from SVG content for Payload upload
   */
  private createSvgFileObject(
    svgContent: string,
    filename: string,
  ): { data: Buffer; mimetype: string; name: string; size: number } {
    const buffer = Buffer.from(svgContent, 'utf-8')
    return {
      data: buffer,
      mimetype: 'image/svg+xml',
      name: filename,
      size: buffer.length,
    }
  }

  /**
   * Import MeditationTags
   */
  private async importMeditationTags(): Promise<void> {
    await this.logger.info('\n=== Importing Meditation Tags ===')

    for (const tag of MEDITATION_TAGS) {
      try {
        // Download and process SVG
        const cacheFilename = `meditation-${tag.slug}.svg`
        const originalSvg = await this.downloadSvg(tag.iconUrl, cacheFilename)
        const processedSvg = this.convertToCurrentColor(originalSvg)

        if (this.options.dryRun) {
          await this.logger.info(`[DRY RUN] Would import meditation tag: ${tag.title} (${tag.slug})`)
          this.summary.meditationTagsCreated++
          continue
        }

        // Check if tag already exists
        const existing = await this.payload.find({
          collection: 'meditation-tags',
          where: { slug: { equals: tag.slug } },
          limit: 1,
        })

        const svgFile = this.createSvgFileObject(processedSvg, `${tag.slug}.svg`)

        if (existing.docs.length > 0) {
          // Update existing tag
          await this.payload.update({
            collection: 'meditation-tags',
            id: existing.docs[0].id,
            data: {
              title: tag.title,
              color: tag.color,
            },
            locale: 'en',
            file: svgFile,
          })
          this.summary.meditationTagsUpdated++
          await this.logger.success(`✓ Updated meditation tag: ${tag.title}`)
        } else {
          // Create new tag
          await this.payload.create({
            collection: 'meditation-tags',
            data: {
              slug: tag.slug,
              title: tag.title,
              color: tag.color,
            },
            locale: 'en',
            file: svgFile,
          })
          this.summary.meditationTagsCreated++
          await this.logger.success(`✓ Created meditation tag: ${tag.title}`)
        }
      } catch (error) {
        this.addError(`Importing meditation tag "${tag.title}"`, error as Error)
        continue // Keep going!
      }
    }
  }

  /**
   * Import MusicTags
   * Note: MusicTags collection does not have a color field
   */
  private async importMusicTags(): Promise<void> {
    await this.logger.info('\n=== Importing Music Tags ===')

    for (const tag of MUSIC_TAGS) {
      try {
        // Download and process SVG
        const cacheFilename = `music-${tag.slug}.svg`
        const originalSvg = await this.downloadSvg(tag.iconUrl, cacheFilename)
        const processedSvg = this.convertToCurrentColor(originalSvg)

        if (this.options.dryRun) {
          await this.logger.info(`[DRY RUN] Would import music tag: ${tag.title} (${tag.slug})`)
          this.summary.musicTagsCreated++
          continue
        }

        // Check if tag already exists
        const existing = await this.payload.find({
          collection: 'music-tags',
          where: { slug: { equals: tag.slug } },
          limit: 1,
        })

        const svgFile = this.createSvgFileObject(processedSvg, `${tag.slug}.svg`)

        if (existing.docs.length > 0) {
          // Update existing tag (no color field for MusicTags)
          await this.payload.update({
            collection: 'music-tags',
            id: existing.docs[0].id,
            data: {
              title: tag.title,
            },
            locale: 'en',
            file: svgFile,
          })
          this.summary.musicTagsUpdated++
          await this.logger.success(`✓ Updated music tag: ${tag.title}`)
        } else {
          // Create new tag (no color field for MusicTags)
          await this.payload.create({
            collection: 'music-tags',
            data: {
              slug: tag.slug,
              title: tag.title,
            },
            locale: 'en',
            file: svgFile,
          })
          this.summary.musicTagsCreated++
          await this.logger.success(`✓ Created music tag: ${tag.title}`)
        }
      } catch (error) {
        this.addError(`Importing music tag "${tag.title}"`, error as Error)
        continue // Keep going!
      }
    }
  }

  /**
   * Reset (delete) all tags
   */
  private async resetCollections(): Promise<void> {
    await this.logger.info('\n=== Resetting Collections ===')

    // Delete all MeditationTags
    try {
      const meditationTags = await this.payload.find({
        collection: 'meditation-tags',
        limit: 100,
      })

      for (const doc of meditationTags.docs) {
        await this.payload.delete({
          collection: 'meditation-tags',
          id: doc.id,
        })
      }
      await this.logger.success(`✓ Deleted ${meditationTags.docs.length} meditation tags`)
    } catch (error) {
      this.addError('Resetting meditation-tags', error as Error)
    }

    // Delete all MusicTags
    try {
      const musicTags = await this.payload.find({
        collection: 'music-tags',
        limit: 100,
      })

      for (const doc of musicTags.docs) {
        await this.payload.delete({
          collection: 'music-tags',
          id: doc.id,
        })
      }
      await this.logger.success(`✓ Deleted ${musicTags.docs.length} music tags`)
    } catch (error) {
      this.addError('Resetting music-tags', error as Error)
    }
  }

  /**
   * Print summary report
   */
  private printSummary(): void {
    console.log('\n' + '='.repeat(60))
    console.log('IMPORT SUMMARY')
    console.log('='.repeat(60))

    console.log(`\n📊 Meditation Tags:`)
    console.log(`  Created:             ${this.summary.meditationTagsCreated}`)
    console.log(`  Updated:             ${this.summary.meditationTagsUpdated}`)

    console.log(`\n📊 Music Tags:`)
    console.log(`  Created:             ${this.summary.musicTagsCreated}`)
    console.log(`  Updated:             ${this.summary.musicTagsUpdated}`)

    const totalCreated = this.summary.meditationTagsCreated + this.summary.musicTagsCreated
    const totalUpdated = this.summary.meditationTagsUpdated + this.summary.musicTagsUpdated

    console.log(`\n  Total Created:       ${totalCreated}`)
    console.log(`  Total Updated:       ${totalUpdated}`)

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

  /**
   * Main run method
   */
  async run(): Promise<void> {
    try {
      // Setup cache directories FIRST (before Logger initialization)
      await fs.mkdir(CACHE_DIR, { recursive: true })
      await fs.mkdir(path.join(CACHE_DIR, 'assets'), { recursive: true })

      // Initialize Payload
      const payloadConfig = await configPromise
      this.payload = await getPayload({ config: payloadConfig })
      await this.initialize()

      await this.logger.info('=== Meditation & Music Tags Import ===')
      await this.logger.info(`Options: ${JSON.stringify(this.options)}`)

      if (this.options.clearCache) {
        await this.logger.info('Clearing cache...')
        await this.fileUtils.clearDir(path.join(CACHE_DIR, 'assets'))
      }

      if (this.options.reset && !this.options.dryRun) {
        await this.resetCollections()
      } else if (this.options.reset && this.options.dryRun) {
        await this.logger.info('[DRY RUN] Would reset all tags')
      }

      // Import tags
      await this.importMeditationTags()
      await this.importMusicTags()

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

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const options: ScriptOptions = {
    dryRun: args.includes('--dry-run'),
    clearCache: args.includes('--clear-cache'),
    reset: args.includes('--reset'),
  }

  console.log('Meditation & Music Tags Import Script')
  console.log('=====================================')
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Reset: ${options.reset ? 'YES' : 'NO'}`)
  console.log(`Clear Cache: ${options.clearCache ? 'YES' : 'NO'}`)
  console.log('')

  const importer = new TagsImporter(options)
  await importer.run()
  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
