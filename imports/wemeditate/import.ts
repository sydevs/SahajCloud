#!/usr/bin/env tsx
/* eslint-disable no-console */

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

import type { TypedLocale } from 'payload'

import * as fs from 'fs/promises'
import * as path from 'path'

import { BaseImporter, BaseImportOptions, parseArgs, MediaUploader } from '../lib'

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

class WeMeditateImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'WeMeditate Rails Database'
  protected readonly cacheDir = CACHE_DIR

  private data!: WeMeditateData
  private mediaDownloader!: MediaDownloader
  private mediaUploader!: MediaUploader
  private defaultThumbnailId: number | string | null = null

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
    }
  }

  protected async cleanup(): Promise<void> {
    // Call parent cleanup (closes Payload connection)
    await super.cleanup()
  }

  private async loadData(): Promise<void> {
    await this.logger.info('Loading data from JSON...')

    const jsonPath = path.resolve(process.cwd(), 'imports/wemeditate/data.json')
    const jsonContent = await fs.readFile(jsonPath, 'utf-8')
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

    // Phase 1: Import metadata without content
    await this.logger.info('\n=== PHASE 1: Metadata Import ===')
    await this.importAuthors()
    await this.importAlbums()
    await this.importMusic()
    await this.importCategories()
    await this.importContentTypeTags()
    await this.importPages('static_pages', 'static_page_translations')
    await this.importPages('articles', 'article_translations')
    await this.importPages('subtle_system_nodes', 'subtle_system_node_translations')

    // Phase 2: Import content with full conversion
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
  }

  // ============================================================================
  // AUTHORS IMPORT
  // ============================================================================

  private async importAuthors(): Promise<void> {
    await this.logger.info('\n=== Importing Authors ===')

    const authors = this.data.authors

    await this.logger.info(`Found ${authors.length} authors`)
    await this.logger.progress(0, authors.length, 'Authors')

    for (let i = 0; i < authors.length; i++) {
      const author = authors[i]

      try {
        // Find English translation
        const enTranslation = author.translations.find((t: any) => t.locale === 'en' && t.name)
        if (!enTranslation) {
          this.skip(`Author ${author.id}: no English translation`)
          continue
        }

        // Generate slug from name
        const slug = enTranslation.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')

        // Upsert author by slug
        const authorResult = await this.upsert<{ id: number }>(
          'authors',
          { slug: { equals: slug } },
          {
            name: enTranslation.name,
            title: enTranslation.title || '',
            description: enTranslation.description || '',
            countryCode: author.country_code || undefined,
            yearsMeditating: author.years_meditating || undefined,
          },
          { locale: 'en' },
        )

        // Update other locales
        for (const translation of author.translations) {
          if (
            translation.locale !== 'en' &&
            translation.locale &&
            translation.name &&
            LOCALES.includes(translation.locale)
          ) {
            await this.payload.update({
              collection: 'authors',
              id: authorResult.doc.id,
              data: {
                name: translation.name,
                title: translation.title || '',
                description: translation.description || '',
              },
              locale: translation.locale,
            })
          }
        }

        this.idMaps.authors.set(author.id, authorResult.doc.id)
      } catch (error) {
        this.addError(`Importing author ${author.id}`, error as Error)
      }

      await this.logger.progress(i + 1, authors.length, 'Authors')
    }
  }

  // ============================================================================
  // ALBUMS IMPORT (from artists table)
  // ============================================================================

  private async importAlbums(): Promise<void> {
    await this.logger.info('\n=== Importing Albums (from artists table) ===')

    // Artists in WeMeditate represent music albums
    const artists = this.data.artists

    await this.logger.info(`Found ${artists.length} albums (artists)`)
    await this.logger.progress(0, artists.length, 'Albums')

    for (let i = 0; i < artists.length; i++) {
      const artist = artists[i]

      try {
        if (!artist.name) {
          this.skip(`Artist ${artist.id}: no name`)
          continue
        }

        // Check if album already exists
        const existing = await this.payload.find({
          collection: 'albums',
          where: { title: { equals: artist.name } },
          limit: 1,
        })

        if (existing.docs.length > 0) {
          // Album exists - update metadata only (can't update file on upload collections)
          await this.payload.update({
            collection: 'albums',
            id: existing.docs[0].id,
            data: {
              artist: artist.name,
              artistUrl: artist.url || undefined,
            },
            locale: 'en',
          })
          this.idMaps.albums.set(artist.id, existing.docs[0].id)
          this.report.incrementSkipped()
          await this.logger.progress(i + 1, artists.length, 'Albums')
          continue
        }

        // Download album art if available (Albums is an upload collection - file required)
        // The image field is JSONB stored as a quoted string like: "4d892b21f6.jpg"
        let localImagePath: string | null = null
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
              const downloadResult = await this.mediaDownloader.downloadAndConvertImage(albumArtUrl)
              localImagePath = downloadResult.localPath
            }
          } catch (error) {
            this.addWarning(
              `Failed to download album art for artist ${artist.id}: ${(error as Error).message}`,
            )
          }
        }

        // If no album art available, use a placeholder
        if (!localImagePath) {
          localImagePath = await this.getOrCreatePlaceholderImage()
        }

        // Create album with file (Albums is an upload collection)
        const fileBuffer = await fs.readFile(localImagePath)
        const filename = path.basename(localImagePath)
        const mimeType = this.fileUtils.getMimeType(filename)

        const albumDoc = await this.payload.create({
          collection: 'albums',
          data: {
            title: artist.name,
            artist: artist.name,
            artistUrl: artist.url || undefined,
          },
          file: {
            data: fileBuffer,
            mimetype: mimeType,
            name: filename,
            size: fileBuffer.length,
          },
          locale: 'en',
        })

        this.idMaps.albums.set(artist.id, albumDoc.id)
        this.report.incrementCreated()
      } catch (error) {
        this.addError(`Importing album (artist) ${artist.id}`, error as Error)
      }

      await this.logger.progress(i + 1, artists.length, 'Albums')
    }
  }

  /**
   * Get or create a placeholder image for albums without artwork
   */
  private async getOrCreatePlaceholderImage(): Promise<string> {
    const placeholderPath = path.join(this.cacheDir, 'placeholder-album.png')

    // Check if placeholder already exists in cache
    if (await this.fileUtils.fileExists(placeholderPath)) {
      return placeholderPath
    }

    // Copy the preview.png as placeholder
    const existingPlaceholder = path.resolve(process.cwd(), 'imports/wemeditate/preview.png')
    if (await this.fileUtils.fileExists(existingPlaceholder)) {
      await fs.copyFile(existingPlaceholder, placeholderPath)
      return placeholderPath
    }

    throw new Error(
      'No placeholder image available for album creation. Please add imports/wemeditate/preview.png',
    )
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
    await this.logger.info('\n=== Importing Music (from tracks table) ===')

    // Ensure vocals tag exists (it might not be in the tags import)
    await this.ensureVocalsTagExists()

    // Use pre-extracted tracks data
    const tracks = this.data.tracks

    await this.logger.info(`Found ${tracks.length} music tracks`)
    await this.logger.progress(0, tracks.length, 'Music tracks')

    for (let i = 0; i < tracks.length; i++) {
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
        let albumId: number | string | undefined
        if (track.artist_ids && track.artist_ids.length > 0) {
          const firstArtistId = track.artist_ids[0]
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
              const musicTagIds = await this.findMusicTagsBySlug([tagSlug])
              tagIds.push(...musicTagIds)
            }
          }
        }

        // Check if music already exists by title
        const existing = await this.payload.find({
          collection: 'music',
          where: { title: { equals: track.title } },
          limit: 1,
          locale: 'en',
        })

        // Convert album ID to number for Payload type compatibility
        const numericAlbumId = typeof albumId === 'string' ? parseInt(albumId, 10) : albumId

        if (existing.docs.length > 0) {
          // Update existing music with album and tags
          await this.payload.update({
            collection: 'music',
            id: existing.docs[0].id,
            data: {
              album: numericAlbumId,
              tags: tagIds.length > 0 ? tagIds : undefined,
            },
            locale: 'en',
          })
          this.report.incrementUpdated()
          await this.logger.progress(i + 1, tracks.length, 'Music tracks')
          continue
        }

        // Download audio file
        const audioUrl = `${STORAGE_BASE_URL}track/${track.id}/${track.audio}?version=`
        let localAudioPath: string | null = null

        try {
          const cacheFilename = `track-${track.id}-${track.audio}`
          const cachePath = path.join(this.cacheDir, 'audio', cacheFilename)

          // Check cache first
          if (await this.fileUtils.fileExists(cachePath)) {
            localAudioPath = cachePath
          } else {
            // Download audio
            await fs.mkdir(path.dirname(cachePath), { recursive: true })
            const response = await fetch(audioUrl)
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }
            const arrayBuffer = await response.arrayBuffer()
            await fs.writeFile(cachePath, Buffer.from(arrayBuffer))
            localAudioPath = cachePath
          }
        } catch (error) {
          this.addError(`Downloading audio for track ${track.id}: ${audioUrl}`, error as Error)
          continue
        }

        // Create music with audio file
        const fileBuffer = await fs.readFile(localAudioPath)
        const filename = track.audio
        const mimeType = this.fileUtils.getMimeType(filename)

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
      } catch (error) {
        this.addError(`Importing track ${track.id}`, error as Error)
      }

      await this.logger.progress(i + 1, tracks.length, 'Music tracks')
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

      // Use the generic music-tag.svg from imports/tags/
      const svgPath = path.resolve(process.cwd(), 'imports/tags/music-tag.svg')
      const svgBuffer = await fs.readFile(svgPath)

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
          enTranslation.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')

        // Upsert page tag by slug
        const tagResult = await this.upsert<{ id: number }>(
          'page-tags',
          { slug: { equals: slug } },
          { title: enTranslation.name },
          { locale: 'en' },
        )

        // Update other locales
        for (const translation of category.translations) {
          if (translation.locale !== 'en' && translation.locale && translation.name) {
            await this.payload.update({
              collection: 'page-tags',
              id: tagResult.doc.id,
              data: { title: translation.name },
              locale: translation.locale as TypedLocale,
            })
          }
        }

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
    await this.logger.info(`\n=== Importing ${tableName} ===`)

    // Map table names to pre-extracted data arrays
    const dataMap: Record<string, typeof this.data.staticPages | typeof this.data.articles> = {
      static_pages: this.data.staticPages,
      articles: this.data.articles,
      subtle_system_nodes: this.data.subtleSystemNodes,
      treatments: this.data.treatments,
    }

    const pages = dataMap[tableName] || []

    await this.logger.info(`Found ${pages.length} pages from ${tableName}`)
    await this.logger.progress(0, pages.length, tableName)

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i] as any // Use any for dynamic table access

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
            this.skip(`Treatment ${page.id} "${enTranslation.name}" has no thumbnail`)
            continue
          }
        }

        // Generate slug
        const slug =
          enTranslation.slug?.trim() ||
          enTranslation.name
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

        // Upsert page by slug
        const pageResult = await this.upsert<{ id: number }>(
          'pages',
          { slug: { equals: slug } },
          {
            title: enTranslation.name,
            slug,
            publishAt: enTranslation.published_at || undefined,
            author: authorId,
            tags: tags.length > 0 ? tags : undefined,
          },
          { locale: 'en' },
        )

        // Update other locales
        for (const translation of page.translations) {
          if (
            translation.locale !== 'en' &&
            translation.locale &&
            translation.name &&
            LOCALES.includes(translation.locale)
          ) {
            await this.payload.update({
              collection: 'pages',
              id: pageResult.doc.id,
              data: {
                title: translation.name,
                publishAt: translation.published_at || undefined,
              },
              locale: translation.locale,
            })
          }
        }

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

      await this.logger.progress(i + 1, pages.length, tableName)
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

    await this.logger.info(`Found ${mediaUrls.size} unique media files`)
    await this.logger.progress(0, mediaUrls.size, 'Media files')

    let count = 0
    for (const url of Array.from(mediaUrls)) {
      try {
        const downloadResult = await this.mediaDownloader.downloadAndConvertImage(url)
        const metadata = mediaMetadata.get(url) || { alt: '', credit: '' }
        const filename = path.basename(
          downloadResult.localPath,
          path.extname(downloadResult.localPath),
        )

        const result = await this.mediaUploader.uploadWithDeduplication(downloadResult.localPath, {
          alt: metadata.alt || filename,
          credit: metadata.credit || '',
        })

        if (result) {
          this.idMaps.media.set(url, result.id)
        }
      } catch (error) {
        this.addError(`Importing media ${url}`, error as Error)
      }

      count++
      await this.logger.progress(count, mediaUrls.size, 'Media files')
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

          const existingPage = await this.payload.findByID({
            collection: 'pages',
            id: pageId,
            locale: translation.locale as TypedLocale,
          })

          await this.payload.update({
            collection: 'pages',
            id: pageId,
            data: {
              title: existingPage.title,
              content: lexicalContent as any,
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

    const previewPath = path.join(__dirname, 'preview.png')
    const result = await this.mediaUploader.uploadWithDeduplication(previewPath, {
      alt: 'Video preview placeholder',
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
        const uploadResult = await this.mediaUploader.uploadWithDeduplication(
          downloadResult.localPath,
          { alt: `Video thumbnail for ${videoId}` },
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

  private async findMusicTagsBySlug(tagSlugs: string[]): Promise<number[]> {
    const tagIds: number[] = []
    for (const slug of tagSlugs) {
      try {
        // Music tags are created by the tags import script with SVG icons
        // We only look up existing tags here
        const result = await this.payload.find({
          collection: 'music-tags',
          where: { slug: { equals: slug } },
          limit: 1,
        })
        if (result.docs.length > 0) {
          tagIds.push(result.docs[0].id)
        } else {
          this.addWarning(`Music tag "${slug}" not found - run tags import first`)
        }
      } catch (error) {
        this.addError(`Finding music tag ${slug}`, error as Error)
      }
    }
    return tagIds
  }

  private async findPageTagByName(tagName: string): Promise<number | null> {
    try {
      const result = await this.payload.find({
        collection: 'page-tags',
        where: { title: { equals: tagName } },
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

      const musicPageTags = await this.findMusicTagsBySlug(['strings', 'flute', 'nature'])
      const inspirationPageTags = await Promise.all([
        this.findPageTagByName('creativity'),
        this.findPageTagByName('wisdom'),
        this.findPageTagByName('living'),
        this.findPageTagByName('events'),
        this.findPageTagByName('stories'),
      ])
      const techniquePageTag = await this.findPageTagByName('treatment')

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

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  // Check if data.json exists
  const dataJsonPath = path.resolve(process.cwd(), 'imports/wemeditate/data.json')
  try {
    await fs.access(dataJsonPath)
  } catch {
    console.error(`Error: Data file not found at ${dataJsonPath}`)
    console.error('Run the extraction script first: pnpm tsx imports/extract-to-json.ts')
    process.exit(1)
  }

  const options = parseArgs()
  const importer = new WeMeditateImporter(options)
  await importer.run()
  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
