#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * PostgreSQL Data Extraction Script
 *
 * One-time script to extract data from PostgreSQL dumps (data.bin) to JSON files.
 * This removes the PostgreSQL dependency from import scripts, enabling them to run
 * anywhere (migrations, CI/CD, Cloudflare Workers).
 *
 * Usage:
 *   pnpm tsx imports/extract-to-json.ts
 *
 * Prerequisites:
 *   - PostgreSQL installed (psql, createdb, pg_restore)
 *   - imports/meditations/data.bin exists
 *   - imports/wemeditate/data.bin exists
 *
 * Output:
 *   - imports/meditations/data.json
 *   - imports/wemeditate/data.json
 */

import { execSync } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'

import { Client } from 'pg'

// ============================================================================
// CONFIGURATION
// ============================================================================

const MEDITATIONS_DB = 'temp_extract_meditations'
const WEMEDITATE_DB = 'temp_extract_wemeditate'

const MEDITATIONS_BIN = path.resolve(process.cwd(), 'imports/meditations/data.bin')
const WEMEDITATE_BIN = path.resolve(process.cwd(), 'imports/wemeditate/data.bin')

const MEDITATIONS_JSON = path.resolve(process.cwd(), 'imports/meditations/data.json')
const WEMEDITATE_JSON = path.resolve(process.cwd(), 'imports/wemeditate/data.json')

// ============================================================================
// TYPES (matching import script interfaces)
// ============================================================================

interface MeditationsData {
  tags: Array<{ id: number; name: string }>
  frames: Array<{ id: number; category: string; tags: string }>
  meditations: Array<{
    id: number
    title: string
    duration?: number
    published: boolean
    narrator: number
    music_tag?: string
  }>
  musics: Array<{ id: number; title: string; duration?: number; credit?: string }>
  keyframes: Array<{
    media_type: string
    media_id: number
    frame_id: number
    seconds?: number
  }>
  taggings: Array<{
    tag_id: number
    taggable_type: string
    taggable_id: number
    context: string
  }>
  attachments: Array<{
    name: string
    record_type: string
    record_id: number
    blob_id: number
  }>
  blobs: Array<{
    id: number
    key: string
    filename: string
    content_type: string
    byte_size: number
  }>
}

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

// ============================================================================
// DATABASE HELPERS
// ============================================================================

async function setupDatabase(dbName: string, dataBin: string): Promise<Client> {
  console.log(`\nSetting up ${dbName}...`)

  // Drop existing database if it exists
  try {
    execSync(`dropdb ${dbName} 2>/dev/null || true`, { stdio: 'ignore' })
  } catch {
    // Ignore errors
  }

  // Create new database
  execSync(`createdb ${dbName}`)
  console.log(`  ✓ Created database: ${dbName}`)

  // Restore from backup
  execSync(`pg_restore -d ${dbName} --no-owner --no-privileges ${dataBin} 2>/dev/null || true`, {
    stdio: 'ignore',
  })
  console.log(`  ✓ Restored data from: ${path.basename(dataBin)}`)

  // Connect to database
  const client = new Client({ database: dbName })
  await client.connect()
  console.log(`  ✓ Connected to database`)

  return client
}

async function cleanupDatabase(client: Client, dbName: string): Promise<void> {
  await client.end()
  try {
    execSync(`dropdb ${dbName} 2>/dev/null || true`, { stdio: 'ignore' })
  } catch {
    // Ignore errors
  }
  console.log(`  ✓ Cleaned up database: ${dbName}`)
}

// ============================================================================
// MEDITATIONS EXTRACTION
// ============================================================================

