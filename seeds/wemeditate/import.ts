#!/usr/bin/env tsx

/**
 * WeMeditate Rails Database Import Script
 *
 * Imports content from pre-extracted JSON data into Payload CMS.
 *
 * Features:
 * - Two-phase import (metadata first, content second)
 * - Idempotent: safely re-runnable (updates existing, creates new)
 * - Uses slug as natural key for pages and authors
 * - Uses videoUrl as natural key for external videos
 * - No PostgreSQL dependency - can run anywhere (migrations, CI/CD, Workers)
 *
 * DATA SOURCE:
 * - JSON file (seeds/wemeditate/data.json) - pre-extracted from legacy Rails PostgreSQL
 * - WeMeditate assets server - for downloading media files
 *
 * Usage:
 *   pnpm seed wemeditate [flags]
 *
 * Flags:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 */

import type { Payload, TypedLocale } from 'payload'

import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import {
  BaseImporter,
  BaseImportOptions,
  fetchAsset,
  MediaUploader,
  rateLimitDelay,
  readCache,
  safeBufferCopy,
  safeBufferFromUint8Array,
} from '../lib'

// ============================================================================
// WEMEDITATE DATA TYPES (matching extraction script output)
// ============================================================================

interface WeMeditateData {
  authors: Array<{
    id: number
    country_code?: string
    years_meditating?: number
    image?: string
    translations: Array<{
      locale: string
      name?: string
      title?: string
      description?: string
    }>
  }>
  artists: Array<{
    id: number
    name: string
    url?: string
    image?: string
  }>
  tracks: Array<{
    id: number
    audio?: string
    duration?: number
    title?: string
    locale?: string
    artist_ids?: number[]
    instrument_filter_ids?: number[]
  }>
  categories: Array<{
    id: number
    translations: Array<{
      locale: string
      name?: string
      slug?: string
    }>
  }>
  staticPages: Array<{
    id: number
    translations: Array<{
      locale: string
      name?: string
      slug?: string
      content?: string
      published_at?: string
      state?: string
    }>
  }>
  articles: Array<{
    id: number
    author_id?: number
    article_type?: number
    category_id?: number
    translations: Array<{
      locale: string
      name?: string
      slug?: string
      content?: string
      published_at?: string
      state?: string
    }>
  }>
  subtleSystemNodes: Array<{
    id: number
    translations: Array<{
      locale: string
      name?: string
      slug?: string
      content?: string
      published_at?: string
      state?: string
    }>
  }>
  treatments: Array<{
    id: number
    translations: Array<{
      locale: string
      name?: string
      slug?: string
      content?: string
      published_at?: string
      state?: string
    }>
  }>
  meditationTranslations: Array<{
    meditation_id: number
    name: string
  }>
  treatmentThumbnails: Array<{
    treatment_id: number
    media_file_id: number
    thumbnail_file: string
    treatment_name?: string
  }>
}
import {
  convertEditorJSToLexical,
  createUploadNode,
  type ConversionContext,
} from '../lib/lexicalConverter'
import {
  MediaDownloader,
  extractMediaUrls,
  extractAuthorImageUrl,
  getOriginalImageUrl,
} from '../lib/mediaDownloader'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DIR = path.resolve(process.cwd(), 'seeds/cache/wemeditate')
const STORAGE_BASE_URL = 'https://assets.wemeditate.com/uploads/'

/**
 * GitHub raw URL base for fetching data files when running in Cloudflare Workers
 */
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/sydevs/SahajCloud/main'

/**
 * Map legacy article types to new page tag enum values.
 * Page tags are now inline enum select values: 'wisdom' | 'lifestyle' | 'creativity' | 'event' | 'technique'
 * Only 'event' (article_type: 2) has a direct mapping.
 */
const ARTICLE_TYPE_TO_PAGE_TAG: Record<number, string | undefined> = {
  0: undefined, // 'article' - no direct mapping
  1: undefined, // 'artwork' - no direct mapping
  2: 'event', // 'event' → 'event'
  3: undefined, // 'report' - no direct mapping
}

const LOCALES = [
  'en',
  'es',
  'de',
  'it',
  'fr',
  'ru',
  'ro',
  'cs',
  'uk',
  'el',
  'hy',
  'pl',
  'pt-br',
  'fa',
  'bg',
  'tr',
] as const

// ============================================================================
// WEMEDITATE IMPORTER CLASS
// ============================================================================

