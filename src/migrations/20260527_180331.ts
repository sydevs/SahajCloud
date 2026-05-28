import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`wm_web_translations_locales\` DROP COLUMN \`last_reviewed_at\`;`)
  await db.run(sql`ALTER TABLE \`_wm_web_translations_v_locales\` DROP COLUMN \`version_last_reviewed_at\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`last_reviewed_at\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_last_reviewed_at\`;`)
  await db.run(sql`ALTER TABLE \`sy_atlas_translations_locales\` DROP COLUMN \`last_reviewed_at\`;`)
  await db.run(sql`ALTER TABLE \`_sy_atlas_translations_v_locales\` DROP COLUMN \`version_last_reviewed_at\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`wm_web_translations_locales\` ADD \`last_reviewed_at\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_web_translations_v_locales\` ADD \`version_last_reviewed_at\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`last_reviewed_at\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_last_reviewed_at\` text;`)
  await db.run(sql`ALTER TABLE \`sy_atlas_translations_locales\` ADD \`last_reviewed_at\` text;`)
  await db.run(sql`ALTER TABLE \`_sy_atlas_translations_v_locales\` ADD \`version_last_reviewed_at\` text;`)
}
