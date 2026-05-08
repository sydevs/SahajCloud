import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`_app_cards_v_version_starting_soon_version_starting_soon_idx\`;`)
  await db.run(sql`DROP INDEX \`_app_cards_v_version_starting_soon_version_starting_so_1_idx\`;`)
  await db.run(sql`DROP INDEX \`_app_cards_v_version_starting_soon_version_starting_so_2_idx\`;`)
  await db.run(sql`DROP INDEX \`_app_cards_v_version_starting_soon_version_starting_so_3_idx\`;`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_soon_idx\` ON \`_app_cards_v\` (\`version_starting_soon_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_so_1_idx\` ON \`_app_cards_v\` (\`version_starting_soon_album_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_so_2_idx\` ON \`_app_cards_v\` (\`version_starting_soon_meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_so_3_idx\` ON \`_app_cards_v\` (\`version_starting_soon_image_id\`);`)
  await db.run(sql`ALTER TABLE \`audiences\` DROP COLUMN \`type\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`_app_cards_v_version_starting_soon_version_starting_soon_idx\`;`)
  await db.run(sql`DROP INDEX \`_app_cards_v_version_starting_soon_version_starting_so_1_idx\`;`)
  await db.run(sql`DROP INDEX \`_app_cards_v_version_starting_soon_version_starting_so_2_idx\`;`)
  await db.run(sql`DROP INDEX \`_app_cards_v_version_starting_soon_version_starting_so_3_idx\`;`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_soon_idx\` ON \`_app_cards_v\` (\`version_starting_soon_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_so_1_idx\` ON \`_app_cards_v\` (\`version_starting_soon_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_so_2_idx\` ON \`_app_cards_v\` (\`version_starting_soon_album_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_starting_soon_version_starting_so_3_idx\` ON \`_app_cards_v\` (\`version_starting_soon_meditation_id\`);`)
  await db.run(sql`ALTER TABLE \`audiences\` ADD \`type\` text DEFAULT 'progress' NOT NULL;`)
}