async function extractMeditationsData(): Promise<void> {
  console.log('\n' + '='.repeat(60))
  console.log('Extracting Meditations Data')
  console.log('='.repeat(60))

  // Check if data.bin exists
  try {
    await fs.access(MEDITATIONS_BIN)
  } catch {
    console.log('  ⚠ Skipping: imports/meditations/data.bin not found')
    return
  }

  const client = await setupDatabase(MEDITATIONS_DB, MEDITATIONS_BIN)

  try {
    console.log('\nRunning queries...')

    const [tags, frames, meditations, musics, keyframes, taggings, attachments, blobs] =
      await Promise.all([
        client.query('SELECT id, name FROM tags ORDER BY id'),
        client.query('SELECT id, category, tags FROM frames ORDER BY id'),
        client.query(
          'SELECT id, title, duration, published, narrator, music_tag FROM meditations WHERE published = true ORDER BY id',
        ),
        client.query('SELECT id, title, duration, credit FROM musics ORDER BY id'),
        client.query(
          "SELECT media_type, media_id, frame_id, seconds FROM keyframes WHERE media_type = 'Meditation' ORDER BY media_id, seconds",
        ),
        client.query('SELECT tag_id, taggable_type, taggable_id, context FROM taggings'),
        client.query('SELECT name, record_type, record_id, blob_id FROM active_storage_attachments'),
        client.query(
          'SELECT id, key, filename, content_type, byte_size FROM active_storage_blobs',
        ),
      ])

    const data: MeditationsData = {
      tags: tags.rows,
      frames: frames.rows,
      meditations: meditations.rows,
      musics: musics.rows,
      keyframes: keyframes.rows,
      taggings: taggings.rows,
      attachments: attachments.rows,
      blobs: blobs.rows,
    }

    console.log(`  ✓ Extracted: ${data.tags.length} tags`)
    console.log(`  ✓ Extracted: ${data.frames.length} frames`)
    console.log(`  ✓ Extracted: ${data.meditations.length} meditations`)
    console.log(`  ✓ Extracted: ${data.musics.length} music tracks`)
    console.log(`  ✓ Extracted: ${data.keyframes.length} keyframes`)
    console.log(`  ✓ Extracted: ${data.taggings.length} taggings`)
    console.log(`  ✓ Extracted: ${data.attachments.length} attachments`)
    console.log(`  ✓ Extracted: ${data.blobs.length} blobs`)

    // Write to JSON
    await fs.writeFile(MEDITATIONS_JSON, JSON.stringify(data, null, 2))
    console.log(`\n✓ Written to: imports/meditations/data.json`)
  } finally {
    await cleanupDatabase(client, MEDITATIONS_DB)
  }
}

// ============================================================================
// WEMEDITATE EXTRACTION
// ============================================================================

