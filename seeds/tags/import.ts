/**
 * Tags Import Script
 *
 * Imports UserChoices (24 items) and SongTags (7 items).
 *
 * Features:
 * - Downloads SVG icons from remote URLs or loads from local files (local: prefix)
 * - Replaces mapped colors with `currentColor` for theming flexibility
 * - Idempotent: safely re-runnable (updates existing, creates new)
 * - Imports only English (`en`) locale for localized title fields
 *
 * Note: Image tags are now inline enum select options on the Images collection,
 * not a separate collection requiring import.
 *
 * Usage:
 *   pnpm seed tags [flags]
 *
 * Flags:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 */

import type { Payload } from 'payload'

import * as path from 'path'

import { BaseImporter, BaseImportOptions, readCacheText, writeCache } from '../lib'
import { safeBufferFromUint8Array } from '../lib/runtime'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DIR = path.resolve(process.cwd(), 'seeds/cache/tags')

// ============================================================================
// TYPES
// ============================================================================

interface TagData {
  title: string
  slug: string
  color: string
  iconUrl: string
  timings?: ('morning' | 'afternoon' | 'evening' | 'night')[]
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
    timings: ['morning'],
  },
  {
    title: "Stressed and tense (Can't let go of the day)",
    slug: 'stressed-tense',
    color: '#DF8D7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989231/meditation-icons/user-states/Stressed_and_tense_Can_t_let_go_of_the_day_2ae1a99e.svg',
    timings: ['evening', 'night'],
  },
  {
    title: 'Sad, emotionally down',
    slug: 'emotionally-down',
    color: '#DF8E7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989234/meditation-icons/user-states/Sad_emotionally_down_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening', 'night'],
  },
  {
    title: "Can't wake up, lethargic",
    slug: 'feeling-lethargic',
    color: '#A4D9D1',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989238/meditation-icons/user-states/Can_t_wake_up_lethargic_2ae1a99e.svg',
    timings: ['morning'],
  },
  {
    title: 'Too many thoughts, hard to focus',
    slug: 'hard-to-focus',
    color: '#DF8D7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989244/meditation-icons/user-states/Too_many_thoughts_hard_to_focus_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening', 'night'],
  },
  {
    title: 'Feel guilty and regretful',
    slug: 'guilty-regretful',
    color: '#DF8E7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989247/meditation-icons/user-states/Feel_guilty_and_regretful_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening', 'night'],
  },
  {
    title: 'Demotivated, uninspired',
    slug: 'demotivated-uninspired',
    color: '#A4C7D9',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989251/meditation-icons/user-states/Demotivated_uninspired_2ae1a99e.svg',
    timings: ['morning', 'afternoon'],
  },
  {
    title: 'Feel fine, just want to unwind',
    slug: 'want-to-unwind',
    color: '#A1C3D7',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989256/meditation-icons/user-states/Feel_fine_just_want_to_unwind_2ae1a99e.svg',
    timings: ['evening', 'night'],
  },
  {
    title: 'Feel lonely',
    slug: 'feel-lonely',
    color: '#A6D6D1',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989259/meditation-icons/user-states/Feel_lonely_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening', 'night'],
  },
  {
    title: 'Restless, too many thoughts',
    slug: 'restless-thoughts',
    color: '#DF8D7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989272/meditation-icons/user-states/Restless_too_many_thoughts_2ae1a99e.svg',
    timings: ['evening', 'night'],
  },
  {
    title: "Mind is racing, can't relax",
    slug: 'mind-racing',
    color: '#DF8D7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989275/meditation-icons/user-states/Mind_is_racing_can_t_relax_2ae1a99e.svg',
    timings: ['evening', 'night'],
  },
  {
    title: 'Fine, just want to reconnect',
    slug: 'want-to-reconnect',
    color: '#A1C3D7',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989280/meditation-icons/user-states/Fine_just_want_to_reconnect_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening', 'night'],
  },
  {
    title: 'Wired and agitated',
    slug: 'wired-agitated',
    color: '#A6D6D0',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989283/meditation-icons/user-states/Wired_and_agitated_2ae1a99e.svg',
    timings: ['afternoon', 'evening', 'night'],
  },
  {
    title: 'Feel Insecure, lacking self esteem',
    slug: 'low-self-esteem',
    color: '#A6D6D0',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989286/meditation-icons/user-states/Feel_Insecure_lacking_self_esteem_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening', 'night'],
  },
  {
    title: 'Tired and overwhelmed',
    slug: 'tired-overwhelmed',
    color: '#A4C7D9',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989289/meditation-icons/user-states/Tired_and_overwhelmed_2ae1a99e.svg',
    timings: ['afternoon', 'evening'],
  },
  {
    title: 'Had a great day, feeling good!',
    slug: 'feeling-good',
    color: '#DF8E79',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989292/meditation-icons/user-states/Had_a_great_day_feeling_good_2ae1a99e.svg',
    timings: ['evening'],
  },
  {
    title: 'Feel Anxious and Overwhelmed',
    slug: 'anxious-overwhelmed',
    color: '#FED593',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989295/meditation-icons/user-states/Feel_Anxious_and_Overwhelmed_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening', 'night'],
  },
  {
    title: 'Feel stressed',
    slug: 'feel-stressed',
    color: '#DF8D7A',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989298/meditation-icons/user-states/Feel_stressed_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening', 'night'],
  },
  {
    title: 'Feel Exhausted',
    slug: 'feel-exhausted',
    color: '#A4C7D9',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989301/meditation-icons/user-states/Feel_Exhausted_2ae1a99e.svg',
    timings: ['afternoon', 'evening', 'night'],
  },
  {
    title: 'Feel Angry',
    slug: 'feel-angry',
    color: '#FED593',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989304/meditation-icons/user-states/Feel_Angry_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening', 'night'],
  },
  {
    title: 'Feeling Fine',
    slug: 'feeling-fine',
    color: '#A1C3D7',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989307/meditation-icons/user-states/Feeling_Fine_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening', 'night'],
  },
  {
    title: 'Low on energy, need a boost',
    slug: 'need-energy-boost',
    color: '#A4C7D9',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989310/meditation-icons/user-states/Low_on_energy_need_a_boost_2ae1a99e.svg',
    timings: ['morning', 'afternoon'],
  },
  {
    title: 'Overwhelmed, need to pause',
    slug: 'need-to-pause',
    color: '#A4C7D9',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989313/meditation-icons/user-states/Overwhelmed_need_to_pause_2ae1a99e.svg',
    timings: ['morning', 'afternoon', 'evening'],
  },
  {
    title: 'Seeking deeper spiritual experience',
    slug: 'spiritual-experience',
    color: '#A4D9D1',
    iconUrl:
      'https://res.cloudinary.com/do9izm8xv/image/upload/v1763989317/meditation-icons/user-states/Seeking_deeper_spiritual_experience_2ae1a99e.svg',
    timings: ['morning', 'evening'],
  },
  // Note: Time-based tags (Morning, Afternoon, Evening) have been removed.
  // Meditations now use the 'timings' field directly instead of tag relationships.
]