export class WeMeditateImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'WeMeditate Rails Database'
  protected readonly cacheDir = CACHE_DIR

  private data!: WeMeditateData
  private mediaDownloader!: MediaDownloader
  private mediaUploader!: MediaUploader
  private defaultThumbnailId: number | string | null = null

  // Image tag names (now inline enum values, not collection IDs)
  private thumbnailTag: string = 'thumbnail'
  private placeholderTag: string = 'placeholder'

  // In-memory maps for Phase 2 content conversion (old ID → Payload ID)
  // These are populated during Phase 1 and used during Phase 2
  private idMaps = {
    authors: new Map<number, number | string>(),
    albums: new Map<number, number | string>(),
    staticPages: new Map<number, number | string>(),
    articles: new Map<number, number | string>(),
    promoPages: new Map<number, number | string>(),
    subtleSystemNodes: new Map<number, number | string>(),
    treatments: new Map<number, number | string>(),
    media: new Map<string, number | string>(),
    forms: new Map<string, number | string>(),
    lectures: new Map<string, number | string>(),
  }

  // Meditation lookup maps
  private meditationTitleMap = new Map<string, number | string>()
  private meditationRailsTitleMap = new Map<number, string>()
  private treatmentThumbnailMap = new Map<number, number | string>()

  // Pre-cached song tags (slug → id) to avoid N+1 queries
  private songTagCache = new Map<string, number>()

  // ============================================================================
  // STATIC FACTORY FOR MIGRATIONS
  // ============================================================================

  /**
   * Run the importer from a migration with an external Payload instance
   */
  static async runFromMigration(payload: Payload): Promise<void> {
    const importer = new WeMeditateImporter({
      dryRun: false,
      clearCache: false,
      payload,
    })
    await importer.run()
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  protected async setup(): Promise<void> {
    // Load data from JSON
    await this.loadData()

    // Initialize media tools (skip for dry run)
    if (!this.options.dryRun) {
      this.mediaDownloader = new MediaDownloader(this.cacheDir, this.logger)
      await this.mediaDownloader.initialize()
      this.mediaUploader = new MediaUploader(this.payload, this.logger)

      // Pre-cache to avoid N+1 queries during import
      await this.preloadSongTags()
      await this.mediaUploader.preloadExistingMedia()
      await this.setupImageTags()

      // Preload collections for efficient skip/update mode
      // This dramatically reduces D1 queries by caching existence checks
      // Note: page-tags removed - now inline enum strings on Pages collection
      await Promise.all([
        this.preloadCollection('authors', 'slug'),
        this.preloadCollection('albums', 'title'), // WeMeditate looks up albums by title
        this.preloadCollection('songs', 'title'), // WeMeditate looks up songs by title
        this.preloadCollection('pages', 'slug'),
      ])
    }
  }

  /**
   * Setup image tags for content categorization.
   * Image tags are now inline enum select values on the Images collection,
   * so we just log that they're ready (no collection setup needed).
   */
  private async setupImageTags(): Promise<void> {
    await this.logger.info('Setting up image tags...')
    // Image tags are now inline enum values: 'thumbnail', 'placeholder'
    // No collection setup needed - just use the string values directly
    await this.logger.info('✓ Image tags ready (inline enum values)')
  }

  /**
   * Pre-load all song tags into memory cache to avoid per-track queries
   */
  private async preloadSongTags(): Promise<void> {
    await this.logger.info('Pre-loading song tags...')
    const tags = await this.payload.find({
      collection: 'song-tags',
      limit: 100,
    })
    for (const tag of tags.docs) {
      if (tag.slug) {
        this.songTagCache.set(tag.slug, tag.id)
      }
    }
    await this.logger.info(`✓ Pre-loaded ${this.songTagCache.size} song tags`)
  }

  protected async cleanup(): Promise<void> {
    // Call parent cleanup (closes Payload connection)
    await super.cleanup()
  }

  /**
   * Reconstruct ID maps from database when resuming paginated import.
   * Called automatically by BaseImporter when pagination is active.
   *
   * This method rebuilds the legacy ID → Payload ID mappings needed for
   * cross-collection references (e.g., songs referencing albums).
   */
  protected async reconstructIdMaps(): Promise<void> {
    await this.logger.info('Reconstructing ID maps from database...')

    // Load source data to get artist info (needed for songs → album mapping)
    // This is required because reconstructIdMaps() is called before import()
    await this.loadData()

    // For authors and categories, we can't reconstruct the original Rails ID → Payload ID mapping
    // because we don't store the Rails IDs. However, we look up by slug during import anyway.
    const authors = await this.payload.find({ collection: 'authors', limit: 100, depth: 0 })
    await this.logger.info(`✓ Found ${authors.totalDocs} existing authors`)

    // Rebuild albums map: legacy artist ID → Payload album ID
    // Albums are named after artists (album.title = artist.name), so we can match by title
    const albums = await this.payload.find({ collection: 'albums', limit: 100, depth: 0 })
    await this.logger.info(`✓ Found ${albums.totalDocs} existing albums`)

    // Create a map of album title → Payload ID
    const albumsByTitle = new Map<string, number | string>()
    for (const album of albums.docs) {
      if (album.title) {
        albumsByTitle.set(album.title, album.id)
      }
    }

    // Map legacy artist IDs to Payload album IDs by matching artist name to album title
    // Note: artist.id in data.json is string but typed as number - convert safely
    for (const artist of this.data.artists) {
      const albumId = albumsByTitle.get(artist.name)
      if (albumId) {
        // artist.id is typed as number but is actually string in JSON - cast and convert
        const rawId = artist.id as unknown
        const numericArtistId = typeof rawId === 'string' ? parseInt(rawId, 10) : Number(rawId)
        this.idMaps.albums.set(numericArtistId, albumId)
      }
    }

    await this.logger.info(`✓ Rebuilt albums map: ${this.idMaps.albums.size} mappings`)
  }

  private async loadData(): Promise<void> {
    await this.logger.info('Loading data from JSON...')

    const localPath = path.resolve(process.cwd(), 'seeds/wemeditate/data.json')
    const workerUrl = `${GITHUB_RAW_BASE}/seeds/wemeditate/data.json`

    const jsonContent = await this.loadDataFile(localPath, workerUrl)
    this.data = JSON.parse(jsonContent) as WeMeditateData

    await this.logger.info(
      `✓ Loaded: ${this.data.authors.length} authors, ${this.data.artists.length} artists, ${this.data.tracks.length} tracks`,
    )
    await this.logger.info(
      `  ${this.data.staticPages.length} static pages, ${this.data.articles.length} articles, ${this.data.treatments.length} treatments`,
    )
  }

  // ============================================================================
  // MAIN IMPORT LOGIC
  // ============================================================================

  protected async import(): Promise<void> {
    if (this.options.dryRun) {
      await this.logger.info('Dry run: database connection validated')
      return
    }

    // Check if we're targeting a specific collection (paginated mode)
    const isPaginated = this.isPaginated()

    // Phase 1: Import metadata without content
    // Skip if paginating pages collection (metadata already imported)
    if (!isPaginated || !this.isCollectionTargeted('pages')) {
      await this.logger.info('\n=== PHASE 1: Metadata Import ===')

      if (!isPaginated || this.isCollectionTargeted('authors')) {
        await this.importAuthors()
      }
      if (!isPaginated || this.isCollectionTargeted('albums')) {
        await this.importAlbums()
      }
      if (!isPaginated || this.isCollectionTargeted('songs')) {
        await this.importSongs()
      }

      // Import pages (page tags are now inline enum strings, no collection needed)
      if (!isPaginated) {
        await this.importPages('static_pages', 'static_page_translations')
        await this.importPages('articles', 'article_translations')
        await this.importPages('subtle_system_nodes', 'subtle_system_node_translations')
      }
    }

    // Phase 2: Import content with full conversion
    // For paginated mode on 'pages', we handle this specially
    if (!isPaginated) {
      await this.logger.info('\n=== PHASE 2: Content Import ===')
      await this.buildMeditationTitleMap()
      await this.importForms()
      await this.importMedia()
      await this.importLectures()
      await this.buildTreatmentThumbnailMap()
      await this.importPages('treatments', 'treatment_translations')

      // Update pages with converted Lexical content
      await this.importPagesWithContent('static_pages', 'static_page_translations')
      await this.importPagesWithContent('articles', 'article_translations')
      await this.importPagesWithContent('subtle_system_nodes', 'subtle_system_node_translations')
      await this.importPagesWithContent('treatments', 'treatment_translations')

      // Update global settings
      await this.updateWeMeditateWebSettings()
    } else if (this.isCollectionTargeted('pages')) {
      // Paginated pages import: combine all page types and paginate
      await this.logger.info('\n=== PAGINATED PAGES IMPORT ===')
      await this.importPaginatedPages()
    }
  }

  /**
   * Import pages with pagination support.
   * Combines all page types (static_pages, articles, subtle_system_nodes, treatments)
   * and applies pagination to the combined list.
   */
  private async importPaginatedPages(): Promise<void> {
    // Check if this is the first batch (offset=0) to avoid re-running pre-work on subsequent batches
    const isFirstBatch = !this.options.pagination?.offset || this.options.pagination.offset === 0

    if (isFirstBatch) {
      // PRE-WORK: Only run once on first batch
      // Categories, content type tags, forms, global media, and lectures are imported once
      // Subsequent batches skip these since they're already complete

      // Import forms (only once)
      // Note: page-tags removed - now inline enum strings on Pages collection
      await this.importForms()

      // Import global media (authors, thumbnails) ONCE
      // Then process page-specific media inline with each page to reduce HTTP requests per invocation
      await this.importGlobalMedia()
      await this.importLectures()
    }

    // ALWAYS rebuild maps (read-only queries needed for content conversion in every batch)
    await this.buildMeditationTitleMap()
    await this.buildTreatmentThumbnailMap()

    // Combine all page types into a single array
    // All page types share the same structure (id, translations)
    const allPages: Array<{ page: WeMeditateData['staticPages'][number]; tableName: string }> = [
      ...this.data.staticPages.map((p) => ({ page: p, tableName: 'static_pages' as const })),
      ...this.data.articles.map((p) => ({ page: p, tableName: 'articles' as const })),
      ...this.data.subtleSystemNodes.map((p) => ({
        page: p,
        tableName: 'subtle_system_nodes' as const,
      })),
      ...this.data.treatments.map((p) => ({ page: p, tableName: 'treatments' as const })),
    ]

    // Apply pagination
    const paginatedPages = this.paginateItems(allPages)
    const total = allPages.length

    await this.logger.info(
      `Processing ${paginatedPages.length} pages (offset: ${this.options.pagination?.offset || 0})`,
    )

    for (let i = 0; i < paginatedPages.length; i++) {
      const { page, tableName } = paginatedPages[i]
      const globalIndex = (this.options.pagination?.offset || 0) + i

      // Get page name for logging
      const pageAny = page as any
      const enTranslation = pageAny.translations?.find((t: any) => t.locale === 'en' && t.name)
      const pageName = enTranslation?.name || `${tableName}-${page.id}`

      try {
        // PAGINATED MODE: Import media for THIS page only before processing
        // This ensures we only download media needed for the current batch
        await this.importMediaForPage(page, globalIndex + 1, total, pageName)
        await this.importSinglePage(page, tableName, globalIndex + 1, total)
      } catch (error) {
        this.addError(`Importing ${tableName} ${page.id}`, error as Error)
      }
    }

    // Update global settings only on the last batch
    if (!this.hasMoreItems()) {
      await this.updateWeMeditateWebSettings()
    }
  }

  /**
   * Import a single page (used by both regular and paginated imports)
   */
  private async importSinglePage(
    page: WeMeditateData['staticPages'][number],
    tableName: string,
    current: number,
    total: number,
  ): Promise<void> {
    const pageAny = page as any

    // Find English translation
    const enTranslation = pageAny.translations.find((t: any) => t.locale === 'en' && t.name)
    if (!enTranslation) {
      await this.skip(`${tableName} ${page.id}: no English translation`, {
        collection: 'pages',
        identifier: `${tableName}-${page.id}`,
        current,
        total,
      })
      return
    }

    // For treatments: check if thumbnail exists
    if (tableName === 'treatments') {
      const treatmentId = typeof page.id === 'string' ? parseInt(page.id as string) : page.id
      if (!this.treatmentThumbnailMap.has(treatmentId)) {
        await this.skip(`Treatment ${page.id} "${enTranslation.name!}" has no thumbnail`, {
          collection: 'pages',
          identifier: `treatment-${page.id}`,
          current,
          total,
        })
        return
      }
    }

    // Generate slug (normalized for consistent matching)
    const slug = (enTranslation.slug || enTranslation.name!)
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    // Get author and tags
    let authorId: number | string | undefined
    if (pageAny.author_id && this.idMaps.authors.has(pageAny.author_id)) {
      authorId = this.idMaps.authors.get(pageAny.author_id)
    }

    // Page tags are now inline enum strings: 'wisdom' | 'lifestyle' | 'creativity' | 'event' | 'technique'
    // Only article_type 'event' has a direct mapping
    const tags: string[] = []
    if (pageAny.article_type !== undefined) {
      const pageTag = ARTICLE_TYPE_TO_PAGE_TAG[pageAny.article_type]
      if (pageTag) tags.push(pageTag)
    }

    // Calculate published state
    type Translation = { locale: string; published_at?: string }
    const isPublished = pageAny.translations.some(
      (t: Translation) => t.published_at && LOCALES.includes(t.locale as (typeof LOCALES)[number]),
    )

    // Upsert page by slug
    const pageResult = await this.upsert<{ id: number }>(
      'pages',
      { slug: { equals: slug } },
      {
        title: enTranslation.name!,
        slug,
        _status: isPublished ? 'published' : 'draft',
        author: authorId,
        tags: tags.length > 0 ? tags : undefined,
      },
      {
        locale: 'en',
        identifier: slug,
        current,
        total,
        publishSpecificLocale: enTranslation.published_at ? 'en' : undefined,
      },
    )

    // Store in appropriate ID map (always needed for relationships)
    const mapKeyMap: Record<string, keyof typeof this.idMaps> = {
      static_pages: 'staticPages',
      articles: 'articles',
      subtle_system_nodes: 'subtleSystemNodes',
      treatments: 'treatments',
    }
    const mapKey = mapKeyMap[tableName]
    if (mapKey) {
      const numericId = typeof page.id === 'string' ? parseInt(page.id as string) : page.id
      const idMap = this.idMaps[mapKey] as Map<number, number>
      idMap.set(numericId, pageResult.doc.id)
    }

    // OPTIMIZATION: Skip locale updates and content import if record was skipped (no DB work needed)
    if (pageResult.action === 'skipped') {
      return
    }

    // Update other locales
    type PageTranslation = (typeof pageAny.translations)[number]
    await this.updateLocales<PageTranslation>(
      'pages',
      pageResult.doc.id,
      pageAny.translations,
      (t) => ({ title: t.name }),
      {
        excludeLocale: 'en',
        requiredFields: ['name'],
        validLocales: [...LOCALES],
        shouldPublish: (t) => !!t.published_at,
      },
    )

    // Import content for this page
    await this.importSinglePageContent(page, pageResult.doc.id, tableName)
  }

  /**
   * Import content for a single page (Phase 2 for paginated mode)
   */
  private async importSinglePageContent(
    page: WeMeditateData['staticPages'][number],
    pageId: number,
    tableName: string,
  ): Promise<void> {
    const pageAny = page as any
    const enTranslation = pageAny.translations.find((t: any) => t.locale === 'en')
    const pageTitle = enTranslation?.name || 'Unknown'

    for (const translation of pageAny.translations) {
      if (!translation.locale || !translation.content) continue
      if (!LOCALES.includes(translation.locale as (typeof LOCALES)[number])) continue

      let content
      try {
        if (typeof translation.content === 'string') {
          const contentStr = translation.content.replace(/=>/g, ':')
          content = JSON.parse(contentStr)
        } else {
          content = translation.content
        }
      } catch {
        continue
      }

      const context: ConversionContext = {
        payload: this.payload,
        logger: this.logger,
        pageId: page.id,
        pageTitle,
        locale: translation.locale,
        mediaMap: this.idMaps.media,
        formMap: this.idMaps.forms,
        lectureMap: this.idMaps.lectures,
        treatmentMap: this.idMaps.treatments,
        treatmentThumbnailMap: this.treatmentThumbnailMap,
        meditationTitleMap: this.meditationTitleMap,
        meditationRailsTitleMap: this.meditationRailsTitleMap,
      }

      const lexicalContent = await convertEditorJSToLexical(content, context)

      // For treatments: prepend thumbnail
      if (tableName === 'treatments') {
        const numericId = typeof page.id === 'string' ? parseInt(page.id as string) : page.id
        const thumbnailMediaId = this.treatmentThumbnailMap.get(numericId)
        if (thumbnailMediaId) {
          const thumbnailNode = createUploadNode(thumbnailMediaId, 'right')
          lexicalContent.root.children.unshift(thumbnailNode)
        }
      }

      await this.payload.update({
        collection: 'pages',
        id: pageId,
        data: {
          title: translation.name || 'Untitled',
          content: lexicalContent as any,
        },
        locale: translation.locale as TypedLocale,
      })
    }
  }

  // ============================================================================
  // AUTHORS IMPORT
  // ============================================================================

  private async importAuthors(): Promise<void> {
    const authors = this.data.authors
    const total = authors.length

    for (let i = 0; i < total; i++) {
      const author = authors[i]

      // Skip if author was already imported (reduces log noise on re-runs)
      if (this.idMaps.authors.has(author.id)) {
        await this.skip(`Author ${author.id} already imported`, {
          collection: 'authors',
          identifier: `author-${author.id}`,
          current: i + 1,
          total,
        })
        continue
      }

      try {
        // Find English translation
        const enTranslation = author.translations.find((t: any) => t.locale === 'en' && t.name)
        if (!enTranslation) {
          await this.skip(`Author ${author.id}: no English translation`, {
            collection: 'authors',
            identifier: `author-${author.id}`,
            current: i + 1,
            total,
          })
          continue
        }

        // Generate name (trimmed) and slug (normalized for consistent matching)
        const name = enTranslation.name!.trim()
        const slug = name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')

        // Upsert author by slug
        const authorResult = await this.upsert<{ id: number }>(
          'authors',
          { slug: { equals: slug } },
          {
            name,
            title: enTranslation.title || '',
            description: enTranslation.description || '',
            countryCode: author.country_code || undefined,
            yearsMeditating: author.years_meditating || undefined,
          },
          {
            locale: 'en',
            identifier: slug,
            current: i + 1,
            total,
          },
        )

        this.idMaps.authors.set(author.id, authorResult.doc.id)

        // Link author image if available
        if (author.image) {
          // Construct image URL similar to album art pattern
          // Author images are stored as plain filenames (e.g., "eddc874d5f.jpg")
          const imageFilename =
            typeof author.image === 'string' ? author.image : String(author.image)
          const imageUrl = imageFilename.startsWith('http')
            ? imageFilename
            : `${STORAGE_BASE_URL}author/image/${author.id}/${imageFilename}`

          if (imageUrl) {
            // Try to get from cache first
            let imageId = this.idMaps.media.get(imageUrl)

            // If not in cache, try to upload now
            if (!imageId) {
              try {
                const downloadResult = await this.mediaDownloader.downloadAndConvertImage(imageUrl)
                const result = await this.mediaUploader.uploadWithDeduplication(
                  downloadResult.localPath,
                  {
                    alt: 'Author profile photo',
                    buffer: downloadResult.buffer,
                    sourceUrl: imageUrl,
                    originalFilename: downloadResult.originalFilename,
                  },
                )
                imageId = result.id
                this.idMaps.media.set(imageUrl, imageId)
                await this.logger.log(
                  `    ✓ Uploaded author image: ${downloadResult.originalFilename}`,
                )
              } catch (error) {
                this.addWarning(
                  `Failed to upload image for author ${author.id}: ${(error as Error).message}`,
                )
              }
            }

            // Update author with image (if we have an image ID)
            if (imageId) {
              // Check if author already has this image to avoid unnecessary updates
              const existing = await this.payload.findByID({
                collection: 'authors',
                id: authorResult.doc.id,
                depth: 0,
              })
              const existingImageId =
                typeof existing.photo === 'number' ? existing.photo : existing.photo?.id

              if (existingImageId !== imageId) {
                await this.payload.update({
                  collection: 'authors',
                  id: authorResult.doc.id,
                  data: { photo: imageId as number },
                  locale: 'en',
                  overrideAccess: true,
                })
                await this.logger.log(`    ✓ Linked author image`)
              }
            }
          }
        }

        // OPTIMIZATION: Skip locale updates if record was skipped (no DB work needed)
        if (authorResult.action === 'skipped') {
          continue
        }

        // Update other locales using helper
        await this.updateLocales(
          'authors',
          authorResult.doc.id,
          author.translations,
          (t) => ({
            name: t.name,
            title: t.title || '',
            description: t.description || '',
          }),
          { excludeLocale: 'en', requiredFields: ['name'], validLocales: [...LOCALES] },
        )
      } catch (error) {
        this.addError(`Importing author ${author.id}`, error as Error)
      }
    }
  }

  // ============================================================================
  // ID CONVERSION HELPER
  // ============================================================================

  /**
   * Convert ID to numeric type for consistent Map key handling.
   * JSON data has string IDs ("8") but Map lookups use numbers (8).
   * JavaScript Maps treat string "8" and number 8 as different keys.
   */
  private toNumericId(id: unknown): number {
    return typeof id === 'string' ? parseInt(id, 10) : Number(id)
  }

  // ============================================================================
  // ALBUMS IMPORT (from artists table)
  // ============================================================================

  private async importAlbums(): Promise<void> {
    // Artists in WeMeditate represent music albums
    const artists = this.data.artists
    const total = artists.length

    for (let i = 0; i < total; i++) {
      const artist = artists[i]

      try {
        if (!artist.name) {
          await this.skip(`Artist ${artist.id}: no name`, {
            collection: 'albums',
            identifier: `artist-${artist.id}`,
            current: i + 1,
            total,
          })
          continue
        }

        // Check preload cache first (fast, in-memory) - albums are preloaded by title in setup()
        const existingFromCache = this.getPreloaded('albums', artist.name)
        if (existingFromCache) {
          // Always record the ID mapping (needed for music import)
          this.idMaps.albums.set(this.toNumericId(artist.id), existingFromCache.id)

          if (!this.options.updateMode) {
            // SKIP MODE: Don't update, just record the mapping
            this.report.incrementSkipped()
            await this.reportDocument('albums', artist.name, 'skipped', {
              current: i + 1,
              total,
            })
            continue
          }

          // UPDATE MODE: Update metadata only (can't update file on upload collections)
          await this.payload.update({
            collection: 'albums',
            id: existingFromCache.id,
            data: {
              artist: artist.name,
              artistUrl: artist.url || undefined,
            },
            locale: 'en',
            overrideAccess: true,
          })
          this.report.incrementUpdated()
          await this.reportDocument('albums', artist.name, 'updated', {
            current: i + 1,
            total,
          })
          continue
        }

        // Download album art if available (Albums is an upload collection - file required)
        // The image field is JSONB stored as a quoted string like: "4d892b21f6.jpg"
        let downloadResult: { localPath: string; buffer?: Buffer } | null = null
        if (artist.image) {
          try {
            // Parse JSONB string - it's stored as "filename.jpg" (quoted string in JSON)
            let imageFilename: string | null = null
            if (typeof artist.image === 'string') {
              // If it's a string, it might be JSON-encoded or just the filename
              try {
                imageFilename = JSON.parse(artist.image) as string
              } catch {
                // If JSON.parse fails, use it directly (might be unquoted)
                imageFilename = artist.image
              }
            }

            if (imageFilename) {
              const albumArtUrl = imageFilename.startsWith('http')
                ? imageFilename
                : `${STORAGE_BASE_URL}artist/image/${artist.id}/${imageFilename}`
              downloadResult = await this.mediaDownloader.downloadAndConvertImage(albumArtUrl)
            }
          } catch (error) {
            this.addWarning(
              `Failed to download album art for artist ${artist.id}: ${(error as Error).message}`,
            )
          }
        }

        // If no album art available, use a placeholder
        if (!downloadResult) {
          downloadResult = await this.getOrCreatePlaceholderImage()
        }

        // Create album with file (Albums is an upload collection)
        // Use buffer directly in Workers mode, otherwise read from cache
        let fileBuffer: Buffer
        if (downloadResult.buffer) {
          fileBuffer = downloadResult.buffer
        } else {
          const cached = await readCache(downloadResult.localPath)
          if (!cached) {
            throw new Error(`Failed to read cached file: ${downloadResult.localPath}`)
          }
          fileBuffer = cached
        }
        const filename = path.basename(downloadResult.localPath)
        const mimeType = this.fileUtils.getMimeType(filename)

        // In Workers, ensure we pass a clean Buffer without ArrayBuffer offset issues
        // Uses safeBufferCopy() which does a manual indexed copy - the only reliable method.
        const cleanBuffer = safeBufferCopy(fileBuffer)

        // Try to create album, with fallback to placeholder if Buffer polyfill fails
        let albumDoc: Awaited<ReturnType<typeof this.payload.create>>
        try {
          albumDoc = await this.payload.create({
            collection: 'albums',
            data: {
              title: artist.name,
              artist: artist.name,
              artistUrl: artist.url || undefined,
            },
            file: {
              data: cleanBuffer,
              mimetype: mimeType,
              name: filename,
              size: cleanBuffer.length,
            },
            locale: 'en',
            overrideAccess: true,
          })
        } catch (uploadError) {
          // Buffer polyfill error in Workers - fallback to placeholder
          const errorMsg = uploadError instanceof Error ? uploadError.message : String(uploadError)
          if (errorMsg.includes('offset') || errorMsg.includes('Buffer')) {
            this.addWarning(
              `Album art upload failed for ${artist.name} (Buffer issue), trying placeholder: ${errorMsg}`,
            )
            // Try with GitHub-hosted preview.png placeholder (no filesystem in Workers)
            try {
              const githubPlaceholderUrl = `${GITHUB_RAW_BASE}/seeds/wemeditate/preview.png`
              const placeholderBuffer = await fetchAsset(githubPlaceholderUrl)
              albumDoc = await this.payload.create({
                collection: 'albums',
                data: {
                  title: artist.name,
                  artist: artist.name,
                  artistUrl: artist.url || undefined,
                },
                file: {
                  data: placeholderBuffer,
                  mimetype: 'image/png',
                  name: 'preview.png',
                  size: placeholderBuffer.length,
                },
                locale: 'en',
                overrideAccess: true,
              })
            } catch (placeholderError) {
              // Both attempts failed - skip this album but continue with others
              const placeholderMsg =
                placeholderError instanceof Error
                  ? placeholderError.message
                  : String(placeholderError)
              this.addError(
                `Skipping album for ${artist.name} - both original and placeholder uploads failed`,
                new Error(placeholderMsg),
              )
              continue
            }
          } else {
            throw uploadError
          }
        }

        this.idMaps.albums.set(this.toNumericId(artist.id), albumDoc.id)
        this.report.incrementCreated()
        await this.reportDocument('albums', artist.name, 'created', {
          current: i + 1,
          total,
        })

        // Add delay between albums to avoid rate limiting in Workers environment
        // Reduced from 300ms since bulk preloading reduces DB queries
        if (i < total - 1) {
          await rateLimitDelay(100)
        }
      } catch (error) {
        this.addError(`Importing album (artist) ${artist.id}`, error as Error)
      }
    }
  }

  /**
   * Get placeholder image for albums without artwork.
   * Uses mediaDownloader for consistent handling across local/Workers modes.
   */
  private async getOrCreatePlaceholderImage(): Promise<{ localPath: string; buffer?: Buffer }> {
    const githubUrl = `${GITHUB_RAW_BASE}/seeds/wemeditate/preview.png`

    try {
      // Use mediaDownloader for consistent handling (it works for other albums)
      await this.logger.log(`  Fetching album placeholder from GitHub...`)
      const result = await this.mediaDownloader.downloadAndConvertImage(githubUrl)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.addWarning(`Error fetching album placeholder: ${message}`)
      // Return empty result - will fail later but with better error
      return { localPath: 'placeholder-album.png' }
    }
  }

  // ============================================================================
  // SONGS IMPORT (from tracks table)
  // ============================================================================

  /**
   * Instrument filter to song tag slug mapping
   * Legacy: sitar.svg -> Strings, vocal.svg -> Vocal, flute.svg -> Wind
   * Maps to: strings, vocals, flute
   */
  private readonly INSTRUMENT_TAG_MAP: Record<number, string> = {
    1: 'strings', // sitar.svg -> Strings
    2: 'vocals', // vocal.svg -> Vocal (need to ensure this tag exists)
    3: 'flute', // flute.svg -> Wind
  }

  private async importSongs(): Promise<void> {
    // Ensure vocals tag exists (it might not be in the tags import)
    await this.ensureVocalsTagExists()

    // Use pre-extracted tracks data
    const tracks = this.data.tracks
    const total = tracks.length

    for (let i = 0; i < total; i++) {
      const track = tracks[i]

      try {
        if (!track.title) {
          await this.skip(`Track ${track.id}: no English title`, {
            collection: 'songs',
            identifier: `track-${track.id}`,
            current: i + 1,
            total,
          })
          continue
        }

        if (!track.audio) {
          await this.skip(`Track ${track.id} "${track.title}": no audio file`, {
            collection: 'songs',
            identifier: `track-${track.id}`,
            current: i + 1,
            total,
          })
          continue
        }

        // Get album ID from first artist (tracks can have multiple artists)
        // Note: artist_ids from data.json are strings but typed as number[] - convert to number for Map lookup
        let albumId: number | string | undefined
        if (track.artist_ids && track.artist_ids.length > 0) {
          const firstArtistId =
            typeof track.artist_ids[0] === 'string'
              ? parseInt(track.artist_ids[0] as unknown as string, 10)
              : track.artist_ids[0]
          albumId = this.idMaps.albums.get(firstArtistId)
          if (!albumId) {
            // Log which artist name we're looking for to help debug missing albums
            const artistData = this.data.artists.find(
              (a) => this.toNumericId(a.id) === firstArtistId,
            )
            this.addWarning(
              `Track ${track.id} "${track.title}": artist ${firstArtistId} (${artistData?.name || 'unknown'}) not found in albums map. ` +
                `Albums map has ${this.idMaps.albums.size} entries. Check if album was created successfully.`,
            )
          }
        }

        if (!albumId) {
          await this.skip(`Track ${track.id} "${track.title}": no album association`, {
            collection: 'songs',
            identifier: `track-${track.id}`,
            current: i + 1,
            total,
          })
          continue
        }

        // Map instrument filters to song tags
        const tagIds: number[] = []
        if (track.instrument_filter_ids && track.instrument_filter_ids.length > 0) {
          for (const filterId of track.instrument_filter_ids) {
            const tagSlug = this.INSTRUMENT_TAG_MAP[filterId]
            if (tagSlug) {
              const songTagIds = this.findSongTagsBySlug([tagSlug])
              tagIds.push(...songTagIds)
            }
          }
        }

        // Convert album ID to number for Payload type compatibility
        const numericAlbumId = typeof albumId === 'string' ? parseInt(albumId, 10) : albumId

        // Check preload cache first (fast, in-memory) - songs is preloaded by title in setup()
        const existingFromCache = this.getPreloaded('songs', track.title)
        if (existingFromCache) {
          if (!this.options.updateMode) {
            // SKIP MODE: Don't update existing songs
            this.report.incrementSkipped()
            await this.reportDocument('songs', track.title, 'skipped', {
              current: i + 1,
              total,
            })
            continue
          }

          // UPDATE MODE: Update existing song with album and tags
          await this.payload.update({
            collection: 'songs',
            id: existingFromCache.id,
            data: {
              album: numericAlbumId,
              tags: tagIds.length > 0 ? tagIds : undefined,
            },
            locale: 'en',
          })
          this.report.incrementUpdated()
          await this.reportDocument('songs', track.title, 'updated', {
            current: i + 1,
            total,
          })
          continue
        }

        // Download audio file using unified fetchAsset (handles caching in local mode)
        const audioUrl = `${STORAGE_BASE_URL}track/${track.id}/${track.audio}?version=`
        const filename = track.audio
        const mimeType = this.fileUtils.getMimeType(filename)
        const cacheFilename = `track-${track.id}-${track.audio}`
        const cachePath = path.join(this.cacheDir, 'audio', cacheFilename)

        let fileBuffer: Buffer
        try {
          fileBuffer = await fetchAsset(audioUrl, { cachePath })
        } catch (error) {
          this.addError(`Downloading audio for track ${track.id}: ${audioUrl}`, error as Error)
          await this.reportDocument('songs', track.title, 'error', {
            error: (error as Error).message,
            current: i + 1,
            total,
          })
          continue
        }

        await this.payload.create({
          collection: 'songs',
          data: {
            title: track.title,
            album: numericAlbumId,
            tags: tagIds.length > 0 ? tagIds : undefined,
          },
          file: {
            data: fileBuffer,
            mimetype: mimeType,
            name: filename,
            size: fileBuffer.length,
          },
          locale: 'en',
        })

        this.report.incrementCreated()
        await this.reportDocument('songs', track.title, 'created', {
          current: i + 1,
          total,
        })
      } catch (error) {
        this.addError(`Importing track ${track.id}`, error as Error)
        await this.reportDocument('songs', track.title || `track-${track.id}`, 'error', {
          error: (error as Error).message,
          current: i + 1,
          total,
        })
      }
    }
  }

  /**
   * Ensure the vocals tag exists in the song-tags collection
   * This tag may not be present in the standard tags import
   */
  private async ensureVocalsTagExists(): Promise<void> {
    try {
      const existing = await this.payload.find({
        collection: 'song-tags',
        where: { slug: { equals: 'vocals' } },
        limit: 1,
      })

      if (existing.docs.length > 0) {
        await this.logger.info('✓ Vocals tag already exists')
        return
      }

      // Try to read SVG from filesystem (returns null in Workers mode)
      const svgPath = path.resolve(process.cwd(), 'seeds/tags/music-tag.svg')
      let svgBuffer = await readCache(svgPath)

      if (!svgBuffer) {
        // Workers mode (or file missing): use minimal music note SVG
        // Use TextEncoder + safeBufferFromUint8Array for Workers compatibility
        const svgContent =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>'
        const encoder = new TextEncoder()
        const uint8Array = encoder.encode(svgContent)
        svgBuffer = safeBufferFromUint8Array(uint8Array)
      }

      await this.payload.create({
        collection: 'song-tags',
        data: {
          title: 'Vocals',
          slug: 'vocals',
        },
        file: {
          data: svgBuffer,
          mimetype: 'image/svg+xml',
          name: 'vocals.svg',
          size: svgBuffer.length,
        },
        locale: 'en',
      })

      await this.logger.info('✓ Created vocals tag with song icon')
    } catch (error) {
      this.addError('Creating vocals tag', error as Error)
    }
  }

  // ============================================================================
  // PAGES IMPORT
  // ============================================================================

  private async importPages(tableName: string, _translationsTable: string): Promise<void> {
    const DEBUG = process.env.DEBUG_IMPORT === 'true'
    if (DEBUG) console.log(`[IMPORT_PAGES] Starting ${tableName}`)

    // Map table names to pre-extracted data arrays
    const dataMap: Record<string, typeof this.data.staticPages | typeof this.data.articles> = {
      static_pages: this.data.staticPages,
      articles: this.data.articles,
      subtle_system_nodes: this.data.subtleSystemNodes,
      treatments: this.data.treatments,
    }

    const pages = dataMap[tableName] || []
    const total = pages.length
    if (DEBUG) console.log(`[IMPORT_PAGES] Found ${total} pages in ${tableName}`)

    for (let i = 0; i < total; i++) {
      const page = pages[i] as any // Use any for dynamic table access
      if (DEBUG) console.log(`[IMPORT_PAGES] Processing page ${i + 1}/${total}: ${page.id}`)

      try {
        // Find English translation
        const enTranslation = page.translations.find((t: any) => t.locale === 'en' && t.name)
        if (!enTranslation) {
          await this.skip(`${tableName} ${page.id}: no English translation`, {
            collection: 'pages',
            identifier: `${tableName}-${page.id}`,
            current: i + 1,
            total,
          })
          continue
        }

        // For treatments: check if thumbnail exists
        if (tableName === 'treatments') {
          const treatmentId = typeof page.id === 'string' ? parseInt(page.id) : page.id
          if (!this.treatmentThumbnailMap.has(treatmentId)) {
            await this.skip(`Treatment ${page.id} "${enTranslation.name!}" has no thumbnail`, {
              collection: 'pages',
              identifier: `treatment-${page.id}`,
              current: i + 1,
              total,
            })
            continue
          }
        }

        // Generate slug (normalized for consistent matching)
        const slug = (enTranslation.slug || enTranslation.name!)
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')

        // Get author and tags
        let authorId: number | string | undefined
        if (page.author_id && this.idMaps.authors.has(page.author_id)) {
          authorId = this.idMaps.authors.get(page.author_id)
        }

        // Page tags are now inline enum strings: 'wisdom' | 'lifestyle' | 'creativity' | 'event' | 'technique'
        // Only article_type 'event' has a direct mapping
        const tags: string[] = []
        if (page.article_type !== undefined) {
          const pageTag = ARTICLE_TYPE_TO_PAGE_TAG[page.article_type]
          if (pageTag) tags.push(pageTag)
        }

        // Calculate published state - _status: 'published' if ANY locale has published_at
        type Translation = { locale: string; published_at?: string }
        const isPublished = page.translations.some(
          (t: Translation) =>
            t.published_at && LOCALES.includes(t.locale as (typeof LOCALES)[number]),
        )

        // Upsert page by slug (upsert auto-reports progress)
        // Use publishSpecificLocale for native per-locale publishing in PayloadCMS
        const pageResult = await this.upsert<{ id: number }>(
          'pages',
          { slug: { equals: slug } },
          {
            title: enTranslation.name!,
            slug,
            _status: isPublished ? 'published' : 'draft',
            author: authorId,
            tags: tags.length > 0 ? tags : undefined,
          },
          {
            locale: 'en',
            identifier: slug,
            current: i + 1,
            total,
            publishSpecificLocale: enTranslation.published_at ? 'en' : undefined,
          },
        )

        // Store in appropriate ID map (always needed for relationships)
        const mapKeyMap: Record<string, keyof typeof this.idMaps> = {
          static_pages: 'staticPages',
          articles: 'articles',
          subtle_system_nodes: 'subtleSystemNodes',
          treatments: 'treatments',
        }
        const mapKey = mapKeyMap[tableName]
        if (mapKey) {
          const numericId = typeof page.id === 'string' ? parseInt(page.id) : page.id
          const idMap = this.idMaps[mapKey] as Map<number, number>
          idMap.set(numericId, pageResult.doc.id)
        }

        // OPTIMIZATION: Skip locale updates if record was skipped (no DB work needed)
        if (pageResult.action === 'skipped') {
          continue
        }

        // Update other locales using helper
        // Note: _status is not localized, already set above
        // Use shouldPublish callback for native per-locale publishing
        type PageTranslation = (typeof page.translations)[number]
        await this.updateLocales<PageTranslation>(
          'pages',
          pageResult.doc.id,
          page.translations,
          (t) => ({
            title: t.name,
          }),
          {
            excludeLocale: 'en',
            requiredFields: ['name'],
            validLocales: [...LOCALES],
            shouldPublish: (t) => !!t.published_at,
          },
        )
      } catch (error) {
        this.addError(`Importing ${tableName} ${page.id}`, error as Error)
      }
    }
  }

  // ============================================================================
  // FORMS IMPORT
  // ============================================================================

  private async importForms(): Promise<void> {
    await this.logger.info('\n=== Creating Shared Forms ===')

    const formConfigs = {
      contact: {
        title: 'Contact Form',
        fields: [
          { name: 'name', label: 'Name', blockType: 'text' as const, required: true },
          { name: 'email', label: 'Email', blockType: 'email' as const, required: true },
          { name: 'message', label: 'Message', blockType: 'textarea' as const, required: true },
        ],
      },
      signup: {
        title: 'Signup Form',
        fields: [{ name: 'email', label: 'Email', blockType: 'email' as const, required: true }],
      },
    }

    for (const [formType, config] of Object.entries(formConfigs)) {
      try {
        const result = await this.upsert<{ id: number }>(
          'forms',
          { title: { equals: config.title } },
          {
            title: config.title,
            fields: config.fields,
            submitButtonLabel: 'Submit',
            confirmationType: 'message' as const,
            confirmationMessage: {
              root: {
                type: 'root',
                version: 1,
                children: [
                  {
                    type: 'paragraph',
                    version: 1,
                    children: [
                      {
                        type: 'text',
                        version: 1,
                        text: 'Thank you for your submission!',
                        format: 0,
                        style: '',
                        mode: 'normal',
                        detail: 0,
                      },
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    textFormat: 0,
                  },
                ],
                direction: null,
                format: '',
                indent: 0,
              },
            },
          },
        )

        this.idMaps.forms.set(formType, result.doc.id)
      } catch (error) {
        this.addError(`Creating form ${formType}`, error as Error)
      }
    }
  }

  // ============================================================================
  // MEDIA IMPORT
  // ============================================================================

  private async importMedia(): Promise<void> {
    await this.logger.info('\n=== Importing Media Files ===')

    const mediaUrls = new Set<string>()
    const mediaMetadata = new Map<string, { alt: string; credit: string }>()

    // Scan all page content for media URLs from pre-extracted data
    const allPageTypes = [
      this.data.staticPages,
      this.data.articles,
      this.data.subtleSystemNodes,
      this.data.treatments,
    ]

    for (const pages of allPageTypes) {
      for (const page of pages) {
        for (const translation of page.translations) {
          if (!translation.content) continue
          let content
          try {
            content =
              typeof translation.content === 'string'
                ? JSON.parse(translation.content)
                : translation.content
          } catch {
            continue
          }

          const urls = extractMediaUrls(content, STORAGE_BASE_URL)
          urls.forEach((url) => mediaUrls.add(url))

          if (content.blocks) {
            for (const block of content.blocks) {
              if (block.type === 'media' && block.data.items) {
                for (const item of block.data.items) {
                  if (item.image?.preview) {
                    mediaMetadata.set(item.image.preview, {
                      alt: item.alt || '',
                      credit: item.credit || '',
                    })
                  }
                }
              }
            }
          }
        }
      }
    }

    // Also scan author images from pre-extracted data
    for (const author of this.data.authors) {
      if (!author.image) continue
      const imageUrl = extractAuthorImageUrl(author.image, STORAGE_BASE_URL)
      if (imageUrl) {
        mediaUrls.add(imageUrl)
        mediaMetadata.set(imageUrl, { alt: 'Author profile image', credit: '' })
      }
    }

    // Scan treatment thumbnails from pre-extracted data
    // Apply getOriginalImageUrl to strip CarrierWave prefixes (e.g., small_)
    for (const treatment of this.data.treatmentThumbnails) {
      const thumbnailUrl = getOriginalImageUrl(
        `${STORAGE_BASE_URL}media_file/file/${treatment.media_file_id}/${treatment.thumbnail_file}`,
      )
      mediaUrls.add(thumbnailUrl)
      mediaMetadata.set(thumbnailUrl, {
        alt: `Thumbnail for ${treatment.treatment_name || 'treatment'}`,
        credit: '',
      })
    }

    const mediaUrlArray = Array.from(mediaUrls)
    const total = mediaUrlArray.length

    // Batch pause configuration to avoid Cloudflare Images rate limiting
    // Cloudflare Images has rate limits of ~100 requests per 5-minute window
    // Using small batches (25) with 25s pause = ~300 requests/5min (under limit with margin)
    // CRITICAL: Pause must be <30s to avoid Cloudflare Workers I/O inactivity timeout
    // The Workers runtime times out if no I/O operations happen for 30 seconds
    // OPTIMIZATION: Only count actual uploads, not skipped/reused images
    const BATCH_SIZE = 25
    const BATCH_PAUSE_MS = 25000 // 25 seconds (must be under Cloudflare's 30s I/O inactivity timeout)
    let actualUploadsInBatch = 0 // Track actual uploads, not iterations

    for (let i = 0; i < total; i++) {
      const url = mediaUrlArray[i]
      // Extract normalized filename from URL for cache lookup and error reporting
      // Uses getFilenameFromUrl() to normalize URL (fix .co domain, strip CarrierWave prefix)
      const preDownloadFilename = this.mediaDownloader.getFilenameFromUrl(url)

      try {
        // PRE-DOWNLOAD CACHE CHECK: Skip download if media already exists
        // This avoids unnecessary HTTP requests for media that already exists in the database
        const existingMediaId = this.mediaUploader.existsInCache(preDownloadFilename)
        if (existingMediaId && !this.options.updateMode) {
          // SKIP MODE: Media exists and we're not updating - no download needed!
          this.idMaps.media.set(url, existingMediaId)
          this.report.incrementSkipped()
          await this.reportDocument('images', preDownloadFilename, 'skipped', {
            current: i + 1,
            total,
          })
          continue // Skip download entirely - major HTTP request savings!
        }

        // Track current operation for heartbeat context
        this.setCurrentOperation(`Downloading images:${preDownloadFilename} (${i + 1}/${total})`)
        const downloadResult = await this.mediaDownloader.downloadAndConvertImage(url)

        // Use the original filename from download result (with CarrierWave prefix stripped)
        const filename = downloadResult.originalFilename
        const metadata = mediaMetadata.get(url) || { alt: '', credit: '' }
        const filenameWithoutExt = path.basename(filename, path.extname(filename))

        // Upload image (MediaUploader now throws MediaUploadError with detailed message on failure)
        this.setCurrentOperation(`Uploading images:${filename} (${i + 1}/${total})`)
        const result = await this.mediaUploader.uploadWithDeduplication(downloadResult.localPath, {
          alt: metadata.alt || filenameWithoutExt,
          credit: metadata.credit || '',
          buffer: downloadResult.buffer, // Pass buffer for Workers mode
          sourceUrl: url, // Include source URL in error messages
          originalFilename: filename,
        })

        // Properly handle deduplication vs new upload
        if (result.wasReused) {
          // Deduplication found existing media - NO rate limiting needed (no Cloudflare API call)
          this.idMaps.media.set(url, result.id)

          if (!this.options.updateMode) {
            // SKIP MODE: Report as skipped (no actual update happened)
            this.report.incrementSkipped()
            await this.reportDocument('images', filename, 'skipped', {
              current: i + 1,
              total,
            })
          } else {
            // UPDATE MODE: Report as updated (MediaUploader may have updated tags)
            this.report.incrementUpdated()
            await this.reportDocument('images', filename, 'updated', {
              current: i + 1,
              total,
            })
          }
          // NO delay for skipped/reused images - no Cloudflare API call was made
        } else {
          // New media uploaded - apply rate limiting
          this.idMaps.media.set(url, result.id)
          this.report.incrementCreated()
          await this.reportDocument('images', filename, 'created', {
            current: i + 1,
            total,
          })

          // Track actual upload and apply rate limiting
          actualUploadsInBatch++

          // Batch pause after BATCH_SIZE actual uploads
          if (actualUploadsInBatch >= BATCH_SIZE) {
            this.setCurrentOperation(`Rate limit pause (${actualUploadsInBatch} uploads)`)
            // eslint-disable-next-line no-console
            console.log(
              `\n    ⏸️  BATCH PAUSE: ${actualUploadsInBatch} uploads. Pausing ${BATCH_PAUSE_MS / 1000}s (under 30s Worker timeout)...\n`,
            )
            await rateLimitDelay(BATCH_PAUSE_MS)
            actualUploadsInBatch = 0
            // eslint-disable-next-line no-console
            console.log(`    ⏸️  Resuming after pause...\n`)
          } else if (i < total - 1) {
            // Small delay between actual uploads only
            await rateLimitDelay(500)
          }
        }
      } catch (error) {
        this.addError(`Importing media ${url}`, error as Error)
        await this.reportDocument('images', preDownloadFilename, 'error', {
          error: (error as Error).message,
          current: i + 1,
          total,
        })
      }
    }
  }

  /**
   * Import media files for a single page's content.
   * Used in paginated mode to process media per-page instead of all at once.
   *
   * This reduces HTTP requests per worker invocation by only processing
   * the media needed for the current page, with pre-download cache checking.
   *
   * @param page - The page object containing translations with content
   * @param pageIndex - Current page index (1-based) for progress reporting
   * @param totalPages - Total number of pages being processed
   * @param pageName - Page name for logging
   */
  private async importMediaForPage(
    page: WeMeditateData['staticPages'][number],
    pageIndex: number,
    totalPages: number,
    pageName: string,
  ): Promise<void> {
    const mediaUrls = new Set<string>()
    const mediaMetadata = new Map<string, { alt: string; credit: string }>()

    // Extract media URLs from this page's translations only
    for (const translation of page.translations) {
      if (!translation.content) continue
      let content
      try {
        content =
          typeof translation.content === 'string'
            ? JSON.parse(translation.content)
            : translation.content
      } catch {
        continue
      }

      const urls = extractMediaUrls(content, STORAGE_BASE_URL)
      urls.forEach((url) => mediaUrls.add(url))

      // Also extract metadata from media blocks
      if (content.blocks) {
        for (const block of content.blocks) {
          if (block.type === 'media' && block.data.items) {
            for (const item of block.data.items) {
              if (item.image?.preview) {
                mediaMetadata.set(item.image.preview, {
                  alt: item.alt || '',
                  credit: item.credit || '',
                })
              }
            }
          }
        }
      }
    }

    // No media in this page - log and skip
    if (mediaUrls.size === 0) {
      await this.sendInfo(`Page ${pageIndex}/${totalPages} "${pageName}": 0 images`)
      return
    }

    const mediaUrlArray = Array.from(mediaUrls)
    let created = 0
    let skipped = 0
    let errors = 0

    for (let i = 0; i < mediaUrlArray.length; i++) {
      const url = mediaUrlArray[i]
      const preDownloadFilename = this.mediaDownloader.getFilenameFromUrl(url)

      try {
        // PRE-DOWNLOAD CACHE CHECK: Skip if already exists
        const existingMediaId = this.mediaUploader.existsInCache(preDownloadFilename)
        if (existingMediaId && !this.options.updateMode) {
          this.idMaps.media.set(url, existingMediaId)
          this.report.incrementSkipped()
          skipped++
          continue
        }

        // Download and upload
        const downloadResult = await this.mediaDownloader.downloadAndConvertImage(url)
        const filename = downloadResult.originalFilename
        const metadata = mediaMetadata.get(url) || { alt: '', credit: '' }
        const filenameWithoutExt = path.basename(filename, path.extname(filename))

        const result = await this.mediaUploader.uploadWithDeduplication(downloadResult.localPath, {
          alt: metadata.alt || filenameWithoutExt,
          credit: metadata.credit || '',
          buffer: downloadResult.buffer,
          sourceUrl: url,
          originalFilename: filename,
        })

        this.idMaps.media.set(url, result.id)

        if (result.wasReused) {
          this.report.incrementSkipped()
          skipped++
        } else {
          this.report.incrementCreated()
          created++
        }
      } catch (error) {
        this.addError(`Importing media for page ${page.id}: ${url}`, error as Error)
        errors++
      }
    }

    // Per-page summary
    const parts = []
    if (created > 0) parts.push(`${created} created`)
    if (skipped > 0) parts.push(`${skipped} skipped`)
    if (errors > 0) parts.push(`${errors} errors`)
    const summary = parts.length > 0 ? parts.join(', ') : 'no changes'
    await this.sendInfo(
      `Page ${pageIndex}/${totalPages} "${pageName}": ${mediaUrlArray.length} images (${summary})`,
    )
  }

  /**
   * Import author images and treatment thumbnails (non-page media).
   * Used in paginated mode to process global media once at the start.
   */
  private async importGlobalMedia(): Promise<void> {
    await this.logger.info('\n=== Importing Global Media (Authors & Thumbnails) ===')

    const mediaUrls = new Set<string>()
    const mediaMetadata = new Map<string, { alt: string; credit: string }>()

    // Scan author images
    for (const author of this.data.authors) {
      if (!author.image) continue
      const imageUrl = extractAuthorImageUrl(author.image, STORAGE_BASE_URL)
      if (imageUrl) {
        mediaUrls.add(imageUrl)
        mediaMetadata.set(imageUrl, { alt: 'Author profile image', credit: '' })
      }
    }

    // Scan treatment thumbnails
    // Apply getOriginalImageUrl to strip CarrierWave prefixes (e.g., small_)
    for (const treatment of this.data.treatmentThumbnails) {
      const thumbnailUrl = getOriginalImageUrl(
        `${STORAGE_BASE_URL}media_file/file/${treatment.media_file_id}/${treatment.thumbnail_file}`,
      )
      mediaUrls.add(thumbnailUrl)
      mediaMetadata.set(thumbnailUrl, {
        alt: `Thumbnail for ${treatment.treatment_name || 'treatment'}`,
        credit: '',
      })
    }

    const total = mediaUrls.size
    if (total === 0) return

    await this.logger.info(`Processing ${total} global media files...`)
    const mediaUrlArray = Array.from(mediaUrls)

    for (let i = 0; i < mediaUrlArray.length; i++) {
      const url = mediaUrlArray[i]
      const preDownloadFilename = this.mediaDownloader.getFilenameFromUrl(url)

      try {
        // PRE-DOWNLOAD CACHE CHECK
        const existingMediaId = this.mediaUploader.existsInCache(preDownloadFilename)
        if (existingMediaId && !this.options.updateMode) {
          this.idMaps.media.set(url, existingMediaId)
          this.report.incrementSkipped()
          await this.reportDocument('images', preDownloadFilename, 'skipped', {
            current: i + 1,
            total,
          })
          continue
        }

        // Download and upload
        const downloadResult = await this.mediaDownloader.downloadAndConvertImage(url)
        const filename = downloadResult.originalFilename
        const metadata = mediaMetadata.get(url) || { alt: '', credit: '' }
        const filenameWithoutExt = path.basename(filename, path.extname(filename))

        const result = await this.mediaUploader.uploadWithDeduplication(downloadResult.localPath, {
          alt: metadata.alt || filenameWithoutExt,
          credit: metadata.credit || '',
          buffer: downloadResult.buffer,
          sourceUrl: url,
          originalFilename: filename,
        })

        this.idMaps.media.set(url, result.id)
        if (result.wasReused) {
          this.report.incrementSkipped()
          await this.reportDocument('images', filename, 'skipped', { current: i + 1, total })
        } else {
          this.report.incrementCreated()
          await this.reportDocument('images', filename, 'created', { current: i + 1, total })
        }
      } catch (error) {
        this.addError(`Importing global media ${url}`, error as Error)
        await this.reportDocument('images', preDownloadFilename, 'error', {
          error: (error as Error).message,
          current: i + 1,
          total,
        })
      }
    }
  }

  // ============================================================================
  // LECTURES IMPORT
  // ============================================================================

  private async importLectures(): Promise<void> {
    await this.logger.info('\n=== Importing Lectures ===')

    const videoIds = new Set<string>()
    const videoMetadata = new Map<
      string,
      { title: string; thumbnail: string; vimeoId?: string; youtubeId?: string }
    >()

    // Scan content for video IDs from pre-extracted data
    const allPageTypes = [
      this.data.staticPages,
      this.data.articles,
      this.data.subtleSystemNodes,
      this.data.treatments,
    ]

    for (const pages of allPageTypes) {
      for (const page of pages) {
        for (const translation of page.translations) {
          if (!translation.content) continue
          let content
          try {
            content =
              typeof translation.content === 'string'
                ? JSON.parse(translation.content)
                : translation.content
          } catch {
            continue
          }

          if (!content?.blocks) continue
          for (const block of content.blocks) {
            if (block.type === 'vimeo' && block.data) {
              const videoId = block.data.vimeo_id || block.data.youtube_id
              if (videoId) {
                videoIds.add(videoId)
                videoMetadata.set(videoId, {
                  title: block.data.title || '',
                  thumbnail: block.data.thumbnail || '',
                  vimeoId: block.data.vimeo_id,
                  youtubeId: block.data.youtube_id,
                })
              }
            }
          }
        }
      }
    }

    await this.logger.info(`Found ${videoIds.size} unique lectures`)

    for (const videoId of Array.from(videoIds)) {
      try {
        const metadata = videoMetadata.get(videoId)!
        const videoUrl = metadata.vimeoId
          ? `https://vimeo.com/${metadata.vimeoId}`
          : `https://youtube.com/watch?v=${metadata.youtubeId}`

        const thumbnailId = await this.fetchVideoThumbnail(
          videoId,
          metadata.vimeoId,
          metadata.youtubeId,
        )

        const result = await this.upsert<{ id: number }>(
          'lectures',
          { videoUrl: { equals: videoUrl } },
          {
            title: metadata.title || `Video ${videoId}`,
            videoUrl,
            thumbnail: thumbnailId,
          },
        )

        this.idMaps.lectures.set(videoId, result.doc.id)
      } catch (error) {
        this.addError(`Creating lecture ${videoId}`, error as Error)
      }
    }
  }

  // ============================================================================
  // PAGES WITH CONTENT (Phase 2)
  // ============================================================================

  private async importPagesWithContent(
    tableName: string,
    _translationsTable: string,
  ): Promise<void> {
    await this.logger.info(`\n=== Updating ${tableName} with Content ===`)

    // Map table names to pre-extracted data arrays
    const dataMap: Record<string, typeof this.data.staticPages | typeof this.data.articles> = {
      static_pages: this.data.staticPages,
      articles: this.data.articles,
      subtle_system_nodes: this.data.subtleSystemNodes,
      treatments: this.data.treatments,
    }

    const sourcePages = dataMap[tableName] || []

    // Filter to pages that have content and English translations
    const pagesWithContent = sourcePages.filter((p) => {
      const hasEnglish = p.translations.some((t) => t.locale === 'en')
      const hasContent = p.translations.some((t) => t.content)
      return hasEnglish && hasContent
    })

    await this.logger.info(`Updating ${pagesWithContent.length} pages with content`)

    const mapKeyMap: Record<string, keyof typeof this.idMaps> = {
      static_pages: 'staticPages',
      articles: 'articles',
      subtle_system_nodes: 'subtleSystemNodes',
      treatments: 'treatments',
    }
    const mapKey = mapKeyMap[tableName]
    const pageIdMap = this.idMaps[mapKey] as Map<number, number>

    for (const page of pagesWithContent) {
      const numericId =
        typeof page.id === 'string' ? parseInt(page.id as unknown as string) : page.id
      const pageId = pageIdMap.get(numericId)
      if (!pageId) {
        this.addWarning(`Page ${page.id} from ${tableName} not in ID map`)
        continue
      }

      // Get English title for context
      const enTranslation = page.translations.find((t) => t.locale === 'en')
      const pageTitle = enTranslation?.name || 'Unknown'

      try {
        for (const translation of page.translations) {
          if (!translation.locale || !translation.content) continue
          if (!LOCALES.includes(translation.locale as (typeof LOCALES)[number])) continue

          let content
          try {
            if (typeof translation.content === 'string') {
              const contentStr = translation.content.replace(/=>/g, ':')
              content = JSON.parse(contentStr)
            } else {
              content = translation.content
            }
          } catch {
            continue
          }

          const context: ConversionContext = {
            payload: this.payload,
            logger: this.logger,
            pageId: page.id,
            pageTitle,
            locale: translation.locale,
            mediaMap: this.idMaps.media,
            formMap: this.idMaps.forms,
            lectureMap: this.idMaps.lectures,
            treatmentMap: this.idMaps.treatments,
            treatmentThumbnailMap: this.treatmentThumbnailMap,
            meditationTitleMap: this.meditationTitleMap,
            meditationRailsTitleMap: this.meditationRailsTitleMap,
          }

          const lexicalContent = await convertEditorJSToLexical(content, context)

          // For treatments: prepend thumbnail
          if (tableName === 'treatments') {
            const thumbnailMediaId = this.treatmentThumbnailMap.get(numericId)
            if (thumbnailMediaId) {
              const thumbnailNode = createUploadNode(thumbnailMediaId, 'right')
              lexicalContent.root.children.unshift(thumbnailNode)
            }
          }

          // Use translation.name directly instead of fetching existingPage just for the title
          await this.payload.update({
            collection: 'pages',
            id: pageId,
            data: {
              title: translation.name || 'Untitled',
              content: lexicalContent as any, // Type assertion needed for Lexical content compatibility
            },
            locale: translation.locale as TypedLocale,
          })
        }

        await this.logger.info(`✓ Updated page ${page.id} -> ${pageId} with content`)
      } catch (error) {
        this.addError(`Updating page ${page.id} with content`, error as Error)
      }
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async buildMeditationTitleMap(): Promise<void> {
    await this.logger.info('\n=== Building Meditation Maps ===')

    try {
      const meditations = await this.payload.find({
        collection: 'meditations',
        limit: 1000,
      })

      for (const meditation of meditations.docs) {
        if (meditation.title) {
          this.meditationTitleMap.set(meditation.title.toLowerCase().trim(), meditation.id)
        }
      }

      await this.logger.info(`✓ Built title map with ${this.meditationTitleMap.size} meditations`)

      // Use pre-extracted meditation translations
      for (const row of this.data.meditationTranslations) {
        if (row.name) {
          const titleWithoutDuration = row.name.split('|')[0].trim().toLowerCase()
          this.meditationRailsTitleMap.set(row.meditation_id, titleWithoutDuration)
        }
      }

      await this.logger.info(
        `✓ Built Rails title map with ${this.meditationRailsTitleMap.size} meditations`,
      )
    } catch (error) {
      this.addError('Building meditation maps', error as Error)
    }
  }

  private async buildTreatmentThumbnailMap(): Promise<void> {
    await this.logger.info('\n=== Building Treatment Thumbnail Map ===')

    try {
      // Use pre-extracted treatment thumbnails
      for (const row of this.data.treatmentThumbnails) {
        const treatmentId = row.treatment_id

        // Construct URL and extract filename (normalized to strip CarrierWave prefixes)
        const thumbnailUrl = `${STORAGE_BASE_URL}media_file/file/${row.media_file_id}/${row.thumbnail_file}`
        const filename = this.mediaDownloader.getFilenameFromUrl(thumbnailUrl)

        // Look up by filename in media cache (populated by preloadExistingMedia or importGlobalMedia)
        let mediaId = this.mediaUploader.existsInCache(filename)

        // If not in cache, query DB directly by filename pattern
        // This handles cases where images were uploaded before originalFilename was stored
        if (!mediaId) {
          mediaId = await this.mediaUploader.findMediaByFilename(filename)
        }

        // If still not found, search by alt text (for Cloudflare Images with hash filenames)
        // Alt text is set to "Thumbnail for {treatment_name}" during importGlobalMedia
        if (!mediaId && row.treatment_name) {
          const altText = `Thumbnail for ${row.treatment_name}`
          const result = await this.payload.find({
            collection: 'images',
            where: { alt: { equals: altText } },
            limit: 1,
            depth: 0,
          })
          if (result.docs.length > 0) {
            mediaId = result.docs[0].id
          }
        }

        if (mediaId) {
          this.treatmentThumbnailMap.set(treatmentId, mediaId)
        } else {
          this.addWarning(
            `Thumbnail for treatment ${treatmentId} "${row.treatment_name || 'unknown'}" not found in media cache (filename: ${filename})`,
          )
        }
      }

      await this.logger.info(
        `✓ Built treatment thumbnail map with ${this.treatmentThumbnailMap.size} thumbnails`,
      )
    } catch (error) {
      this.addError('Building treatment thumbnail map', error as Error)
    }
  }

  private async getDefaultThumbnail(): Promise<number | string> {
    if (this.defaultThumbnailId) return this.defaultThumbnailId

    const PREVIEW_URL =
      'https://raw.githubusercontent.com/sydevs/SahajCloud/main/seeds/wemeditate/preview.png'

    // Tags for default placeholder thumbnail (now inline enum strings)
    const tags = [this.thumbnailTag, this.placeholderTag]

    // Try local file first (returns null in Workers mode)
    const previewPath = path.join(__dirname, 'preview.png')
    let buffer: Buffer | undefined = (await readCache(previewPath)) ?? undefined
    let localPath = previewPath

    if (!buffer) {
      // Workers mode or local file missing: fetch from URL
      const downloadResult = await this.mediaDownloader.downloadAndConvertImage(PREVIEW_URL)
      buffer = downloadResult.buffer
      localPath = downloadResult.localPath
    }

    const result = await this.mediaUploader.uploadWithDeduplication(localPath, {
      alt: 'Video preview placeholder',
      buffer,
      tags,
    })
    if (!result) throw new Error('Failed to upload default thumbnail')
    this.defaultThumbnailId = result.id
    return result.id
  }

  private async fetchVideoThumbnail(
    videoId: string,
    vimeoId?: string,
    youtubeId?: string,
  ): Promise<number | string> {
    try {
      let thumbnailUrl: string | null = null

      if (vimeoId) {
        try {
          const oembedUrl = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${vimeoId}`
          const response = await fetch(oembedUrl)
          if (response.ok) {
            const data = (await response.json()) as { thumbnail_url?: string }
            thumbnailUrl = data.thumbnail_url ?? null
          }
        } catch {
          // Fall through to default
        }
      } else if (youtubeId) {
        const maxResUrl = `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`
        try {
          const response = await fetch(maxResUrl, { method: 'HEAD' })
          if (response.ok) {
            thumbnailUrl = maxResUrl
          } else {
            thumbnailUrl = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
          }
        } catch {
          thumbnailUrl = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
        }
      }

      if (thumbnailUrl) {
        const downloadResult = await this.mediaDownloader.downloadAndConvertImage(thumbnailUrl)
        const thumbnailTags = [this.thumbnailTag]
        const uploadResult = await this.mediaUploader.uploadWithDeduplication(
          downloadResult.localPath,
          {
            alt: `Video thumbnail for ${videoId}`,
            buffer: downloadResult.buffer, // Pass buffer for Workers mode
            tags: thumbnailTags,
          },
        )
        if (uploadResult) return uploadResult.id
      }

      return await this.getDefaultThumbnail()
    } catch {
      return await this.getDefaultThumbnail()
    }
  }

  private findPageBySlug(slug: string): number | null {
    // Use preloaded cache from setup() - no DB query needed
    const cached = this.getPreloaded('pages', slug)
    return cached ? (cached.id as number) : null
  }

  /**
   * Find song tag IDs by slug using pre-cached data (synchronous lookup)
   * Call preloadSongTags() before using this method
   */
  private findSongTagsBySlug(tagSlugs: string[]): number[] {
    const tagIds: number[] = []
    for (const slug of tagSlugs) {
      const tagId = this.songTagCache.get(slug)
      if (tagId !== undefined) {
        tagIds.push(tagId)
      } else {
        this.addWarning(`Song tag "${slug}" not found in cache - run tags import first`)
      }
    }
    return tagIds
  }

  private async updateWeMeditateWebSettings(): Promise<void> {
    await this.logger.info('\n=== Updating We Meditate Web Settings ===')

    try {
      const pageMapping = {
        homePage: await this.findPageBySlug('home-page'),
        featuredPages: await Promise.all([
          this.findPageBySlug('chakras-channels'),
          this.findPageBySlug('kundalini'),
          this.findPageBySlug('shri-mataji'),
          this.findPageBySlug('sahaja-yoga'),
          this.findPageBySlug('improving-meditation'),
        ]),
        footerPages: await Promise.all([
          this.findPageBySlug('classes-near-me'),
          this.findPageBySlug('meditate-now'),
          this.findPageBySlug('live-meditations'),
          this.findPageBySlug('privacy-notice'),
          this.findPageBySlug('contact-us'),
        ]),
        musicPage: await this.findPageBySlug('music-for-meditation'),
        subtleSystemPage: await this.findPageBySlug('chakras-channels'),
        left: await this.findPageBySlug('left-channel'),
        right: await this.findPageBySlug('right-channel'),
        center: await this.findPageBySlug('central-channel'),
        mooladhara: await this.findPageBySlug('mooladhara-chakra'),
        kundalini: await this.findPageBySlug('kundalini'),
        swadhistan: await this.findPageBySlug('swadhistan-chakra'),
        nabhi: await this.findPageBySlug('nabhi-chakra'),
        void: await this.findPageBySlug('void-chakra'),
        anahat: await this.findPageBySlug('heart-chakra'),
        vishuddhi: await this.findPageBySlug('vishuddhi-chakra'),
        agnya: await this.findPageBySlug('agnya-chakra'),
        sahasrara: await this.findPageBySlug('sahasrara-chakra'),
        techniquesPage: await this.findPageBySlug('improving-meditation'),
        inspirationPage: await this.findPageBySlug('inspiration'),
        classesPage: await this.findPageBySlug('classes-near-me'),
        liveMeditationsPage: await this.findPageBySlug('live-meditations'),
      }

      // Page tags are now inline enum strings
      const inspirationPageTags: ('wisdom' | 'lifestyle' | 'creativity' | 'event' | 'technique')[] = [
        'creativity',
        'wisdom',
        'lifestyle',
        'event',
      ]

      const featuredPages = pageMapping.featuredPages.filter((id) => id !== null) as number[]
      const footerPages = pageMapping.footerPages.filter((id) => id !== null) as number[]

      // Validate required fields
      if (!pageMapping.homePage || featuredPages.length < 3) {
        this.addWarning('Cannot update WeMeditate Web Settings: missing required pages')
        return
      }

      // Helper to convert null to undefined (Payload expects undefined for unset relationships)
      const toUndefined = (val: number | null): number | undefined => val ?? undefined

      await this.payload.updateGlobal({
        slug: 'we-meditate-web-settings',
        data: {
          homePage: pageMapping.homePage,
          featuredPages,
          footerPages,
          musicPage: toUndefined(pageMapping.musicPage),
          subtleSystemPage: toUndefined(pageMapping.subtleSystemPage),
          left: toUndefined(pageMapping.left),
          right: toUndefined(pageMapping.right),
          center: toUndefined(pageMapping.center),
          mooladhara: toUndefined(pageMapping.mooladhara),
          kundalini: toUndefined(pageMapping.kundalini),
          swadhistan: toUndefined(pageMapping.swadhistan),
          nabhi: toUndefined(pageMapping.nabhi),
          void: toUndefined(pageMapping.void),
          anahat: toUndefined(pageMapping.anahat),
          vishuddhi: toUndefined(pageMapping.vishuddhi),
          agnya: toUndefined(pageMapping.agnya),
          sahasrara: toUndefined(pageMapping.sahasrara),
          techniquesPage: toUndefined(pageMapping.techniquesPage),
          inspirationPage: toUndefined(pageMapping.inspirationPage),
          inspirationPageTags,
          classesPage: toUndefined(pageMapping.classesPage),
          liveMeditationsPage: toUndefined(pageMapping.liveMeditationsPage),
        },
      })

      await this.logger.success('✓ We Meditate Web Settings updated')
    } catch (error) {
      this.addError('Updating We Meditate Web Settings', error as Error)
    }
  }
}
