#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * WeMeditate Rails Database Import Script
 *
 * Imports content from the Rails-based WeMeditate PostgreSQL database into Payload CMS.
 *
 * Features:
 * - Two-phase import (metadata first, content second)
 * - Idempotent: safely re-runnable (updates existing, creates new)
 * - Uses slug as natural key for pages, authors, and page-tags
 * - Uses videoUrl as natural key for external videos
 *
 * DUAL-DATABASE ARCHITECTURE:
 * - PostgreSQL (SOURCE - temporary, read-only): Rails database dump
 * - SQLite/D1 (TARGET - Payload CMS): Where imported content is written
 *
 * Usage:
 *   pnpm import wemeditate [flags]
 *
 * Flags:
 *   --dry-run      Validate data without writing to database
 *   --clear-cache  Clear download cache before import
 */

import type { TypedLocale } from 'payload'

import { execSync } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'

import { Client } from 'pg'

import { BaseImporter, BaseImportOptions, parseArgs, MediaUploader } from '../lib'
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
const DATA_BIN = path.resolve(process.cwd(), 'imports/wemeditate/data.bin')
const STORAGE_BASE_URL = 'https://assets.wemeditate.com/uploads/'
const DB_NAME = 'temp_wemeditate_import'

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

  private dbClient!: Client
  private mediaDownloader!: MediaDownloader
  private mediaUploader!: MediaUploader
  private defaultThumbnailId: number | string | null = null

  // In-memory maps for Phase 2 content conversion (old ID → Payload ID)
  // These are populated during Phase 1 and used during Phase 2
  private idMaps = {
    authors: new Map<number, number | string>(),
    categories: new Map<number, number | string>(),
    staticPages: new Map<number, number | string>(),
    articles: new Map<number, number | string>(),
    promoPages: new Map<number, number | string>(),
    subtleSystemNodes: new Map<number, number | string>(),
    treatments: new Map<number, number | string>(),
    media: new Map<string, number | string>(),
    forms: new Map<string, number | string>(),
    externalVideos: new Map<string, number | string>(),
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
    // Setup PostgreSQL database (for reading source data)
    await this.setupDatabase()

    // Initialize media tools (skip for dry run)
    if (!this.options.dryRun) {
      this.mediaDownloader = new MediaDownloader(this.cacheDir, this.logger)
      await this.mediaDownloader.initialize()
      this.mediaUploader = new MediaUploader(this.payload, this.logger)
    }
  }

  protected async cleanup(): Promise<void> {
    // Cleanup PostgreSQL database
    await this.cleanupDatabase()

    // Call parent cleanup (closes Payload connection)
    await super.cleanup()
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
    await this.importExternalVideos()
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
  // DATABASE MANAGEMENT (PostgreSQL - Source)
  // ============================================================================

  private async setupDatabase(): Promise<void> {
    await this.logger.info('\n=== Setting up PostgreSQL Database ===')

    // Drop existing database if it exists
    try {
      execSync(`dropdb ${DB_NAME} 2>/dev/null || true`, { stdio: 'ignore' })
    } catch {
      // Ignore errors
    }

    // Create new database
    execSync(`createdb ${DB_NAME}`)
    await this.logger.info(`✓ Created database: ${DB_NAME}`)

    // Restore from backup
    execSync(`pg_restore -d ${DB_NAME} --no-owner ${DATA_BIN} 2>/dev/null || true`, {
      stdio: 'ignore',
    })
    await this.logger.info(`✓ Restored data from: ${DATA_BIN}`)

    // Connect to database
    this.dbClient = new Client({ database: DB_NAME })
    await this.dbClient.connect()
    await this.logger.info('✓ Connected to database')
  }

  private async cleanupDatabase(): Promise<void> {
    if (this.dbClient) {
      await this.dbClient.end()
      await this.logger.info('✓ Disconnected from PostgreSQL')
    }

    try {
      execSync(`dropdb ${DB_NAME} 2>/dev/null || true`, { stdio: 'ignore' })
      await this.logger.info(`✓ Dropped database: ${DB_NAME}`)
    } catch {
      // Ignore errors
    }
  }

  // ============================================================================
  // AUTHORS IMPORT
  // ============================================================================

  private async importAuthors(): Promise<void> {
    await this.logger.info('\n=== Importing Authors ===')

    const result = await this.dbClient.query(`
      SELECT
        a.id,
        a.country_code,
        a.years_meditating,
        json_agg(
          json_build_object(
            'locale', at.locale,
            'name', at.name,
            'title', at.title,
            'description', at.description
          )
        ) as translations
      FROM authors a
      LEFT JOIN author_translations at ON a.id = at.author_id
      GROUP BY a.id, a.country_code, a.years_meditating
    `)

    await this.logger.info(`Found ${result.rows.length} authors`)
    await this.logger.progress(0, result.rows.length, 'Authors')

    for (let i = 0; i < result.rows.length; i++) {
      const author = result.rows[i]

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

      await this.logger.progress(i + 1, result.rows.length, 'Authors')
    }
  }

  // ============================================================================
  // CATEGORIES IMPORT (as Page Tags)
  // ============================================================================

  private async importCategories(): Promise<void> {
    await this.logger.info('\n=== Importing Categories as Page Tags ===')

    const result = await this.dbClient.query(`
      SELECT
        c.id,
        json_agg(
          json_build_object(
            'locale', ct.locale,
            'name', ct.name,
            'slug', ct.slug
          )
        ) as translations
      FROM categories c
      LEFT JOIN category_translations ct ON c.id = ct.category_id
      GROUP BY c.id
    `)

    await this.logger.info(`Found ${result.rows.length} categories`)

    for (const category of result.rows) {
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

  private async importPages(tableName: string, translationsTable: string): Promise<void> {
    await this.logger.info(`\n=== Importing ${tableName} ===`)

    const isArticles = tableName === 'articles'
    const selectFields = ['p.id']
    const groupByFields = ['p.id']

    if (isArticles) {
      selectFields.push('p.author_id', 'p.article_type', 'p.category_id')
      groupByFields.push('p.author_id', 'p.article_type', 'p.category_id')
    }

    const result = await this.dbClient.query(`
      SELECT
        ${selectFields.join(', ')},
        json_agg(
          json_build_object(
            'locale', pt.locale,
            'name', pt.name,
            'slug', pt.slug,
            'content', pt.content,
            'published_at', pt.published_at,
            'state', pt.state
          ) ORDER BY pt.locale
        ) as translations
      FROM ${tableName} p
      LEFT JOIN ${translationsTable} pt ON p.id = pt.${tableName.slice(0, -1)}_id
      GROUP BY ${groupByFields.join(', ')}
    `)

    await this.logger.info(`Found ${result.rows.length} pages from ${tableName}`)
    await this.logger.progress(0, result.rows.length, tableName)

    for (let i = 0; i < result.rows.length; i++) {
      const page = result.rows[i]

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

      await this.logger.progress(i + 1, result.rows.length, tableName)
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

    // Scan all page content for media URLs
    for (const [_tableName, translationsTable] of [
      ['static_pages', 'static_page_translations'],
      ['articles', 'article_translations'],
      ['subtle_system_nodes', 'subtle_system_node_translations'],
      ['treatments', 'treatment_translations'],
    ]) {
      const result = await this.dbClient.query(`
        SELECT content, locale
        FROM ${translationsTable}
        WHERE content IS NOT NULL
      `)

      for (const row of result.rows) {
        if (!row.content) continue
        let content
        try {
          content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content
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

    // Also scan author images
    const authorsResult = await this.dbClient.query(`
      SELECT id, image FROM authors WHERE image IS NOT NULL
    `)
    for (const author of authorsResult.rows) {
      const imageUrl = extractAuthorImageUrl(author.image, STORAGE_BASE_URL)
      if (imageUrl) {
        mediaUrls.add(imageUrl)
        mediaMetadata.set(imageUrl, { alt: 'Author profile image', credit: '' })
      }
    }

    // Scan treatment thumbnails
    const treatmentResult = await this.dbClient.query(`
      SELECT
        t.id as treatment_id,
        tt.name as treatment_name,
        tt.thumbnail_id,
        mf.id as media_file_id,
        mf.file as thumbnail_file
      FROM treatments t
      LEFT JOIN treatment_translations tt ON t.id = tt.treatment_id
      LEFT JOIN media_files mf ON tt.thumbnail_id = mf.id
      WHERE tt.locale = 'en' AND tt.thumbnail_id IS NOT NULL AND mf.file IS NOT NULL
    `)
    for (const treatment of treatmentResult.rows) {
      const thumbnailUrl = `${STORAGE_BASE_URL}media_file/file/${treatment.media_file_id}/${treatment.thumbnail_file}`
      mediaUrls.add(thumbnailUrl)
      mediaMetadata.set(thumbnailUrl, {
        alt: `Thumbnail for ${treatment.treatment_name}`,
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
  // EXTERNAL VIDEOS IMPORT
  // ============================================================================

  private async importExternalVideos(): Promise<void> {
    await this.logger.info('\n=== Importing External Videos ===')

    const videoIds = new Set<string>()
    const videoMetadata = new Map<
      string,
      { title: string; thumbnail: string; vimeoId?: string; youtubeId?: string }
    >()

    // Scan content for video IDs
    for (const [_tableName, translationsTable] of [
      ['static_pages', 'static_page_translations'],
      ['articles', 'article_translations'],
      ['subtle_system_nodes', 'subtle_system_node_translations'],
      ['treatments', 'treatment_translations'],
    ]) {
      const result = await this.dbClient.query(`
        SELECT content FROM ${translationsTable} WHERE content IS NOT NULL
      `)

      for (const row of result.rows) {
        if (!row.content?.blocks) continue
        for (const block of row.content.blocks) {
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

    await this.logger.info(`Found ${videoIds.size} unique external videos`)

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
          'external-videos',
          { videoUrl: { equals: videoUrl } },
          {
            title: metadata.title || `Video ${videoId}`,
            videoUrl,
            thumbnail: thumbnailId,
          },
        )

        this.idMaps.externalVideos.set(videoId, result.doc.id)
      } catch (error) {
        this.addError(`Creating external video ${videoId}`, error as Error)
      }
    }
  }

  // ============================================================================
  // PAGES WITH CONTENT (Phase 2)
  // ============================================================================

  private async importPagesWithContent(
    tableName: string,
    translationsTable: string,
  ): Promise<void> {
    await this.logger.info(`\n=== Updating ${tableName} with Content ===`)

    const result = await this.dbClient.query(`
      SELECT
        p.id,
        (SELECT pt_en.name FROM ${translationsTable} pt_en
         WHERE pt_en.${tableName.slice(0, -1)}_id = p.id AND pt_en.locale = 'en' LIMIT 1) as title,
        json_agg(
          json_build_object(
            'locale', pt.locale,
            'content', pt.content
          ) ORDER BY pt.locale
        ) as translations
      FROM ${tableName} p
      LEFT JOIN ${translationsTable} pt ON p.id = pt.${tableName.slice(0, -1)}_id
      WHERE pt.content IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM ${translationsTable} pt_en
          WHERE pt_en.${tableName.slice(0, -1)}_id = p.id AND pt_en.locale = 'en'
        )
      GROUP BY p.id
    `)

    await this.logger.info(`Updating ${result.rows.length} pages with content`)

    const mapKeyMap: Record<string, keyof typeof this.idMaps> = {
      static_pages: 'staticPages',
      articles: 'articles',
      subtle_system_nodes: 'subtleSystemNodes',
      treatments: 'treatments',
    }
    const mapKey = mapKeyMap[tableName]
    const pageIdMap = this.idMaps[mapKey] as Map<number, number>

    for (const page of result.rows) {
      const numericId = typeof page.id === 'string' ? parseInt(page.id) : page.id
      const pageId = pageIdMap.get(numericId)
      if (!pageId) {
        this.addWarning(`Page ${page.id} from ${tableName} not in ID map`)
        continue
      }

      try {
        for (const translation of page.translations) {
          if (!translation.locale || !translation.content) continue
          if (!LOCALES.includes(translation.locale)) continue

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
            pageTitle: page.title || 'Unknown',
            locale: translation.locale,
            mediaMap: this.idMaps.media,
            formMap: this.idMaps.forms,
            externalVideoMap: this.idMaps.externalVideos,
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

      const result = await this.dbClient.query(`
        SELECT m.id, mt.name
        FROM meditations m
        LEFT JOIN meditation_translations mt ON m.id = mt.meditation_id
        WHERE mt.locale = 'en'
      `)

      for (const row of result.rows) {
        if (row.name) {
          const titleWithoutDuration = row.name.split('|')[0].trim().toLowerCase()
          this.meditationRailsTitleMap.set(Number(row.id), titleWithoutDuration)
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
      const result = await this.dbClient.query(`
        SELECT
          t.id as treatment_id,
          tt.name as treatment_name,
          tt.thumbnail_id,
          mf.id as media_file_id,
          mf.file as thumbnail_file
        FROM treatments t
        LEFT JOIN treatment_translations tt ON t.id = tt.treatment_id
        LEFT JOIN media_files mf ON tt.thumbnail_id = mf.id
        WHERE tt.locale = 'en'
      `)

      for (const row of result.rows) {
        const treatmentId = Number(row.treatment_id)
        if (!row.thumbnail_id || !row.thumbnail_file) {
          this.addWarning(`Treatment ${treatmentId} "${row.treatment_name}" has no thumbnail`)
          continue
        }

        const thumbnailUrl = `${STORAGE_BASE_URL}media_file/file/${row.media_file_id}/${row.thumbnail_file}`
        const mediaId = this.idMaps.media.get(thumbnailUrl)
        if (mediaId) {
          this.treatmentThumbnailMap.set(treatmentId, mediaId)
        } else {
          this.addWarning(`Thumbnail for treatment ${treatmentId} not found in media map`)
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
  // Check if data.bin exists
  try {
    await fs.access(DATA_BIN)
  } catch {
    console.error(`Error: Data file not found at ${DATA_BIN}`)
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
