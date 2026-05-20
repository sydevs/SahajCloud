import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`wm_app_status\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`wm_app_status_locales\` (
  	\`baseline_country\` text DEFAULT 'GB' NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`wm_app_status\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`wm_app_status_locales_locale_parent_id_unique\` ON \`wm_app_status_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`wm_app_status_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`app_cards_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`wm_app_status\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`app_cards_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`wm_app_status_rels_order_idx\` ON \`wm_app_status_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_status_rels_parent_idx\` ON \`wm_app_status_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_status_rels_path_idx\` ON \`wm_app_status_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_status_rels_app_cards_id_idx\` ON \`wm_app_status_rels\` (\`app_cards_id\`);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`classes_page_id\` integer REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`live_meditations_page_id\` integer REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`techniques_page_id\` integer REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`lectures_page_id\` integer REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`privacy_page_id\` integer REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`terms_page_id\` integer REFERENCES pages(id);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_classes_page_idx\` ON \`wm_app_config\` (\`classes_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_live_meditations_page_idx\` ON \`wm_app_config\` (\`live_meditations_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_techniques_page_idx\` ON \`wm_app_config\` (\`techniques_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_lectures_page_idx\` ON \`wm_app_config\` (\`lectures_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_privacy_page_idx\` ON \`wm_app_config\` (\`privacy_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_terms_page_idx\` ON \`wm_app_config\` (\`terms_page_id\`);`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`last_reviewed_at\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_last_reviewed_at\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`wm_app_status\`;`)
  await db.run(sql`DROP TABLE \`wm_app_status_locales\`;`)
  await db.run(sql`DROP TABLE \`wm_app_status_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_wm_app_config\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`INSERT INTO \`__new_wm_app_config\`("id", "updated_at", "created_at") SELECT "id", "updated_at", "created_at" FROM \`wm_app_config\`;`)
  await db.run(sql`DROP TABLE \`wm_app_config\`;`)
  await db.run(sql`ALTER TABLE \`__new_wm_app_config\` RENAME TO \`wm_app_config\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`last_reviewed_at\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_last_reviewed_at\`;`)
}