async function extractWeMeditateData(): Promise<void> {
  console.log('\n' + '='.repeat(60))
  console.log('Extracting WeMeditate Data')
  console.log('='.repeat(60))

  // Check if data.bin exists
  try {
    await fs.access(WEMEDITATE_BIN)
  } catch {
    console.log('  ⚠ Skipping: imports/wemeditate/data.bin not found')
    return
  }

  const client = await setupDatabase(WEMEDITATE_DB, WEMEDITATE_BIN)

  try {
    console.log('\nRunning queries...')

    // Authors with translations
    const authors = await client.query(`
      SELECT
        a.id,
        a.country_code,
        a.years_meditating,
        a.image,
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
      GROUP BY a.id, a.country_code, a.years_meditating, a.image
    `)
    console.log(`  ✓ Extracted: ${authors.rows.length} authors`)

    // Artists (albums)
    const artists = await client.query(`
      SELECT id, name, url, image FROM artists
    `)
    console.log(`  ✓ Extracted: ${artists.rows.length} artists (albums)`)

    // Tracks (music) - join with translations and artist associations
    const tracks = await client.query(`
      SELECT
        t.id,
        t.audio,
        t.duration,
        tt.name as title,
        tt.locale,
        array_agg(DISTINCT at.artist_id) FILTER (WHERE at.artist_id IS NOT NULL) as artist_ids,
        array_agg(DISTINCT ift.instrument_filter_id) FILTER (WHERE ift.instrument_filter_id IS NOT NULL) as instrument_filter_ids
      FROM tracks t
      LEFT JOIN track_translations tt ON t.id = tt.track_id AND tt.locale = 'en'
      LEFT JOIN artists_tracks at ON t.id = at.track_id
      LEFT JOIN instrument_filters_tracks ift ON t.id = ift.track_id
      GROUP BY t.id, t.audio, t.duration, tt.name, tt.locale
    `)
    console.log(`  ✓ Extracted: ${tracks.rows.length} tracks`)

    // Categories
    const categories = await client.query(`
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
    console.log(`  ✓ Extracted: ${categories.rows.length} categories`)

    // Static pages with translations
    const staticPages = await client.query(`
      SELECT
        p.id,
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
      FROM static_pages p
      LEFT JOIN static_page_translations pt ON p.id = pt.static_page_id
      GROUP BY p.id
    `)
    console.log(`  ✓ Extracted: ${staticPages.rows.length} static pages`)

    // Articles with translations
    const articles = await client.query(`
      SELECT
        p.id,
        p.author_id,
        p.article_type,
        p.category_id,
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
      FROM articles p
      LEFT JOIN article_translations pt ON p.id = pt.article_id
      GROUP BY p.id, p.author_id, p.article_type, p.category_id
    `)
    console.log(`  ✓ Extracted: ${articles.rows.length} articles`)

    // Subtle system nodes with translations
    const subtleSystemNodes = await client.query(`
      SELECT
        p.id,
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
      FROM subtle_system_nodes p
      LEFT JOIN subtle_system_node_translations pt ON p.id = pt.subtle_system_node_id
      GROUP BY p.id
    `)
    console.log(`  ✓ Extracted: ${subtleSystemNodes.rows.length} subtle system nodes`)

    // Treatments with translations
    const treatments = await client.query(`
      SELECT
        p.id,
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
      FROM treatments p
      LEFT JOIN treatment_translations pt ON p.id = pt.treatment_id
      GROUP BY p.id
    `)
    console.log(`  ✓ Extracted: ${treatments.rows.length} treatments`)

    // Meditation translations (for linking treatments to meditations)
    const meditationTranslations = await client.query(`
      SELECT m.id as meditation_id, mt.name
      FROM meditations m
      JOIN meditation_translations mt ON m.id = mt.meditation_id
      WHERE mt.locale = 'en'
    `)
    console.log(`  ✓ Extracted: ${meditationTranslations.rows.length} meditation translations`)

    // Treatment thumbnails (from media_files table via treatment_translations)
    const treatmentThumbnails = await client.query(`
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
    console.log(`  ✓ Extracted: ${treatmentThumbnails.rows.length} treatment thumbnails`)

    const data: WeMeditateData = {
      authors: authors.rows,
      artists: artists.rows,
      tracks: tracks.rows,
      categories: categories.rows,
      staticPages: staticPages.rows,
      articles: articles.rows,
      subtleSystemNodes: subtleSystemNodes.rows,
      treatments: treatments.rows,
      meditationTranslations: meditationTranslations.rows,
      treatmentThumbnails: treatmentThumbnails.rows,
    }

    // Write to JSON
    await fs.writeFile(WEMEDITATE_JSON, JSON.stringify(data, null, 2))
    console.log(`\n✓ Written to: imports/wemeditate/data.json`)
  } finally {
    await cleanupDatabase(client, WEMEDITATE_DB)
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('=' .repeat(60))
  console.log('PostgreSQL Data Extraction')
  console.log('=' .repeat(60))
  console.log('\nThis script extracts data from PostgreSQL dumps to JSON files.')
  console.log('This is a ONE-TIME operation to remove PostgreSQL dependency.\n')

  try {
    await extractMeditationsData()
    await extractWeMeditateData()

    console.log('\n' + '='.repeat(60))
    console.log('Extraction Complete!')
    console.log('='.repeat(60))
    console.log('\nNext steps:')
    console.log('1. Review the generated JSON files')
    console.log('2. Update import scripts to read from JSON')
    console.log('3. Test imports: pnpm run import meditations --dry-run')
    console.log('4. Commit JSON files to repository')
  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  }
}

main()
