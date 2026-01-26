import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Migration: Update Lexical block slugs renamed in PR #183
 *
 * Block slug renames:
 * - gallery -> image-gallery (GalleryBlock -> ImageGalleryBlock)
 * - catalog -> showcase (CatalogBlock -> ShowcaseBlock)
 *
 * Tables updated:
 * - pages_locales.content (current page content)
 * - _pages_v_locales.version_content (page version history)
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Update current page content: gallery -> image-gallery
  await db.run(sql`
    UPDATE pages_locales
    SET content = REPLACE(content, '"blockType":"gallery"', '"blockType":"image-gallery"')
    WHERE content LIKE '%"blockType":"gallery"%'
  `)

  // Update current page content: catalog -> showcase
  await db.run(sql`
    UPDATE pages_locales
    SET content = REPLACE(content, '"blockType":"catalog"', '"blockType":"showcase"')
    WHERE content LIKE '%"blockType":"catalog"%'
  `)

  // Update page version history: gallery -> image-gallery
  await db.run(sql`
    UPDATE _pages_v_locales
    SET version_content = REPLACE(version_content, '"blockType":"gallery"', '"blockType":"image-gallery"')
    WHERE version_content LIKE '%"blockType":"gallery"%'
  `)

  // Update page version history: catalog -> showcase
  await db.run(sql`
    UPDATE _pages_v_locales
    SET version_content = REPLACE(version_content, '"blockType":"catalog"', '"blockType":"showcase"')
    WHERE version_content LIKE '%"blockType":"catalog"%'
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Reverse current page content: image-gallery -> gallery
  await db.run(sql`
    UPDATE pages_locales
    SET content = REPLACE(content, '"blockType":"image-gallery"', '"blockType":"gallery"')
    WHERE content LIKE '%"blockType":"image-gallery"%'
  `)

  // Reverse current page content: showcase -> catalog
  await db.run(sql`
    UPDATE pages_locales
    SET content = REPLACE(content, '"blockType":"showcase"', '"blockType":"catalog"')
    WHERE content LIKE '%"blockType":"showcase"%'
  `)

  // Reverse page version history: image-gallery -> gallery
  await db.run(sql`
    UPDATE _pages_v_locales
    SET version_content = REPLACE(version_content, '"blockType":"image-gallery"', '"blockType":"gallery"')
    WHERE version_content LIKE '%"blockType":"image-gallery"%'
  `)

  // Reverse page version history: showcase -> catalog
  await db.run(sql`
    UPDATE _pages_v_locales
    SET version_content = REPLACE(version_content, '"blockType":"showcase"', '"blockType":"catalog"')
    WHERE version_content LIKE '%"blockType":"showcase"%'
  `)
}
