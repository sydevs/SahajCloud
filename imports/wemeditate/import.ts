#!/usr/bin/env tsx
 

/**
 * WeMeditate Rails Database Import Script
 *
 * Imports content from pre-extracted JSON data into Payload CMS.
 *
 * Features:
 * - Two-phase import (metadata first, content second)
 * - Idempotent: safely re-runnable (updates existing, creates new)
 * - Uses slug as natural key for pages, authors, and page-tags
 * - Uses videoUrl as natural key for external videos
 * - No PostgreSQL dependency - can run anywhere (migrations, CI/CD, Workers)
 *
 * DATA SOURCE:
 * - JSON file (imports/wemeditate/data.json) - pre-extracted from legacy Rails PostgreSQL
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

import { readFile } from 'fs/promises'
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
  TagManager,
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
import { MediaDownloader, extractMediaUrls, extractAuthorImageUrl } from '../lib/mediaDownloader'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DIR = path.resolve(process.cwd(), 'imports/cache/wemeditate')
const STORAGE_BASE_URL = 'https://assets.wemeditate.com/uploads/'

/**
 * GitHub raw URL base for fetching data files when running in Cloudflare Workers
 */
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/sydevs/SahajCloud/main'

const ARTICLE_TYPE_TAGS: Record<number, string> = {
  0: 'article',
  1: 'artwork',
  2: 'event',
  3: 'report',
}

