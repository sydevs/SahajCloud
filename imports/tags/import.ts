/* eslint-disable no-console */

/**
 * Meditation & Music Tags Import Script
 *
 * Imports MeditationTags (24 items) and MusicTags (4 items) from Cloudinary-hosted SVG assets.
 *
 * Features:
 * - Downloads SVG icons from Cloudinary URLs
 * - Replaces mapped colors with `currentColor` for theming flexibility
 * - Idempotent: safely re-runnable (updates existing, creates new)
 * - Imports only English (`en`) locale for localized title fields
 *
 * Usage:
 *   pnpm import tags [flags]
 *
 * Flags:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 */

import * as fs from 'fs/promises'
import * as path from 'path'

import { BaseImporter, BaseImportOptions, parseArgs } from '../lib'

// ============================================================================
// CONFIGURATION
// ============================================================================

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
// TAGS IMPORTER CLASS
// ============================================================================

class TagsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Meditation & Music Tags'
  protected readonly cacheDir = CACHE_DIR

  // ============================================================================
  // MAIN IMPORT LOGIC
  // ============================================================================

  protected async import(): Promise<void> {
    await this.importMeditationTags()
    await this.importMusicTags()
  }

  // ============================================================================
  // MEDITATION TAGS
  // ============================================================================

  private async importMeditationTags(): Promise<void> {
    await this.logger.info('\n=== Importing Meditation Tags ===')
    await this.logger.progress(0, MEDITATION_TAGS.length, 'Meditation tags')

    for (let i = 0; i < MEDITATION_TAGS.length; i++) {
      const tag = MEDITATION_TAGS[i]

      try {
        // Download and process SVG
        const cacheFilename = `meditation-${tag.slug}.svg`
        const originalSvg = await this.downloadSvg(tag.iconUrl, cacheFilename)
        const processedSvg = this.convertToCurrentColor(originalSvg)
        const svgFile = this.createSvgFileObject(processedSvg, `${tag.slug}.svg`)

        // Upsert: find by slug, update if exists, create if not
        await this.upsert(
          'meditation-tags',
          { slug: { equals: tag.slug } },
          {
            slug: tag.slug,
            title: tag.title,
            color: tag.color,
          },
          { locale: 'en', file: svgFile },
        )
      } catch (error) {
        this.addError(`Importing meditation tag "${tag.title}"`, error as Error)
      }

      await this.logger.progress(i + 1, MEDITATION_TAGS.length, 'Meditation tags')
    }
  }

  // ============================================================================
  // MUSIC TAGS
  // ============================================================================

  private async importMusicTags(): Promise<void> {
    await this.logger.info('\n=== Importing Music Tags ===')
    await this.logger.progress(0, MUSIC_TAGS.length, 'Music tags')

    for (let i = 0; i < MUSIC_TAGS.length; i++) {
      const tag = MUSIC_TAGS[i]

      try {
        // Download and process SVG
        const cacheFilename = `music-${tag.slug}.svg`
        const originalSvg = await this.downloadSvg(tag.iconUrl, cacheFilename)
        const processedSvg = this.convertToCurrentColor(originalSvg)
        const svgFile = this.createSvgFileObject(processedSvg, `${tag.slug}.svg`)

        // Upsert: find by slug, update if exists, create if not
        // Note: MusicTags collection does not have a color field
        await this.upsert(
          'music-tags',
          { slug: { equals: tag.slug } },
          {
            slug: tag.slug,
            title: tag.title,
          },
          { locale: 'en', file: svgFile },
        )
      } catch (error) {
        this.addError(`Importing music tag "${tag.title}"`, error as Error)
      }

      await this.logger.progress(i + 1, MUSIC_TAGS.length, 'Music tags')
    }
  }

  // ============================================================================
  // SVG PROCESSING HELPERS
  // ============================================================================

  /**
   * Download SVG from URL and return its content
   */
  private async downloadSvg(url: string, cacheFilename: string): Promise<string> {
    const cachePath = path.join(this.cacheDir, 'assets', cacheFilename)

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
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs()

  const importer = new TagsImporter(options)
  await importer.run()
  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
