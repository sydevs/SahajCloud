import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`lectures_locales\` ADD \`subtitles_url\` text;`)
  await db.run(sql`ALTER TABLE \`lectures\` DROP COLUMN \`subtitles_url\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`lectures\` ADD \`subtitles_url\` text;`)
  await db.run(sql`ALTER TABLE \`lectures_locales\` DROP COLUMN \`subtitles_url\`;`)
}