const CONTENT_TYPE_TAGS: Record<string, string> = {
  static_pages: 'static-page',
  articles: 'article',
  promo_pages: 'promo',
  subtle_system_nodes: 'subtle-system',
  treatments: 'treatment',
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
  private tagManager!: TagManager
  private defaultThumbnailId: number | string | null = null

  // Image tag IDs
  private thumbnailTagId: number | null = null
  private placeholderTagId: number | null = null

  // In-memory maps for Phase 2 content conversion (old ID → Payload ID)
  // These are populated during Phase 1 and used during Phase 2
  private idMaps = {
    authors: new Map<number, number | string>(),
    albums: new Map<number, number | string>(),
    categories: new Map<number, number | string>(),
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
  private contentTypeTagMap = new Map<string, number>()

  // Pre-cached music tags (slug → id) to avoid N+1 queries
  private musicTagCache = new Map<string, number>()

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
      this.tagManager = new TagManager(this.payload, this.logger)

      // Pre-cache to avoid N+1 queries during import
      await this.preloadMusicTags()
      await this.mediaUploader.preloadExistingMedia()
      await this.setupImageTags()

      // Preload collections for efficient skip/update mode
      // This dramatically reduces D1 queries by caching existence checks
      await Promise.all([
        this.preloadCollection('authors', 'slug'),
        this.preloadCollection('albums', 'title'), // WeMeditate looks up albums by title
        this.preloadCollection('music', 'title'), // WeMeditate looks up music by title
        this.preloadCollection('pages', 'slug'),
        this.preloadCollection('page-tags', 'slug'),
      ])
    }
  }

  /**
   * Setup image tags for content categorization.
   * Creates tags if they don't exist and caches their IDs.
   */
  private async setupImageTags(): Promise<void> {
    await this.logger.info('Setting up image tags...')

    const [thumbnailId, placeholderId] = await Promise.all([
      this.tagManager.ensureTag('image-tags', 'thumbnail'),
      this.tagManager.ensureTag('image-tags', 'placeholder'),
    ])

    this.thumbnailTagId = thumbnailId
    this.placeholderTagId = placeholderId

    await this.logger.info('✓ Image tags ready')
  }

  /**
   * Pre-load all music tags into memory cache to avoid per-track queries
   */
  private async preloadMusicTags(): Promise<void> {
    await this.logger.info('Pre-loading music tags...')
    const tags = await this.payload.find({
      collection: 'music-tags',
      limit: 100,
    })
    for (const tag of tags.docs) {
      if (tag.slug) {
        this.musicTagCache.set(tag.slug, tag.id)
      }
    }
    await this.logger.info(`✓ Pre-loaded ${this.musicTagCache.size} music tags`)
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
   * cross-collection references (e.g., music tracks referencing albums).
   */
  protected async reconstructIdMaps(): Promise<void> {
    await this.logger.info('Reconstructing ID maps from database...')

    // Load source data to get artist info (needed for music → album mapping)
    // This is required because reconstructIdMaps() is called before import()
    await this.loadData()

    // For authors and categories, we can't reconstruct the original Rails ID → Payload ID mapping
    // because we don't store the Rails IDs. However, we look up by slug during import anyway.
    const authors = await this.payload.find({ collection: 'authors', limit: 100, depth: 0 })
    await this.logger.info(`✓ Found ${authors.totalDocs} existing authors`)

    const pageTags = await this.payload.find({ collection: 'page-tags', limit: 100, depth: 0 })
    await this.logger.info(`✓ Found ${pageTags.totalDocs} existing page-tags`)

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

    const localPath = path.resolve(process.cwd(), 'imports/wemeditate/data.json')
    const workerUrl = `${GITHUB_RAW_BASE}/imports/wemeditate/data.json`

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
      if (!isPaginated || this.isCollectionTargeted('music')) {
        await this.importMusic()
      }

      // Categories and content type tags are always needed for pages
      if (!isPaginated) {
        await this.importCategories()
        await this.importContentTypeTags()
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
    // Ensure categories and content type tags exist
    await this.importCategories()
    await this.importContentTypeTags()

    // Build required maps for content conversion
    await this.buildMeditationTitleMap()
    await this.importForms()
    await this.importMedia()
    await this.importLectures()
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

      try {
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
      this.skip(`${tableName} ${page.id}: no English translation`)
      return
    }

    // For treatments: check if thumbnail exists
    if (tableName === 'treatments') {
      const treatmentId = typeof page.id === 'string' ? parseInt(page.id as string) : page.id
      if (!this.treatmentThumbnailMap.has(treatmentId)) {
        this.skip(`Treatment ${page.id} "${enTranslation.name!}" has no thumbnail`)
        return
      }
    }

    // Generate slug
    const slug =
      enTranslation.slug?.trim() ||
      enTranslation.name!
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

    // Get author and tags
    let authorId: number | string | undefined
    if (pageAny.author_id && this.idMaps.authors.has(pageAny.author_id)) {
      authorId = this.idMaps.authors.get(pageAny.author_id)
    }

    const tags: (number | string)[] = []
    const contentTypeTag = CONTENT_TYPE_TAGS[tableName]
    if (contentTypeTag) {
      const tagId = this.contentTypeTagMap.get(`content-type-tag-${contentTypeTag}`)
      if (tagId) tags.push(tagId)
    }

    if (pageAny.article_type !== undefined && ARTICLE_TYPE_TAGS[pageAny.article_type]) {
      const articleTypeTag = ARTICLE_TYPE_TAGS[pageAny.article_type]
      const tagId = this.contentTypeTagMap.get(`content-type-tag-${articleTypeTag}`)
      if (tagId) tags.push(tagId)
    }

    if (pageAny.category_id && this.idMaps.categories.has(pageAny.category_id)) {
      tags.push(this.idMaps.categories.get(pageAny.category_id)!)
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

    // Store in appropriate ID map
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

      try {
        // Find English translation
        const enTranslation = author.translations.find((t: any) => t.locale === 'en' && t.name)
        if (!enTranslation) {
          this.skip(`Author ${author.id}: no English translation`)
          continue
        }

        // Generate slug from name
        const slug = enTranslation.name!
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')

        // Upsert author by slug
        const authorResult = await this.upsert<{ id: number }>(
          'authors',
          { slug: { equals: slug } },
          {
            name: enTranslation.name!,
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

        this.idMaps.authors.set(author.id, authorResult.doc.id)
      } catch (error) {
        this.addError(`Importing author ${author.id}`, error as Error)
      }
    }
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
          this.skip(`Artist ${artist.id}: no name`)
          continue
        }

        // Check preload cache first (fast, in-memory) - albums are preloaded by title in setup()
        const existingFromCache = this.getPreloaded('albums', artist.name)
        if (existingFromCache) {
          // Always record the ID mapping (needed for music import)
          this.idMaps.albums.set(artist.id, existingFromCache.id)

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
        // The Workers Buffer polyfill can have issues with byteOffset when creating Uint8Array views
        const cleanBuffer = Buffer.from(new Uint8Array(fileBuffer))

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
            // Try with local preview.png placeholder
            try {
              const placeholderPath = path.join(__dirname, 'preview.png')
              const placeholderBuffer = await readFile(placeholderPath)
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
                placeholderError instanceof Error ? placeholderError.message : String(placeholderError)
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

        this.idMaps.albums.set(artist.id, albumDoc.id)
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
    const githubUrl = `${GITHUB_RAW_BASE}/imports/wemeditate/preview.png`

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
  // MUSIC IMPORT (from tracks table)
  // ============================================================================

  /**
   * Instrument filter to music tag slug mapping
   * Legacy: sitar.svg -> Strings, vocal.svg -> Vocal, flute.svg -> Wind
   * Maps to: strings, vocals, flute
   */
  private readonly INSTRUMENT_TAG_MAP: Record<number, string> = {
    1: 'strings', // sitar.svg -> Strings
    2: 'vocals', // vocal.svg -> Vocal (need to ensure this tag exists)
    3: 'flute', // flute.svg -> Wind
  }

  private async importMusic(): Promise<void> {
    // Ensure vocals tag exists (it might not be in the tags import)
    await this.ensureVocalsTagExists()

    // Use pre-extracted tracks data
    const tracks = this.data.tracks
    const total = tracks.length

    for (let i = 0; i < total; i++) {
      const track = tracks[i]

      try {
        if (!track.title) {
          this.skip(`Track ${track.id}: no English title`)
          continue
        }

        if (!track.audio) {
          this.skip(`Track ${track.id} "${track.title}": no audio file`)
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
            this.addWarning(
              `Track ${track.id} "${track.title}": artist ${firstArtistId} not found in albums map`,
            )
          }
        }

        if (!albumId) {
          this.skip(`Track ${track.id} "${track.title}": no album association`)
          continue
        }

        // Map instrument filters to music tags
        const tagIds: number[] = []
        if (track.instrument_filter_ids && track.instrument_filter_ids.length > 0) {
          for (const filterId of track.instrument_filter_ids) {
            const tagSlug = this.INSTRUMENT_TAG_MAP[filterId]
            if (tagSlug) {
              const musicTagIds = this.findMusicTagsBySlug([tagSlug])
              tagIds.push(...musicTagIds)
            }
          }
        }

        // Convert album ID to number for Payload type compatibility
        const numericAlbumId = typeof albumId === 'string' ? parseInt(albumId, 10) : albumId

        // Check preload cache first (fast, in-memory) - music is preloaded by title in setup()
        const existingFromCache = this.getPreloaded('music', track.title)
        if (existingFromCache) {
          if (!this.options.updateMode) {
            // SKIP MODE: Don't update existing music
            this.report.incrementSkipped()
            await this.reportDocument('music', track.title, 'skipped', {
              current: i + 1,
              total,
            })
            continue
          }

          // UPDATE MODE: Update existing music with album and tags
          await this.payload.update({
            collection: 'music',
            id: existingFromCache.id,
            data: {
              album: numericAlbumId,
              tags: tagIds.length > 0 ? tagIds : undefined,
            },
            locale: 'en',
          })
          this.report.incrementUpdated()
          await this.reportDocument('music', track.title, 'updated', {
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
          await this.reportDocument('music', track.title, 'error', {
            error: (error as Error).message,
            current: i + 1,
            total,
          })
          continue
        }

        await this.payload.create({
          collection: 'music',
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
        await this.reportDocument('music', track.title, 'created', {
          current: i + 1,
          total,
        })
      } catch (error) {
        this.addError(`Importing track ${track.id}`, error as Error)
        await this.reportDocument('music', track.title || `track-${track.id}`, 'error', {
          error: (error as Error).message,
          current: i + 1,
          total,
        })
      }
    }
  }

  /**
   * Ensure the vocals tag exists in the music-tags collection
   * This tag may not be present in the standard tags import
   */
  private async ensureVocalsTagExists(): Promise<void> {
    try {
      const existing = await this.payload.find({
        collection: 'music-tags',
        where: { slug: { equals: 'vocals' } },
        limit: 1,
      })

      if (existing.docs.length > 0) {
        await this.logger.info('✓ Vocals tag already exists')
        return
      }

      // Try to read SVG from filesystem (returns null in Workers mode)
      const svgPath = path.resolve(process.cwd(), 'imports/tags/music-tag.svg')
      let svgBuffer = await readCache(svgPath)

      if (!svgBuffer) {
        // Workers mode (or file missing): use minimal music note SVG
        // Use TextEncoder for Workers compatibility (Buffer.from with encoding arg doesn't work in Workers)
        const svgContent =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>'
        const encoder = new TextEncoder()
        const uint8Array = encoder.encode(svgContent)
        svgBuffer = Buffer.from(uint8Array)
      }

      await this.payload.create({
        collection: 'music-tags',
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

      await this.logger.info('✓ Created vocals tag with music icon')
    } catch (error) {
      this.addError('Creating vocals tag', error as Error)
    }
  }

  // ============================================================================
  // CATEGORIES IMPORT (as Page Tags)
  // ============================================================================

  private async importCategories(): Promise<void> {
    await this.logger.info('\n=== Importing Categories as Page Tags ===')

    const categories = this.data.categories

    await this.logger.info(`Found ${categories.length} categories`)

    for (const category of categories) {
      try {
        const enTranslation = category.translations.find((t: any) => t.locale === 'en' && t.name)
        if (!enTranslation) {
          this.skip(`Category ${category.id}: no English translation`)
          continue
        }

        // Generate slug from title
        const slug =
          enTranslation.slug ||
          enTranslation.name!
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')

        // Upsert page tag by slug
        const tagResult = await this.upsert<{ id: number }>(
          'page-tags',
          { slug: { equals: slug } },
          { title: enTranslation.name! },
          { locale: 'en' },
        )

        // Update other locales using helper
        await this.updateLocales(
          'page-tags',
          tagResult.doc.id,
          category.translations,
          (t) => ({ title: t.name }),
          { excludeLocale: 'en', requiredFields: ['name'] },
        )

        this.idMaps.categories.set(category.id, tagResult.doc.id)
      } catch (error) {
        this.addError(`Importing category ${category.id}`, error as Error)
      }
    }
  }

  // ============================================================================
  // CONTENT TYPE TAGS
  // ============================================================================

  private async importContentTypeTags(): Promise<void> {
    await this.logger.info('\n=== Creating Content Type Tags ===')

    for (const [_sourceType, tagName] of Object.entries(CONTENT_TYPE_TAGS)) {
      try {
        const slug = tagName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+/g, '-')

        const result = await this.upsert<{ id: number }>(
          'page-tags',
          { slug: { equals: slug } },
          { title: tagName },
        )

        this.contentTypeTagMap.set(`content-type-tag-${tagName}`, result.doc.id)
      } catch (error) {
        this.addError(`Creating content type tag ${tagName}`, error as Error)
      }
    }

    // Also create article type tags
    for (const articleType of Object.values(ARTICLE_TYPE_TAGS)) {
      try {
        const slug = articleType
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+/g, '-')

        const result = await this.upsert<{ id: number }>(
          'page-tags',
          { slug: { equals: slug } },
          { title: articleType },
        )

        this.contentTypeTagMap.set(`content-type-tag-${articleType}`, result.doc.id)
      } catch (_error) {
        // Tag might already exist from content type tags
      }
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
          this.skip(`${tableName} ${page.id}: no English translation`)
          continue
        }

        // For treatments: check if thumbnail exists
        if (tableName === 'treatments') {
          const treatmentId = typeof page.id === 'string' ? parseInt(page.id) : page.id
          if (!this.treatmentThumbnailMap.has(treatmentId)) {
            this.skip(`Treatment ${page.id} "${enTranslation.name!}" has no thumbnail`)
            continue
          }
        }

        // Generate slug
        const slug =
          enTranslation.slug?.trim() ||
          enTranslation.name!
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')

        // Get author and tags
        let authorId: number | string | undefined
        if (page.author_id && this.idMaps.authors.has(page.author_id)) {
          authorId = this.idMaps.authors.get(page.author_id)
        }

        const tags: (number | string)[] = []
        const contentTypeTag = CONTENT_TYPE_TAGS[tableName]
        if (contentTypeTag) {
          const tagId = this.contentTypeTagMap.get(`content-type-tag-${contentTypeTag}`)
          if (tagId) tags.push(tagId)
        }

        if (page.article_type !== undefined && ARTICLE_TYPE_TAGS[page.article_type]) {
          const articleTypeTag = ARTICLE_TYPE_TAGS[page.article_type]
          const tagId = this.contentTypeTagMap.get(`content-type-tag-${articleTypeTag}`)
          if (tagId) tags.push(tagId)
        }

        if (page.category_id && this.idMaps.categories.has(page.category_id)) {
          tags.push(this.idMaps.categories.get(page.category_id)!)
        }

        // Calculate published state - _status: 'published' if ANY locale has published_at
        type Translation = { locale: string; published_at?: string }
        const isPublished = page.translations.some(
          (t: Translation) => t.published_at && LOCALES.includes(t.locale as (typeof LOCALES)[number]),
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

        // Store in appropriate ID map
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
    for (const treatment of this.data.treatmentThumbnails) {
      const thumbnailUrl = `${STORAGE_BASE_URL}media_file/file/${treatment.media_file_id}/${treatment.thumbnail_file}`
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
    // Using small batches (15) to stay well under rate limit
    const BATCH_SIZE = 15
    const BATCH_PAUSE_MS = 180000 // 3 minutes

    for (let i = 0; i < total; i++) {
      const url = mediaUrlArray[i]
      const filename = path.basename(url).split('?')[0] // Remove query params for identifier

      // Batch pause BEFORE uploads (every 40 items) to stay under rate limits
      // This runs at the START of iteration, so pause happens before upload attempt
      if (i > 0 && i % BATCH_SIZE === 0) {
        // eslint-disable-next-line no-console
        console.log(
          `\n    ⏸️  BATCH PAUSE: ${i} uploads done. Waiting ${BATCH_PAUSE_MS / 1000}s for rate limit reset...\n`,
        )
        await rateLimitDelay(BATCH_PAUSE_MS)
        // eslint-disable-next-line no-console
        console.log(`    ⏸️  Resuming after pause...\n`)
      }

      try {
        const downloadResult = await this.mediaDownloader.downloadAndConvertImage(url)
        const metadata = mediaMetadata.get(url) || { alt: '', credit: '' }
        const filenameWithoutExt = path.basename(
          downloadResult.localPath,
          path.extname(downloadResult.localPath),
        )

        // Upload with retry logic for Workers mode resilience
        const maxRetries = 3
        let result = null
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            result = await this.mediaUploader.uploadWithDeduplication(downloadResult.localPath, {
              alt: metadata.alt || filenameWithoutExt,
              credit: metadata.credit || '',
              buffer: downloadResult.buffer, // Pass buffer for Workers mode
              sourceUrl: url, // Include source URL in error messages
            })

            if (result) {
              break // Success
            } else {
              throw new Error('MediaUploader returned null')
            }
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))
            if (attempt < maxRetries) {
              // Exponential backoff: 500ms, 1s, 2s
              const delay = 500 * Math.pow(2, attempt - 1)
              await rateLimitDelay(delay)
            }
          }
        }

        if (!result) {
          throw lastError || new Error('Failed to upload media after retries')
        }

        // Properly handle deduplication vs new upload
        if (result.wasReused) {
          // Deduplication found existing media
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
        } else {
          // New media uploaded
          this.idMaps.media.set(url, result.id)
          this.report.incrementCreated()
          await this.reportDocument('images', filename, 'created', {
            current: i + 1,
            total,
          })
        }

        // Small delay after each successful upload for additional rate limit protection
        if (i < total - 1) {
          await rateLimitDelay(500)
        }
      } catch (error) {
        this.addError(`Importing media ${url}`, error as Error)
        await this.reportDocument('images', filename, 'error', {
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
      const numericId = typeof page.id === 'string' ? parseInt(page.id as unknown as string) : page.id
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

        const thumbnailUrl = `${STORAGE_BASE_URL}media_file/file/${row.media_file_id}/${row.thumbnail_file}`
        const mediaId = this.idMaps.media.get(thumbnailUrl)
        if (mediaId) {
          this.treatmentThumbnailMap.set(treatmentId, mediaId)
        } else {
          this.addWarning(
            `Thumbnail for treatment ${treatmentId} "${row.treatment_name || 'unknown'}" not found in media map`,
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
      'https://raw.githubusercontent.com/sydevs/SahajCloud/main/imports/wemeditate/preview.png'

    // Tags for default placeholder thumbnail
    const tags = [this.thumbnailTagId, this.placeholderTagId].filter(
      (id): id is number => id !== null,
    )

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
        const thumbnailTags = this.thumbnailTagId ? [this.thumbnailTagId] : []
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

  private async findPageBySlug(slug: string): Promise<number | null> {
    try {
      const result = await this.payload.find({
        collection: 'pages',
        where: { slug: { equals: slug } },
        limit: 1,
        locale: 'en',
      })
      return result.docs.length > 0 ? result.docs[0].id : null
    } catch {
      return null
    }
  }

  /**
   * Find music tag IDs by slug using pre-cached data (synchronous lookup)
   * Call preloadMusicTags() before using this method
   */
  private findMusicTagsBySlug(tagSlugs: string[]): number[] {
    const tagIds: number[] = []
    for (const slug of tagSlugs) {
      const tagId = this.musicTagCache.get(slug)
      if (tagId !== undefined) {
        tagIds.push(tagId)
      } else {
        this.addWarning(`Music tag "${slug}" not found in cache - run tags import first`)
      }
    }
    return tagIds
  }

  /**
   * Find a page tag by slug (case-insensitive normalized slug)
   * Tags are stored with slugs derived from titles, so we search by slug
   */
  private async findPageTagBySlug(slug: string): Promise<number | null> {
    try {
      const normalizedSlug = slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

      const result = await this.payload.find({
        collection: 'page-tags',
        where: { slug: { equals: normalizedSlug } },
        limit: 1,
      })
      return result.docs.length > 0 ? result.docs[0].id : null
    } catch {
      return null
    }
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

      const musicPageTags = this.findMusicTagsBySlug(['strings', 'flute', 'nature'])
      const inspirationPageTags = await Promise.all([
        this.findPageTagBySlug('creativity'),
        this.findPageTagBySlug('wisdom'),
        this.findPageTagBySlug('living'),
        this.findPageTagBySlug('events'),
        this.findPageTagBySlug('stories'),
      ])
      const techniquePageTag = await this.findPageTagBySlug('treatment')

      const featuredPages = pageMapping.featuredPages.filter((id) => id !== null) as number[]
      const footerPages = pageMapping.footerPages.filter((id) => id !== null) as number[]
      const inspirationTagsFiltered = inspirationPageTags.filter((id) => id !== null) as number[]

      // Validate required fields
      if (!pageMapping.homePage || featuredPages.length < 3 || !pageMapping.musicPage) {
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
          musicPage: pageMapping.musicPage,
          musicPageTags,
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
          techniquePageTag: toUndefined(techniquePageTag),
          inspirationPage: toUndefined(pageMapping.inspirationPage),
          inspirationPageTags: inspirationTagsFiltered,
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