const SONG_TAGS: TagData[] = [
  {
    title: 'Nature',
    slug: 'nature',
    color: '#1E6C71', // Note: SongTags collection doesn't have a color field, kept for reference
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
    title: 'Strings',
    slug: 'strings',
    color: '#1E6C71',
    iconUrl: 'local:music-strings.svg',
  },
  {
    title: 'Vocals',
    slug: 'vocals',
    color: '#1E6C71',
    iconUrl: 'local:music-tag.svg',
  },
  {
    title: 'Morning',
    slug: 'morning',
    color: '#1E6C71',
    iconUrl: 'local:morning.svg',
  },
  {
    title: 'Afternoon',
    slug: 'afternoon',
    color: '#1E6C71',
    iconUrl: 'https://www.svgrepo.com/show/529971/sun-2.svg',
  },
  {
    title: 'Evening',
    slug: 'evening',
    color: '#1E6C71',
    iconUrl: 'local:evening.svg',
  },
]

// ============================================================================
// TAGS IMPORTER CLASS
// ============================================================================

export class TagsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Meditation & Song Tags'
  protected readonly cacheDir = CACHE_DIR

  // ============================================================================
  // STATIC FACTORY FOR MIGRATIONS
  // ============================================================================

  /**
   * Run the importer from a migration with an external Payload instance
   */
  static async runFromMigration(payload: Payload): Promise<void> {
    const importer = new TagsImporter({
      dryRun: false,
      clearCache: false,
      payload,
    })
    await importer.run()
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Preload collections for skip mode optimization.
   * This allows upsert() to skip existing documents without individual find() queries.
   */
  protected async setup(): Promise<void> {
    if (this.options.dryRun) return

    // Preload all tag collections for efficient skip/update mode
    await Promise.all([
      this.preloadCollection('user-choices', 'slug'),
      this.preloadCollection('song-tags', 'slug'),
    ])
  }

  // ============================================================================
  // MAIN IMPORT LOGIC
  // ============================================================================

  protected async import(): Promise<void> {
    await this.importUserChoices()
    await this.importSongTags()
  }

  // ============================================================================
  // MEDITATION TAGS
  // ============================================================================

  private async importUserChoices(): Promise<void> {
    const total = MEDITATION_TAGS.length

    for (let i = 0; i < total; i++) {
      const tag = MEDITATION_TAGS[i]

      try {
        // Download and process SVG
        const cacheFilename = `meditation-${tag.slug}.svg`
        const originalSvg = await this.downloadSvg(tag.iconUrl, cacheFilename)
        if (!originalSvg) {
          // Error already logged by downloadSvg - skip this tag
          continue
        }
        const processedSvg = this.convertToCurrentColor(originalSvg)
        const svgFile = this.createSvgFileObject(processedSvg, `${tag.slug}.svg`)

        // Upsert: find by slug, update if exists, create if not
        await this.upsert(
          'user-choices',
          { slug: { equals: tag.slug } },
          {
            slug: tag.slug,
            title: tag.title,
            color: tag.color,
            timings: tag.timings,
          },
          {
            locale: 'en',
            file: svgFile,
            forceFileUpload: true,
            identifier: tag.slug,
            current: i + 1,
            total,
          },
        )
      } catch (error) {
        this.addError(`Importing meditation tag "${tag.title}"`, error as Error)
      }
    }
  }

  // ============================================================================
  // SONG TAGS
  // ============================================================================

  private async importSongTags(): Promise<void> {
    const total = SONG_TAGS.length

    for (let i = 0; i < total; i++) {
      const tag = SONG_TAGS[i]

      try {
        // Download and process SVG
        const cacheFilename = `song-${tag.slug}.svg`
        const originalSvg = await this.downloadSvg(tag.iconUrl, cacheFilename)
        if (!originalSvg) {
          // Error already logged by downloadSvg - skip this tag
          continue
        }
        const processedSvg = this.convertToCurrentColor(originalSvg)
        const svgFile = this.createSvgFileObject(processedSvg, `${tag.slug}.svg`)

        // Upsert: find by slug, update if exists, create if not
        // Note: SongTags collection does not have a color field
        await this.upsert(
          'song-tags',
          { slug: { equals: tag.slug } },
          {
            slug: tag.slug,
            title: tag.title,
          },
          {
            locale: 'en',
            file: svgFile,
            forceFileUpload: true,
            identifier: tag.slug,
            current: i + 1,
            total,
          },
        )
      } catch (error) {
        this.addError(`Importing song tag "${tag.title}"`, error as Error)
      }
    }
  }

  // ============================================================================
  // SVG PROCESSING HELPERS
  // ============================================================================

  /**
   * Download SVG from URL or load from local file (local: prefix)
   */
  private async downloadSvg(url: string, cacheFilename: string): Promise<string | null> {
    try {
      // Handle local files (local:filename.svg)
      if (url.startsWith('local:')) {
        const localFilename = url.slice(6) // Remove 'local:' prefix
        const localPath = path.resolve(process.cwd(), 'seeds/tags', localFilename)

        return this.loadDataFile(localPath)
      }

      // For remote URLs: check cache, download if needed, cache result
      const cachePath = path.join(this.cacheDir, 'assets', cacheFilename)

      // Check cache first
      const cached = await readCacheText(cachePath)
      if (cached) {
        return cached
      }

      // Download from URL
      const response = await fetch(url)
      if (!response.ok) {
        this.addError(
          `SVG download from ${url}`,
          new Error(`HTTP ${response.status} ${response.statusText}`),
        )
        return null
      }

      const svgContent = await response.text()

      // Cache for local dev
      await writeCache(cachePath, svgContent)

      return svgContent
    } catch (error) {
      this.addError(`SVG download from ${url}`, error as Error)
      return null
    }
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
    // Convert SVG content to buffer
    const encoder = new TextEncoder()
    const uint8Array = encoder.encode(svgContent)
    const buffer = safeBufferFromUint8Array(uint8Array)
    return {
      data: buffer,
      mimetype: 'image/svg+xml',
      name: filename,
      size: buffer.length,
    }
  }
}
