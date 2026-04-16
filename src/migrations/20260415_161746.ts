import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`overlay\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_overlay\` integer DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`overlay\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_overlay\`;`)
}
