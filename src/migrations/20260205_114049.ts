import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`rules\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`weight\` numeric DEFAULT 3;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_rules\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_weight\` numeric DEFAULT 3;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`rules\`;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`weight\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_rules\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_weight\`;`)
}
