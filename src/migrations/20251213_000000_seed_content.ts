/* eslint-disable no-console */
import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'

import { MeditationsImporter } from '../../imports/meditations/import'
import { StoryblokImporter } from '../../imports/storyblok/import'
import { TagsImporter } from '../../imports/tags/import'
import { WeMeditateImporter } from '../../imports/wemeditate/import'

/**
 * Seed Content Migration
 *
 * Seeds content from legacy databases using the import scripts.
 * Runs importers in dependency order:
 * 1. tags - Creates MeditationTags and MusicTags (no dependencies)
 * 2. wemeditate - Creates Albums, Authors, Pages, PageTags (no tag dependencies)
 * 3. meditations - Creates Meditations, Music (requires tags and albums from above)
 * 4. storyblok - Creates Lessons, Lectures (requires meditations for relationships)
 *
 * This migration is idempotent - all importers use natural key upserts,
 * so it's safe to re-run multiple times.
 *
 * IMPORTANT: All importers must succeed. If any fail, the migration will fail
 * and subsequent importers will not run (fail-fast behavior).
 *
 * Required environment variables:
 * - STORYBLOK_ACCESS_TOKEN: Required for storyblok import
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
  console.log('Seeding content from legacy databases...')

  try {
    // 1. Seed tags first (required by meditations)
    console.log('\n1/4 Seeding tags...')
    await TagsImporter.runFromMigration(payload)
    console.log('✓ Tags seeding complete')

    // 2. Seed wemeditate data (creates albums, authors, pages)
    console.log('\n2/4 Seeding wemeditate data...')
    await WeMeditateImporter.runFromMigration(payload)
    console.log('✓ WeMeditate seeding complete')

    // 3. Seed meditations (requires tags and albums)
    console.log('\n3/4 Seeding meditations...')
    await MeditationsImporter.runFromMigration(payload)
    console.log('✓ Meditations seeding complete')

    // 4. Seed storyblok lessons (requires meditations for relationships)
    console.log('\n4/4 Seeding storyblok lessons...')
    await StoryblokImporter.runFromMigration(payload)
    console.log('✓ Storyblok seeding complete')

    console.log('\n✅ Content seeding complete!')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`\n❌ Content seeding failed: ${message}`)
    throw error // Re-throw to fail the migration
  }
}

export async function down({ payload: _payload }: MigrateDownArgs): Promise<void> {
  // Seeding is idempotent - down migration is a no-op
  // Content can be manually deleted if needed
  console.log('Seed migration down - no action taken (content preserved)')
}
