import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`lecture_clips_subtitles\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`locale\` text NOT NULL,
  	\`url\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`lecture_clips_subtitles_order_idx\` ON \`lecture_clips_subtitles\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_subtitles_parent_id_idx\` ON \`lecture_clips_subtitles\` (\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`lectures\` ADD \`metadata\` text;`)
  await db.run(sql`ALTER TABLE \`lectures\` DROP COLUMN \`video_url\`;`)
  await db.run(sql`ALTER TABLE \`lectures_locales\` DROP COLUMN \`subtitles_url\`;`)
  await db.run(sql`ALTER TABLE \`lecture_clips_locales\` DROP COLUMN \`subtitles_url\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`lecture_clips_subtitles\`;`)
  await db.run(sql`ALTER TABLE \`lectures\` ADD \`video_url\` text;`)
  await db.run(sql`ALTER TABLE \`lectures\` DROP COLUMN \`metadata\`;`)
  await db.run(sql`ALTER TABLE \`lectures_locales\` ADD \`subtitles_url\` text;`)
  await db.run(sql`ALTER TABLE \`lecture_clips_locales\` ADD \`subtitles_url\` text;`)
}
