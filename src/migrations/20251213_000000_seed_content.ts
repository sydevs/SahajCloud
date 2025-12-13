/* eslint-disable no-console */
import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-d1-sqlite'

import { MeditationsImporter } from '../../imports/meditations/import'
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
 *
 * This migration is idempotent - all importers use natural key upserts,
 * so it's safe to re-run multiple times.
 */
export async function up({ payload }: MigrateUpArgs): Promise<void> {
  console.log('Seeding content from legacy databases...')

  // 1. Seed tags first (required by meditations)
  console.log('\n1/3 Seeding tags...')
  await TagsImporter.runFromMigration(payload)

  // 2. Seed wemeditate data (creates albums, authors, pages)
  console.log('\n2/3 Seeding wemeditate data...')
  await WeMeditateImporter.runFromMigration(payload)

  // 3. Seed meditations (requires tags and albums)
  console.log('\n3/3 Seeding meditations...')
  await MeditationsImporter.runFromMigration(payload)

  console.log('\n✅ Content seeding complete!')
}

export async function down({ payload: _payload }: MigrateDownArgs): Promise<void> {
  // Seeding is idempotent - down migration is a no-op
  // Content can be manually deleted if needed
  console.log('Seed migration down - no action taken (content preserved)')
}
