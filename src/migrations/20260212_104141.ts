import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`app_cards_target_sections\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`app_cards_target_sections_order_idx\` ON \`app_cards_target_sections\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_target_sections_parent_idx\` ON \`app_cards_target_sections\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_app_cards_v_version_target_sections\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_app_cards_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_target_sections_order_idx\` ON \`_app_cards_v_version_target_sections\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_version_target_sections_parent_idx\` ON \`_app_cards_v_version_target_sections\` (\`parent_id\`);`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`countdown\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_countdown\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_url\`;`)
  await db.run(sql`ALTER TABLE \`meditations\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` DROP COLUMN \`version_url\`;`)
  await db.run(sql`ALTER TABLE \`songs\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`videos\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`frames\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`images\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`files\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` DROP COLUMN \`url\`;`)
  await db.run(sql`ALTER TABLE \`song_tags\` DROP COLUMN \`url\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`app_cards_target_sections\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v_version_target_sections\`;`)
  await db.run(sql`ALTER TABLE \`meditations\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` ADD \`version_url\` text;`)
  await db.run(sql`ALTER TABLE \`songs\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`albums\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`videos\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`images\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`files\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`meditation_tags\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`song_tags\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`app_cards\` DROP COLUMN \`countdown\`;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` ADD \`version_url\` text;`)
  await db.run(sql`ALTER TABLE \`_app_cards_v\` DROP COLUMN \`version_countdown\`;`)
}
