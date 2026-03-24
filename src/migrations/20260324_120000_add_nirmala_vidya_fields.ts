import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`lectures\` ADD \`nirmala_vidya_vimeo_url\` text;`)
  await db.run(sql`ALTER TABLE \`lectures\` ADD \`last_refreshed\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`lectures\` DROP COLUMN \`nirmala_vidya_vimeo_url\`;`)
  await db.run(sql`ALTER TABLE \`lectures\` DROP COLUMN \`last_refreshed\`;`)
}
