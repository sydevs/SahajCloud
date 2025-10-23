#!/usr/bin/env tsx

import 'dotenv/config'
import { CollectionSlug, getPayload, Payload } from 'payload'
import configPromise from '../../src/payload.config'
import { execSync } from 'child_process'
import { Client } from 'pg'
import { promises as fs } from 'fs'
import * as path from 'path'
import { Logger, FileUtils, TagManager, PayloadHelpers, MediaUploader } from '../lib'
import { MediaDownloader, extractMediaUrls, extractAuthorImageUrl } from '../lib/mediaDownloader'
import {
  convertEditorJSToLexical,
  type ConversionContext,
  type EditorJSContent,
} from '../lib/lexicalConverter'

// ============================================================================
// CONFIGURATION
// ============================================================================

const IMPORT_TAG = 'import-wemeditate'
const CACHE_DIR = path.resolve(process.cwd(), 'migration/cache/wemeditate')
const DATA_BIN = path.resolve(process.cwd(), 'migration/wemeditate/data.bin')

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
const DB_NAME = 'temp_wemeditate_import'

// ============================================================================
// TYPES
// ============================================================================

interface ScriptOptions {
  dryRun: boolean
  reset: boolean
  clearCache?: boolean
}

interface IdMaps {
  authors: Map<number, string>
  categories: Map<number, string>
  staticPages: Map<number, string>
  articles: Map<number, string>
  promoPages: Map<number, string>
  subtleSystemNodes: Map<number, string>
  treatments: Map<number, string>
  media: Map<string, string>
  forms: Map<string, string>
  externalVideos: Map<string, string>
}

interface ImportSummary {
  authorsCreated: number
  categoriesCreated: number
  pagesCreated: number
  mediaCreated: number
  externalVideosCreated: number
  formsCreated: number
  errors: string[]
  warnings: string[]
}

// ============================================================================
// MAIN IMPORTER CLASS
// ============================================================================

class WeMeditateImporter {
  private payload!: Payload
  private logger!: Logger
  private fileUtils!: FileUtils
  private tagManager!: TagManager
  private payloadHelpers!: PayloadHelpers
  private mediaDownloader!: MediaDownloader
  private mediaUploader!: MediaUploader
  private defaultThumbnailId: string | null = null

  private dbClient!: Client
  private options: ScriptOptions
  private idMaps: IdMaps = {
    authors: new Map(),
    categories: new Map(),
    staticPages: new Map(),
    articles: new Map(),
    promoPages: new Map(),
    subtleSystemNodes: new Map(),
    treatments: new Map(),
    media: new Map(),
    forms: new Map(),
    externalVideos: new Map(),
  }
  private meditationTitleMap: Map<string, string> = new Map() // Payload title → Payload ID
  private meditationRailsTitleMap: Map<number, string> = new Map() // Rails ID → title (no duration)
  private contentTypeTagMap: Map<string, string> = new Map()

  // Summary tracking
  private summary: ImportSummary = {
    authorsCreated: 0,
    categoriesCreated: 0,
    pagesCreated: 0,
    mediaCreated: 0,
    externalVideosCreated: 0,
    formsCreated: 0,
    errors: [],
    warnings: [],
  }

