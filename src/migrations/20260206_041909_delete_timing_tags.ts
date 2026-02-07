import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Migration: Delete timing-based MeditationTags
 *
 * This migration deletes the 'morning', 'afternoon', and 'evening' MeditationTags
 * after they have been migrated to the timings field on meditations.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const timingTagSlugs = ['morning', 'afternoon', 'evening']

  // Find and delete timing tags
  const timingTags = await payload.find({
    collection: 'meditation-tags',
    where: { slug: { in: timingTagSlugs } },
    limit: 10,
    depth: 0,
  })

  for (const tag of timingTags.docs) {
    await payload.delete({
      collection: 'meditation-tags',
      id: tag.id,
    })
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Down migration would require re-creating the tags and re-associating them
  // This is a one-way migration - tags can be re-imported via seed script if needed
  console.warn('Timing tags deleted - run seeds/tags/import.ts to restore if needed')
}
