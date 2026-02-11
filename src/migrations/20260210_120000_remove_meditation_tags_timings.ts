import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Migration: Remove timings field from MeditationTags
 *
 * The timings field on meditation-tags is being removed in favor of
 * dynamic computation via the /by-timing/:timing endpoint which
 * queries meditations.timings field instead.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Drop the meditation_tags_timings junction table (hasMany select stored as separate table)
  await db.run(sql`DROP TABLE IF EXISTS \`meditation_tags_timings\`;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Recreate the timings junction table
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`meditation_tags_timings\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`meditation_tags_timings_order_idx\` ON \`meditation_tags_timings\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`meditation_tags_timings_parent_idx\` ON \`meditation_tags_timings\` (\`parent_id\`);`,
  )
}
