import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`app_cards_locales\` ADD \`header\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` ADD \`version_header\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`app_cards_locales\` DROP COLUMN \`header\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_locales\` DROP COLUMN \`version_header\`;`)
}