  constructor(options: ScriptOptions) {
    this.options = options
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  private addError(context: string, error: Error | string) {
    const message = error instanceof Error ? error.message : error
    const fullMessage = `${context}: ${message}`
    this.summary.errors.push(fullMessage)
    this.logger.error(fullMessage)
  }

  private addWarning(message: string) {
    this.summary.warnings.push(message)
    // Note: Do NOT call logger.warn() here to avoid infinite loop
    // The logger already calls this method via the callback
  }

  // ============================================================================
  // DATABASE MANAGEMENT
  // ============================================================================

  private async setupDatabase() {
    await this.logger.log('\n=== Setting up PostgreSQL Database ===')

    // Drop existing database if it exists
    try {
      execSync(`dropdb ${DB_NAME} 2>/dev/null || true`, { stdio: 'ignore' })
    } catch {
      // Ignore errors
    }

    // Create new database
    execSync(`createdb ${DB_NAME}`)
    await this.logger.log(`✓ Created database: ${DB_NAME}`)

    // Restore from backup
    execSync(`pg_restore -d ${DB_NAME} --no-owner ${DATA_BIN} 2>/dev/null || true`, {
      stdio: 'ignore',
    })
    await this.logger.log(`✓ Restored data from: ${DATA_BIN}`)

    // Connect to database
    this.dbClient = new Client({
      database: DB_NAME,
    })
    await this.dbClient.connect()
    await this.logger.log(`✓ Connected to database`)
  }

  private async cleanupDatabase() {
    if (this.dbClient) {
      await this.dbClient.end()
      await this.logger.log('✓ Disconnected from database')
    }

    try {
      execSync(`dropdb ${DB_NAME} 2>/dev/null || true`, { stdio: 'ignore' })
      await this.logger.log(`✓ Dropped database: ${DB_NAME}`)
    } catch {
      // Ignore errors
    }
  }

  // ============================================================================
  // RESET FUNCTIONALITY
  // ============================================================================

  private async resetCollections() {
    await this.logger.log('\n=== Resetting Collections ===')

    // Collections with 'tags' relationship field
    const taggedCollections: Array<{ collection: CollectionSlug; tagField: string }> = [
      { collection: 'authors', tagField: 'tags' },
      { collection: 'pages', tagField: 'tags' },
      { collection: 'page-tags', tagField: 'tags' },
      { collection: 'media', tagField: 'tags' },
      { collection: 'external-videos', tagField: 'tags' },
    ]

    // First, get the import tag ID
    let importTagId: string | null = null
    try {
      const importTags = await this.payload.find({
        collection: 'media-tags',
        where: { slug: { equals: IMPORT_TAG } },
        limit: 1,
      })
      if (importTags.docs.length > 0) {
        importTagId = String(importTags.docs[0].id)
      }
    } catch (_error) {
      await this.logger.warn('Could not find import tag, skipping tagged collections reset')
    }

    // Reset tagged collections
    if (importTagId) {
      for (const { collection, tagField } of taggedCollections) {
        try {
          const deletedCount = await this.payloadHelpers.resetCollectionByTag(
            collection,
            tagField,
            importTagId,
          )
          if (deletedCount > 0) {
            await this.logger.log(`✓ Deleted ${deletedCount} documents from ${collection}`)
          } else {
            await this.logger.log(`✓ No documents with import tag in ${collection}`)
          }
        } catch (error) {
          await this.logger.warn(
            `Could not reset ${collection}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    // Reset form submissions (no tags field, delete all)
    try {
      const deletedCount = await this.payloadHelpers.resetCollection('pages')
      if (deletedCount > 0) {
        await this.logger.log(`✓ Deleted ${deletedCount} pages`)
      }
    } catch (_error) {
      await this.logger.warn('Could not reset pages')
    }

    // Reset form submissions (no tags field, delete all)
    try {
      const deletedCount = await this.payloadHelpers.resetCollection('form-submissions')
      if (deletedCount > 0) {
        await this.logger.log(`✓ Deleted ${deletedCount} form submissions`)
      }
    } catch (_error) {
      await this.logger.warn('Could not reset form submissions')
    }

    // Reset forms (no tags field, delete all)
    try {
      const deletedCount = await this.payloadHelpers.resetCollection('forms')
      if (deletedCount > 0) {
        await this.logger.log(`✓ Deleted ${deletedCount} forms`)
      }
    } catch (_error) {
      await this.logger.warn('Could not reset forms')
    }

    await this.logger.log('✓ Reset complete')
  }

  // ============================================================================
  // IMPORT METHODS
  // ============================================================================

  private async importAuthors() {
    await this.logger.log('\n=== Importing Authors ===')

    // Get authors with their translations
    const authorsResult = await this.dbClient.query(`
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

    await this.logger.log(`Found ${authorsResult.rows.length} authors to import`)

    for (const author of authorsResult.rows) {
      try {
        // Build localized data - only include supported locales
        const localizedData: any = {}

        // First pass: check if English translation exists
        let hasEnglish = false
        for (const translation of author.translations) {
          if (translation.locale === 'en' && translation.name) {
            hasEnglish = true
            localizedData['en'] = {
              name: translation.name,
              title: translation.title || '',
              description: translation.description || '',
            }
            break
          }
        }

        // Skip if no English translation
        if (!hasEnglish) {
          await this.logger.log(`Skipping author ${author.id}: no English (en) translation`)
          continue
        }

        // Second pass: add other translations
        for (const translation of author.translations) {
          if (
            translation.locale !== 'en' &&
            translation.locale &&
            translation.name &&
            LOCALES.includes(translation.locale)
          ) {
            localizedData[translation.locale] = {
              name: translation.name,
              title: translation.title || '',
              description: translation.description || '',
            }
          }
        }

        // Always use English as first locale, then add other locales
        const otherLocales = Object.keys(localizedData).filter((locale) => locale !== 'en')

        const authorDoc = await this.payload.create({
          collection: 'authors',
          data: {
            name: localizedData['en'].name,
            title: localizedData['en'].title,
            description: localizedData['en'].description,
            countryCode: author.country_code || undefined,
            yearsMeditating: author.years_meditating || undefined,
          },
          locale: 'en',
        })

        // Update with other locales
        for (const locale of otherLocales) {
          await this.payload.update({
            collection: 'authors',
            id: authorDoc.id,
            data: {
              name: localizedData[locale].name,
              title: localizedData[locale].title,
              description: localizedData[locale].description,
            },
            locale: locale as (typeof LOCALES)[number],
          })
        }

        this.idMaps.authors.set(author.id, authorDoc.id as string)
        this.summary.authorsCreated++
        await this.logger.log(
          `✓ Created author: ${author.id} -> ${authorDoc.id} (${1 + otherLocales.length} locales)`,
        )
      } catch (error: any) {
        this.addError(`Failed to import author ${author.id}`, error)
      }
    }
  }

  private async importCategories() {
    await this.logger.log('\n=== Importing Categories as Page Tags ===')

    const categoriesResult = await this.dbClient.query(`
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

    await this.logger.log(`Found ${categoriesResult.rows.length} categories to import`)

    for (const category of categoriesResult.rows) {
      try {
        // Build localized data
        const localizedData: any = {}

        // First pass: check if English translation exists
        let hasEnglish = false
        for (const translation of category.translations) {
          if (translation.locale === 'en' && translation.name) {
            hasEnglish = true
            localizedData['en'] = {
              title: translation.name,
              name: translation.slug || translation.name.toLowerCase(),
            }
            break
          }
        }

        // Skip if no English translation
        if (!hasEnglish) {
          await this.logger.log(`Skipping category ${category.id}: no English (en) translation`)
          continue
        }

        // Second pass: add other translations
        for (const translation of category.translations) {
          if (translation.locale !== 'en' && translation.locale && translation.name) {
            localizedData[translation.locale] = {
              title: translation.name,
              name: translation.slug || translation.name.toLowerCase(),
            }
          }
        }

        // Always use English as first locale
        const otherLocales = Object.keys(localizedData).filter((locale) => locale !== 'en')

        // Create page tag with English locale
        const tagDoc = await this.payload.create({
          collection: 'page-tags',
          data: {
            name: localizedData['en'].name,
            title: localizedData['en'].title,
          },
          locale: 'en',
        })

        // Update with other locales
        for (const locale of otherLocales) {
          await this.payload.update({
            collection: 'page-tags',
            id: tagDoc.id,
            data: {
              title: localizedData[locale].title,
            },
            locale: locale as (typeof LOCALES)[number],
          })
        }

        this.idMaps.categories.set(category.id, tagDoc.id as string)
        this.summary.categoriesCreated++
        await this.logger.log(
          `✓ Created category tag: ${category.id} -> ${tagDoc.id} (${1 + otherLocales.length} locales)`,
        )
      } catch (error: any) {
        this.addError(`Failed to import category ${category.id}`, error)
      }
    }
  }

  private async importContentTypeTags() {
    await this.logger.log('\n=== Creating Content Type Tags ===')

    for (const [sourceType, tagName] of Object.entries(CONTENT_TYPE_TAGS)) {
      try {
        const tagDoc = await this.payload.create({
          collection: 'page-tags',
          data: {
            name: tagName,
            title: tagName,
          },
        })

        this.contentTypeTagMap.set(`content-type-tag-${tagName}`, tagDoc.id as string)
        await this.logger.log(`✓ Created content type tag: ${tagName}`)
      } catch (error: any) {
        // Tag might already exist
        const existing = await this.payload.find({
          collection: 'page-tags',
          where: { name: { equals: tagName } },
        })
        if (existing.docs.length > 0) {
        }
      }
    }
  }

  private async importPages(tableName: string, translationsTable: string) {
    await this.logger.log(`\n=== Importing ${tableName} ===`)

    // Build SQL query based on table type - only articles has these extra fields
    const isArticles = tableName === 'articles'
    const selectFields = ['p.id']
    const groupByFields = ['p.id']

    if (isArticles) {
      selectFields.push('p.author_id', 'p.article_type', 'p.category_id')
      groupByFields.push('p.author_id', 'p.article_type', 'p.category_id')
    }

    const pagesResult = await this.dbClient.query(`
      SELECT
        ${selectFields.join(',\n        ')},
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

    await this.logger.log(`Found ${pagesResult.rows.length} pages to import from ${tableName}`)

    for (const page of pagesResult.rows) {
      // Build localized data (outside try block for error reporting)
      const localizedData: any = {}

      // First pass: check if English translation exists
      let hasEnglish = false
      for (const translation of page.translations) {
        if (translation.locale === 'en' && translation.name) {
          hasEnglish = true
          const slug = translation.slug?.trim()
          localizedData['en'] = {
            title: translation.name,
            slug: slug && slug.length > 0 ? slug : undefined,
            content: translation.content,
            publishAt: translation.published_at,
          }
          break
        }
      }

      // Skip if no English translation
      if (!hasEnglish) {
        await this.logger.log(`Skipping ${tableName} ${page.id}: no English (en) translation`)
        continue
      }

      // Second pass: add other translations
      for (const translation of page.translations) {
        if (translation.locale !== 'en' && translation.locale && translation.name) {
          const slug = translation.slug?.trim()
          localizedData[translation.locale] = {
            title: translation.name,
            slug: slug && slug.length > 0 ? slug : undefined,
            content: translation.content,
            publishAt: translation.published_at,
          }
        }
      }

      try {
        // Get author relationship
        let authorId: string | undefined
        if (page.author_id && this.idMaps.authors.has(page.author_id)) {
          authorId = this.idMaps.authors.get(page.author_id)
        }

        // Get tags
        const tags: string[] = []

        // Add content type tag
        const contentTypeTag = CONTENT_TYPE_TAGS[tableName]
        if (contentTypeTag) {
          const tagId = this.contentTypeTagMap.get(`content-type-tag-${contentTypeTag}`)
          if (tagId) {
            tags.push(tagId)
          }
        }

        // Add article type tag
        if (page.article_type !== undefined && ARTICLE_TYPE_TAGS[page.article_type]) {
          const articleTypeTag = ARTICLE_TYPE_TAGS[page.article_type]
          const articleTypeTagKey = `content-type-tag-${articleTypeTag}`
          const tagId = this.contentTypeTagMap.get(articleTypeTagKey)
          if (tagId) {
            tags.push(tagId)
          }
        }

        // Add category tag
        if (page.category_id && this.idMaps.categories.has(page.category_id)) {
          tags.push(this.idMaps.categories.get(page.category_id)!)
        }

        // Always use English as the first locale, then add other locales
        const firstLocale = 'en'
        const otherLocales = Object.keys(localizedData).filter((locale) => locale !== 'en')

        let pageDoc
        try {
          pageDoc = await this.payload.create({
            collection: 'pages',
            data: {
              title: localizedData[firstLocale].title,
              slug: localizedData[firstLocale].slug, // Already cleaned above
              publishAt: localizedData[firstLocale].publishAt || undefined,
              author: authorId,
              tags: tags.length > 0 ? tags : undefined,
            },
            locale: firstLocale,
          })
        } catch (slugError: any) {
          // If slug validation fails (duplicate), retry without slug to auto-generate
          if (slugError.message && slugError.message.includes('slug')) {
            await this.logger.log(`  Slug conflict for ${tableName} ${page.id}, auto-generating...`)
            // Omit the slug field entirely to let SlugField auto-generate
            const retryData: any = {
              title: localizedData[firstLocale].title,
              publishAt: localizedData[firstLocale].publishAt || undefined,
              author: authorId,
              tags: tags.length > 0 ? tags : undefined,
            }
            // Do NOT include slug property at all
            pageDoc = await this.payload.create({
              collection: 'pages',
              data: retryData,
              locale: firstLocale,
            })
          } else {
            throw slugError
          }
        }

        // Update with other locales (all except English which was already created)
        for (const locale of otherLocales) {
          await this.payload.update({
            collection: 'pages',
            id: pageDoc.id,
            data: {
              title: localizedData[locale].title,
              // Note: slug is not localized, so we don't update it here
              publishAt: localizedData[locale].publishAt || undefined,
            },
            locale: locale as (typeof LOCALES)[number],
          })
        }

        // Store in appropriate id map - convert snake_case to camelCase
        const mapKeyMap: Record<string, string> = {
          static_pages: 'staticPages',
          articles: 'articles',
          subtle_system_nodes: 'subtleSystemNodes',
          treatments: 'treatments',
        }
        const mapKey = mapKeyMap[tableName]
        if (mapKey && mapKey in this.idMaps) {
          // Ensure page.id is stored as a number for proper type matching
          const numericId = typeof page.id === 'string' ? parseInt(page.id) : page.id
          ;(this.idMaps as any)[mapKey].set(numericId, pageDoc.id)
        }

        this.summary.pagesCreated++
        await this.logger.log(`✓ Created page from ${tableName}: ${page.id} -> ${pageDoc.id}`)
      } catch (error: any) {
        // Enhanced error logging for slug issues
        if (error.message && error.message.includes('slug')) {
          const locales = Object.keys(localizedData)
          const slugInfo = locales.map((loc) => `${loc}:"${localizedData[loc].slug}"`).join(', ')
          this.addError(`Failed to import ${tableName} ${page.id} [slugs: ${slugInfo}]`, error)
        } else {
          this.addError(`Failed to import ${tableName} ${page.id}`, error)
        }
      }
    }
  }

  private async importPromoPages() {
    await this.logger.log('\n=== Importing promo_pages ===')

    // promo_pages has a different structure - no translations table, locale on main table
    // Group by the base page (we need to find English versions and their translations)
    const pagesResult = await this.dbClient.query(`
      SELECT
        id,
        name,
        slug,
        content,
        published_at,
        locale
      FROM promo_pages
      ORDER BY id, locale
    `)

    await this.logger.log(`Found ${pagesResult.rows.length} promo_page records to import`)

    // Group pages by their base content (same slug typically means same page in different locales)
    // For promo_pages, each row is a separate locale version
    const pageGroups = new Map<number, Array<(typeof pagesResult.rows)[0]>>()
    for (const page of pagesResult.rows) {
      if (!pageGroups.has(page.id)) {
        pageGroups.set(page.id, [])
      }
      pageGroups.get(page.id)!.push(page)
    }

    await this.logger.log(`Grouped into ${pageGroups.size} unique promo_pages`)

    for (const [pageId, localeVersions] of Array.from(pageGroups.entries())) {
      try {
        // Find English version
        const englishVersion = localeVersions.find((v) => v.locale === 'en')
        if (!englishVersion) {
          await this.logger.log(`Skipping promo_page ${pageId}: no English (en) version`)
          continue
        }

        // Get tags
        const tags: string[] = []
        const contentTypeTag = CONTENT_TYPE_TAGS['promo_pages']
        if (contentTypeTag) {
          const tagId = this.contentTypeTagMap.get(`content-type-tag-${contentTypeTag}`)
          if (tagId) {
            tags.push(tagId)
          }
        }

        // Clean slug for English version
        const slug = englishVersion.slug?.trim()

        // Create page with English version first
        let pageDoc
        try {
          pageDoc = await this.payload.create({
            collection: 'pages',
            data: {
              title: englishVersion.name,
              slug: slug && slug.length > 0 ? slug : undefined,
              publishAt: englishVersion.published_at || undefined,
              tags: tags.length > 0 ? tags : undefined,
            },
            locale: 'en',
          })
        } catch (slugError: any) {
          // If slug validation fails (duplicate), retry without slug to auto-generate
          if (slugError.message && slugError.message.includes('slug')) {
            await this.logger.log(`  Slug conflict for promo_page ${pageId}, auto-generating...`)
            pageDoc = await this.payload.create({
              collection: 'pages',
              data: {
                title: englishVersion.name,
                publishAt: englishVersion.published_at || undefined,
                tags: tags.length > 0 ? tags : undefined,
              },
              locale: 'en',
            })
          } else {
            throw slugError
          }
        }

        // Update with other locales
        const otherLocales = localeVersions.filter(
          (v) => v.locale !== 'en' && LOCALES.includes(v.locale),
        )
        for (const localeVersion of otherLocales) {
          await this.payload.update({
            collection: 'pages',
            id: pageDoc.id,
            data: {
              title: localeVersion.name,
              publishAt: localeVersion.published_at || undefined,
            },
            locale: localeVersion.locale as (typeof LOCALES)[number],
          })
        }

        // Store mapping
        this.idMaps.promoPages.set(pageId, pageDoc.id as string)
        this.summary.pagesCreated++
        await this.logger.log(
          `✓ Created page from promo_pages: ${pageId} -> ${pageDoc.id} (${1 + otherLocales.length} locales)`,
        )
      } catch (error: unknown) {
        this.addError(`Failed to import promo_pages ${pageId}`, error as Error)
      }
    }
  }

  private async importPromoPagesWithContent() {
    await this.logger.log('\n=== Updating promo_pages with Content ===')

    // Only process promo_pages that have English version (these were created in Phase 1)
    // promo_pages has content directly on the table (each row is a locale)
    const pagesResult = await this.dbClient.query(`
      SELECT
        pp.id,
        pp.locale,
        pp.title,
        pp.content
      FROM promo_pages pp
      WHERE pp.content IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM promo_pages pp_en
          WHERE pp_en.id = pp.id
            AND pp_en.locale = 'en'
        )
      ORDER BY pp.id
    `)

    await this.logger.log(`Updating ${pagesResult.rows.length} promo_page records with content`)

    for (const page of pagesResult.rows) {
      // Convert page.id to number for map lookup
      const numericId = typeof page.id === 'string' ? parseInt(page.id) : page.id
      const pageId = this.idMaps.promoPages.get(numericId)
      if (!pageId) {
        // This should not happen since we're filtering for pages with English versions
        this.addWarning(`Promo page ${page.id} (${page.title}) not found in ID map (unexpected)`)
        continue
      }

      try {
        const locale = page.locale

        // Skip unsupported locales
        if (!LOCALES.includes(locale)) {
          continue
        }

        const content = page.content as EditorJSContent

        // Build conversion context
        const context: ConversionContext = {
          payload: this.payload,
          logger: this.logger,
          pageId: page.id,
          pageTitle: page.title || 'Unknown',
          locale,
          mediaMap: this.idMaps.media,
          formMap: this.idMaps.forms,
          externalVideoMap: this.idMaps.externalVideos,
          treatmentMap: this.idMaps.treatments,
          meditationTitleMap: this.meditationTitleMap,
          meditationRailsTitleMap: this.meditationRailsTitleMap,
        }

        // Convert EditorJS to Lexical
        const lexicalContent = await convertEditorJSToLexical(content, context)

        // Update page with content
        await this.payload.update({
          collection: 'pages',
          id: pageId,
          data: {
            content: lexicalContent as any,
          },
          locale: locale as any,
        })

        await this.logger.log(`✓ Updated promo_page ${page.id} -> ${pageId} with content`)
      } catch (error: any) {
        await this.logger.log(`Error updating promo_page ${page.id} with content: ${error.message}`)
        throw error // Fail on content conversion error
      }
    }
  }

  private async importForms() {
    await this.logger.log('\n=== Creating Shared Forms ===')

    const formConfigs = {
      contact: {
        title: 'Contact Form',
        fields: [
          {
            name: 'name',
            label: 'Name',
            blockType: 'text' as const,
            required: true,
          },
          {
            name: 'email',
            label: 'Email',
            blockType: 'email' as const,
            required: true,
          },
          {
            name: 'message',
            label: 'Message',
            blockType: 'textarea' as const,
            required: true,
          },
        ],
      },
      signup: {
        title: 'Signup Form',
        fields: [
          {
            name: 'email',
            label: 'Email',
            blockType: 'email' as const,
            required: true,
          },
        ],
      },
    }

    for (const [formType, config] of Object.entries(formConfigs)) {
      try {
        // Check if form already exists
        const existing = await this.payload.find({
          collection: 'forms',
          where: {
            title: { equals: config.title },
          },
        })

        if (existing.docs.length > 0) {
          this.idMaps.forms.set(formType, existing.docs[0].id as string)
          await this.logger.log(`✓ Reusing existing form: ${config.title}`)
          continue
        }

        // Create new form
        const form = await this.payload.create({
          collection: 'forms',
          data: {
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
        })

        this.idMaps.forms.set(formType, form.id as string)
        this.summary.formsCreated++
        await this.logger.log(`✓ Created form: ${config.title}`)
      } catch (error: any) {
        this.addError(`Failed: creating form ${formType}`, error)
      }
    }
  }

  private async buildMeditationTitleMap() {
    await this.logger.log('\n=== Building Meditation Maps ===')

    try {
      // Build title map from Payload meditations
      const meditations = await this.payload.find({
        collection: 'meditations',
        limit: 1000,
      })

      for (const meditation of meditations.docs) {
        if (meditation.title) {
          const title = meditation.title.toLowerCase().trim()
          this.meditationTitleMap.set(title, meditation.id as string)
        }
      }

      await this.logger.log(`✓ Built title map with ${this.meditationTitleMap.size} meditations`)

      // Build Rails meditation title map from PostgreSQL (Rails ID → title without duration)
      const result = await this.dbClient.query(`
        SELECT m.id, mt.name
        FROM meditations m
        LEFT JOIN meditation_translations mt ON m.id = mt.meditation_id
        WHERE mt.locale = 'en'
      `)

      for (const row of result.rows) {
        if (row.name) {
          // Strip duration suffix (everything after and including " | ")
          // PostgreSQL: "Focus Your Attention | 10 min" -> "focus your attention"
          const titleWithoutDuration = row.name.split('|')[0].trim()
          const title = titleWithoutDuration.toLowerCase().trim()
          // Store Rails ID (as number) → cleaned title for lookup in convertCatalog
          // PostgreSQL returns id as a string, so convert to number for consistent lookups
          this.meditationRailsTitleMap.set(Number(row.id), title)
        }
      }

      await this.logger.log(
        `✓ Built Rails title map with ${this.meditationRailsTitleMap.size} meditation titles from PostgreSQL`
      )
    } catch (error: any) {
      this.addError('Failed: building meditation maps', error)
    }
  }

  /**
   * Get or create default thumbnail for external videos
   */
  private async getDefaultThumbnail(): Promise<string> {
    if (this.defaultThumbnailId) {
      return this.defaultThumbnailId
    }

    try {
      const previewPath = path.join(__dirname, 'preview.png')
      const result = await this.mediaUploader.uploadWithDeduplication(previewPath, {
        alt: 'Video preview placeholder',
      })
      if (!result) {
        throw new Error('Failed to upload default thumbnail - no result returned')
      }
      this.defaultThumbnailId = result.id
      await this.logger.log(`✓ Created default thumbnail: ${result.filename}`)
      return result.id
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to create default thumbnail: ${errorMessage}`)
    }
  }

  /**
   * Fetch video thumbnail from Vimeo or YouTube
   * Returns Media ID of the downloaded thumbnail, or default thumbnail if fetch fails
   */
  private async fetchVideoThumbnail(
    videoId: string,
    vimeoId?: string,
    youtubeId?: string,
  ): Promise<string> {
    try {
      let thumbnailUrl: string | null = null

      if (vimeoId) {
        // Try Vimeo oEmbed API
        try {
          const oembedUrl = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${vimeoId}`
          const response = await fetch(oembedUrl)
          if (response.ok) {
            const data = await response.json()
            thumbnailUrl = data.thumbnail_url
            await this.logger.log(`✓ Fetched Vimeo thumbnail for ${vimeoId}`)
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          await this.logger.warn(`Failed to fetch Vimeo thumbnail for ${vimeoId}: ${errorMessage}`)
        }
      } else if (youtubeId) {
        // Try YouTube maxresdefault first, fallback to hqdefault
        const maxResUrl = `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`
        try {
          const response = await fetch(maxResUrl, { method: 'HEAD' })
          if (response.ok) {
            thumbnailUrl = maxResUrl
            await this.logger.log(`✓ Using YouTube maxresdefault thumbnail for ${youtubeId}`)
          } else {
            // Fallback to hqdefault
            thumbnailUrl = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
            await this.logger.log(`✓ Using YouTube hqdefault thumbnail for ${youtubeId}`)
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          // Fallback to hqdefault
          thumbnailUrl = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
          await this.logger.warn(
            `Failed to check YouTube maxresdefault for ${youtubeId}, using hqdefault: ${errorMessage}`,
          )
        }
      }

      if (thumbnailUrl) {
        // Download and convert thumbnail
        const downloadResult = await this.mediaDownloader.downloadAndConvertImage(thumbnailUrl)

        // Upload to Payload
        const uploadResult = await this.mediaUploader.uploadWithDeduplication(
          downloadResult.localPath,
          {
            alt: `Video thumbnail for ${videoId}`,
          },
        )

        if (!uploadResult) {
          await this.logger.warn(`Failed to upload thumbnail for video ${videoId}, using default`)
          return await this.getDefaultThumbnail()
        }

        return uploadResult.id
      }

      // No thumbnail URL found, use default
      await this.logger.warn(`No thumbnail URL found for video ${videoId}, using default`)
      return await this.getDefaultThumbnail()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.logger.warn(
        `Failed to fetch thumbnail for video ${videoId}: ${errorMessage}, using default`,
      )
      return await this.getDefaultThumbnail()
    }
  }

  private async importExternalVideos() {
    await this.logger.log('\n=== Scanning for External Videos ===')

    // Collect all vimeo/youtube IDs from content
    const videoIds = new Set<string>()
    const videoMetadata = new Map<
      string,
      { title: string; thumbnail: string; vimeoId?: string; youtubeId?: string }
    >()

    for (const [_tableName, translationsTable] of [
      ['static_pages', 'static_page_translations'],
      ['articles', 'article_translations'],
      ['subtle_system_nodes', 'subtle_system_node_translations'],
      ['treatments', 'treatment_translations'],
    ]) {
      const result = await this.dbClient.query(`
        SELECT content
        FROM ${translationsTable}
        WHERE content IS NOT NULL
      `)

      for (const row of result.rows) {
        if (!row.content || !row.content.blocks) continue

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

    // Scan promo_pages (different structure)
    const promoResult = await this.dbClient.query(`
      SELECT content
      FROM promo_pages
      WHERE content IS NOT NULL
    `)

    for (const row of promoResult.rows) {
      if (!row.content || !row.content.blocks) continue

      for (const block of row.content.blocks) {
        if (block.type === 'vimeo' && block.data) {
          const videoId = block.data.vimeo_id || block.data.youtube_id
          if (videoId) {
            videoIds.add(videoId)
            videoMetadata.set(videoId, {
              title: block.data.title || '',
              thumbnail: block.data.preview || '',
              vimeoId: block.data.vimeo_id,
              youtubeId: block.data.youtube_id,
            })
          }
        }
      }
    }

    await this.logger.log(`Found ${videoIds.size} unique external videos`)

    // Create ExternalVideo documents
    for (const videoId of Array.from(videoIds)) {
      try {
        const metadata = videoMetadata.get(videoId)!

        // Build video URL
        const videoUrl = metadata.vimeoId
          ? `https://vimeo.com/${metadata.vimeoId}`
          : `https://youtube.com/watch?v=${metadata.youtubeId}`

        // Fetch thumbnail from Vimeo/YouTube API (or use default)
        const thumbnailId = await this.fetchVideoThumbnail(
          videoId,
          metadata.vimeoId,
          metadata.youtubeId,
        )

        const externalVideo = await this.payload.create({
          collection: 'external-videos',
          data: {
            title: metadata.title || `Video ${videoId}`,
            videoUrl,
            thumbnail: thumbnailId,
          },
        })

        this.idMaps.externalVideos.set(videoId, externalVideo.id as string)
        this.summary.externalVideosCreated++
        await this.logger.log(`✓ Created ExternalVideo: ${videoId}`)
      } catch (error: any) {
        this.addError(`Failed: creating ExternalVideo ${videoId}`, error)
      }
    }
  }

  private async importMedia() {
    await this.logger.log('\n=== Importing Media Files ===')

    // Initialize media downloader and uploader
    this.mediaDownloader = new MediaDownloader(CACHE_DIR, this.logger)
    await this.mediaDownloader.initialize()
    this.mediaUploader = new MediaUploader(this.payload, this.logger)

    // Collect all media URLs from content
    const mediaUrls = new Set<string>()
    const mediaMetadata = new Map<string, { alt: string; credit: string; caption: string }>()

    // Scan all page content with translations
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

        // Parse JSON content if it's a string (PostgreSQL JSONB can return as string or object)
        let content
        try {
          content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content
        } catch (error) {
          // If JSON parse fails, content might already be an object or invalid - skip this row
          await this.logger.warn(`Failed to parse content for a row: ${error instanceof Error ? error.message : String(error)}`)
          continue
        }

        const urls = extractMediaUrls(content, STORAGE_BASE_URL)
        urls.forEach((url) => mediaUrls.add(url))

        // Extract metadata from blocks
        if (content.blocks) {
          for (const block of content.blocks) {
            if (block.type === 'media' && block.data.items) {
              for (const item of block.data.items) {
                if (item.image?.preview) {
                  const url = item.image.preview
                  mediaMetadata.set(url, {
                    alt: item.alt || '',
                    credit: item.credit || '',
                    caption: item.caption || '',
                  })
                }
              }
            }
          }
        }
      }
    }

    // Scan promo_pages (different structure - no translations table)
    const promoResult = await this.dbClient.query(`
      SELECT content, locale
      FROM promo_pages
      WHERE content IS NOT NULL
    `)

    for (const row of promoResult.rows) {
      if (!row.content) continue

      // Parse JSON content if it's a string (PostgreSQL JSONB can return as string or object)
      let content
      try {
        content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content
      } catch (error) {
        // If JSON parse fails, content might already be an object or invalid - skip this row
        await this.logger.warn(`Failed to parse promo content for a row: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }

      const urls = extractMediaUrls(content, STORAGE_BASE_URL)
      urls.forEach((url) => mediaUrls.add(url))

      // Extract metadata from blocks
      if (content.blocks) {
        for (const block of content.blocks) {
          if (block.type === 'media' && block.data.items) {
            for (const item of block.data.items) {
              if (item.image?.preview) {
                const url = item.image.preview
                mediaMetadata.set(url, {
                  alt: item.alt || '',
                  credit: item.credit || '',
                  caption: item.caption || '',
                })
              }
            }
          }
        }
      }
    }

    // Also scan author images
    const authorsResult = await this.dbClient.query(`
      SELECT id, image
      FROM authors
      WHERE image IS NOT NULL
    `)

    for (const author of authorsResult.rows) {
      const imageUrl = extractAuthorImageUrl(author.image, STORAGE_BASE_URL)
      if (imageUrl) {
        mediaUrls.add(imageUrl)
        mediaMetadata.set(imageUrl, {
          alt: 'Author profile image',
          credit: '',
          caption: '',
        })
      }
    }

    // Note: Treatment thumbnails are stored in the media_files table with polymorphic relationships
    // For now, skipping treatment thumbnail scanning as the schema needs further investigation
    // TODO: Implement treatment thumbnail scanning once we understand the media_files schema

    await this.logger.log(`Found ${mediaUrls.size} unique media files to download`)

    // Download and create Media documents
    let downloadedCount = 0
    for (const url of Array.from(mediaUrls)) {
      try {
        // Download and convert
        const downloadResult = await this.mediaDownloader.downloadAndConvertImage(url)

        // Get metadata
        const metadata = mediaMetadata.get(url) || {
          alt: '',
          credit: '',
          caption: '',
        }

        // Extract filename without extension for fallback alt text
        const filename = path.basename(downloadResult.localPath, path.extname(downloadResult.localPath))

        // Upload Media document with deduplication
        // Note: alt is required, so use filename as fallback if empty
        const result = await this.mediaUploader.uploadWithDeduplication(downloadResult.localPath, {
          alt: metadata.alt || filename,
          credit: metadata.credit || '',
        })

        if (result) {
          this.idMaps.media.set(url, result.id)
          if (!result.wasReused) {
            this.summary.mediaCreated++
          }
          downloadedCount++
          await this.logger.log(`✓ Imported media: ${downloadedCount}/${mediaUrls.size}`)
        }
      } catch (error: any) {
        this.addError(`Failed to import media ${url}`, error)
        // Continue with next media item
      }
    }
  }

  private async importPagesWithContent(tableName: string, translationsTable: string) {
    await this.logger.log(`\n=== Updating ${tableName} with Content ===`)

    // Only process pages that have English translations (these were created in Phase 1)
    const pagesResult = await this.dbClient.query(`
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
          WHERE pt_en.${tableName.slice(0, -1)}_id = p.id
            AND pt_en.locale = 'en'
        )
      GROUP BY p.id
    `)

    await this.logger.log(`Updating ${pagesResult.rows.length} pages with content`)

    // Get the map for this table - convert snake_case to camelCase
    const mapKeyMap: Record<string, string> = {
      static_pages: 'staticPages',
      articles: 'articles',
      subtle_system_nodes: 'subtleSystemNodes',
      treatments: 'treatments',
    }
    const mapKey = mapKeyMap[tableName]
    const pageIdMap = (this.idMaps as unknown as Record<string, Map<number, string>>)[mapKey]

    for (const page of pagesResult.rows) {
      // Convert page.id to number for map lookup (same fix as treatment map)
      const numericId = typeof page.id === 'string' ? parseInt(page.id) : page.id
      const pageId = pageIdMap.get(numericId)
      if (!pageId) {
        // This should not happen since we're filtering for pages with English versions
        this.addWarning(
          `Page ${page.id} (${page.title}) from ${tableName} not found in ID map (unexpected)`,
        )
        continue
      }

      let lastLexicalContent: any = null
      let lastLocale: string = ''

      try {
        // Convert content for each locale
        for (const translation of page.translations) {
          if (!translation.locale || !translation.content) continue

          // Skip unsupported locales
          if (!LOCALES.includes(translation.locale)) {
            continue
          }

          const locale = translation.locale
          lastLocale = locale

          // Parse content if it's a string (PostgreSQL returns JSONB as string in json_agg)
          let content
          try {
            if (typeof translation.content === 'string') {
              // Fix Ruby hash syntax (=>) to proper JSON (:) before parsing
              // This handles cases where the database has Ruby-serialized data instead of JSON
              const contentStr = translation.content.replace(/=>/g, ':')
              content = JSON.parse(contentStr)
            } else {
              content = translation.content
            }
          } catch (parseError) {
            // Log the raw content that failed to parse
            const errorMessage =
              parseError instanceof Error ? parseError.message : String(parseError)
            await this.logger.error(`\nJSON parse error for page ${page.id} (locale: ${locale}):`)
            await this.logger.error(`Parse error: ${errorMessage}`)
            await this.logger.error(`Raw content (first 500 chars):`)
            await this.logger.error(String(translation.content).substring(0, 500))
            throw parseError // Re-throw to be caught by outer catch block
          }

          // Build conversion context
          const context: ConversionContext = {
            payload: this.payload,
            logger: this.logger,
            pageId: page.id,
            pageTitle: page.title || 'Unknown',
            locale,
            mediaMap: this.idMaps.media,
            formMap: this.idMaps.forms,
            externalVideoMap: this.idMaps.externalVideos,
            treatmentMap: this.idMaps.treatments,
            meditationTitleMap: this.meditationTitleMap,
            meditationRailsTitleMap: this.meditationRailsTitleMap,
          }

          // Convert EditorJS to Lexical
          const lexicalContent = await convertEditorJSToLexical(content, context)
          lastLexicalContent = lexicalContent

          // TODO: For treatments, prepend thumbnail as upload node with align='right'
          // Currently disabled as treatment thumbnails are in media_files table with polymorphic relationships
          // Need to investigate schema and implement proper thumbnail extraction

          // Fetch existing page to preserve required fields (Fix #2)
          const existingPage = await this.payload.findByID({
            collection: 'pages',
            id: pageId,
            locale: locale as (typeof LOCALES)[number],
          })

          // Update page with content
          await this.payload.update({
            collection: 'pages',
            id: pageId,
            data: {
              title: existingPage.title, // Preserve existing title to pass validation
              content: lexicalContent as any,
            },
            locale: locale as (typeof LOCALES)[number],
          })
        }

        await this.logger.log(`✓ Updated page ${page.id} -> ${pageId} with content`)
      } catch (error: any) {
        // Log the actual error details for debugging
        await this.logger.error(`\nDetailed error for page ${page.id} (locale: ${lastLocale}):`)
        await this.logger.error(`Error message: ${error.message}`)
        if (error.data) {
          await this.logger.error(`Error data: ${JSON.stringify(error.data, null, 2)}`)
        }

        // Also log the lexical content structure that failed
        if (lastLexicalContent) {
          const contentStr = JSON.stringify(lastLexicalContent, null, 2)
          const errorDataStr = JSON.stringify(error.data || {})

          // If link validation error, find and log all link nodes
          if (errorDataStr.includes('link node failed')) {
            await this.logger.error(`\nSearching for link nodes with invalid URLs...`)
            const linkMatches = contentStr.match(/"type":\s*"link"[\s\S]{0,300}/g)
            if (linkMatches && linkMatches.length > 0) {
              await this.logger.error(`Found ${linkMatches.length} link node(s):`)
              for (let i = 0; i < Math.min(linkMatches.length, 10); i++) {
                await this.logger.error(`\nLink #${i + 1}:`)
                await this.logger.error(linkMatches[i])
              }
            } else {
              await this.logger.error(`No link nodes found in content`)
            }
          }

          await this.logger.error(`\nLexical content structure (first 15000 chars):`)
          await this.logger.error(contentStr.substring(0, 15000))
        }

        this.addError(`Failed: updating page ${page.id} with content`, error)
        // Continue with next page
      }
    }
  }

  // ============================================================================
  // MAIN RUN METHOD
  // ============================================================================

  private printSummary() {
    console.log('\n' + '='.repeat(60))
    console.log('IMPORT SUMMARY')
    console.log('='.repeat(60))

    // Get MediaUploader stats
    const mediaStats = this.mediaUploader.getStats()

    console.log(`\n📊 Records Created:`)
    console.log(`  Authors:            ${this.summary.authorsCreated}`)
    console.log(`  Categories:         ${this.summary.categoriesCreated}`)
    console.log(`  Pages:              ${this.summary.pagesCreated}`)
    console.log(`  Media Files:        ${mediaStats.uploaded}`)
    console.log(`  External Videos:    ${this.summary.externalVideosCreated}`)
    console.log(`  Forms:              ${this.summary.formsCreated}`)

    const totalRecords =
      this.summary.authorsCreated +
      this.summary.categoriesCreated +
      this.summary.pagesCreated +
      mediaStats.uploaded +
      this.summary.externalVideosCreated +
      this.summary.formsCreated

    console.log(`\n  Total Records:      ${totalRecords}`)
    console.log(`  Media Reused:       ${mediaStats.reused}`)

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
    console.log('\n🚀 Starting WeMeditate Import\n')

    try {
      // 1. Setup cache directory
      await fs.mkdir(CACHE_DIR, { recursive: true })
      await fs.mkdir(path.join(CACHE_DIR, 'assets'), { recursive: true })

      // 2. Initialize utilities
      this.logger = new Logger(CACHE_DIR, (message) => this.addWarning(message))
      this.fileUtils = new FileUtils(this.logger)

      // 3. Initialize Payload (always, even for dry run validation)
      const payloadConfig = await configPromise
      this.payload = await getPayload({ config: payloadConfig })
      this.tagManager = new TagManager(this.payload, this.logger)
      this.payloadHelpers = new PayloadHelpers(this.payload, this.logger)
      await this.logger.log('✓ Payload CMS initialized')

      // 4. Handle options
      if (this.options.clearCache) {
        await this.logger.log('Clearing cache...')
        await fs.rm(CACHE_DIR, { recursive: true, force: true })
        await fs.mkdir(CACHE_DIR, { recursive: true })
        await fs.mkdir(path.join(CACHE_DIR, 'assets'), { recursive: true })
      }

      if (this.options.reset) {
        await this.resetCollections()
      }

      // 5. Setup PostgreSQL database
      await this.setupDatabase()

      // Stop here if dry run
      if (this.options.dryRun) {
        await this.logger.log('\n✓ Dry run completed successfully')
        await this.logger.log('Database connection and schema validated')
        return
      }

      // 6. Run two-phase import
      await this.logger.log('\n=== PHASE 1: Metadata Import ===\n')

      // Phase 1: Import metadata without content
      await this.importAuthors()
      await this.importCategories()
      await this.importContentTypeTags()

      // Import article type tags
      for (const articleType of Object.values(ARTICLE_TYPE_TAGS)) {
        const itemKey = `content-type-tag-${articleType}`
        if (!this.contentTypeTagMap.has(articleType)) {
          try {
            const tagDoc = await this.payload.create({
              collection: 'page-tags',
              data: {
                name: articleType,
                title: articleType,
              },
            })
          } catch {
            // Might already exist
          }
        }
      }

      // Import pages metadata only (no content conversion yet)
      await this.importPages('static_pages', 'static_page_translations')
      await this.importPages('articles', 'article_translations')
      // NOTE: PromoPages import is disabled - uncomment if needed
      // await this.importPromoPages() // Different structure - no translations table
      await this.importPages('subtle_system_nodes', 'subtle_system_node_translations')
      await this.importPages('treatments', 'treatment_translations')

      await this.logger.log('\n=== PHASE 2: Content Import ===\n')

      // Phase 2: Import content with full conversion
      await this.buildMeditationTitleMap()
      await this.importForms()
      await this.importMedia()
      await this.importExternalVideos()

      // Update pages with converted Lexical content
      await this.importPagesWithContent('static_pages', 'static_page_translations')
      await this.importPagesWithContent('articles', 'article_translations')
      // NOTE: PromoPages content import is disabled - uncomment if needed
      // await this.importPromoPagesWithContent() // Different structure - no translations table
      await this.importPagesWithContent('subtle_system_nodes', 'subtle_system_node_translations')
      await this.importPagesWithContent('treatments', 'treatment_translations')

      // 7. Cleanup database
      await this.cleanupDatabase()

      await this.logger.log('\n=== Import Complete ===')
      this.printSummary()
    } catch (error: any) {
      await this.logger.error(`Fatal error: ${error.message}`)
      console.error('Fatal error:', error)

      // Try to cleanup database on error
      try {
        await this.cleanupDatabase()
      } catch {
        // Ignore cleanup errors
      }

      throw error
    } finally {
      // Ensure Payload cleanup
      if (this.payload?.db?.destroy) {
        await this.payload.db.destroy()
      }
    }
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2)
  const options: ScriptOptions = {
    dryRun: args.includes('--dry-run'),
    reset: args.includes('--reset'),
    clearCache: args.includes('--clear-cache'),
  }

  // Validate required environment variables
  const requiredEnvVars = ['DATABASE_URI', 'PAYLOAD_SECRET']
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`Error: ${envVar} environment variable is required`)
      process.exit(1)
    }
  }

  // Check if data.bin exists
  try {
    await fs.access(DATA_BIN)
  } catch {
    console.error(`Error: Data file not found at ${DATA_BIN}`)
    process.exit(1)
  }

  const importer = new WeMeditateImporter(options)
  await importer.run()
  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
