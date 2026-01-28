import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`wm_web_config\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`home_page_id\` integer NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`home_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`wm_web_config_home_page_idx\` ON \`wm_web_config\` (\`home_page_id\`);`)
  await db.run(sql`CREATE TABLE \`wm_web_config_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`wm_web_config\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`wm_web_config_rels_order_idx\` ON \`wm_web_config_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`wm_web_config_rels_parent_idx\` ON \`wm_web_config_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_web_config_rels_path_idx\` ON \`wm_web_config_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`wm_web_config_rels_pages_id_idx\` ON \`wm_web_config_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE TABLE \`wm_web_translations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`wm_web_translations_locales\` (
  	\`strings\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`wm_web_translations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`wm_web_translations_locales_locale_parent_id_unique\` ON \`wm_web_translations_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_wm_web_translations_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_wm_web_translations_v_created_at_idx\` ON \`_wm_web_translations_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_wm_web_translations_v_updated_at_idx\` ON \`_wm_web_translations_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_wm_web_translations_v_locales\` (
  	\`version_strings\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_wm_web_translations_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_wm_web_translations_v_locales_locale_parent_id_unique\` ON \`_wm_web_translations_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`wm_app_config\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`wm_app_translations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`wm_app_translations_locales\` (
  	\`strings\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`wm_app_translations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`wm_app_translations_locales_locale_parent_id_unique\` ON \`wm_app_translations_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_wm_app_translations_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_wm_app_translations_v_created_at_idx\` ON \`_wm_app_translations_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_wm_app_translations_v_updated_at_idx\` ON \`_wm_app_translations_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_wm_app_translations_v_locales\` (
  	\`version_strings\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_wm_app_translations_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_wm_app_translations_v_locales_locale_parent_id_unique\` ON \`_wm_app_translations_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`sy_atlas_config\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`default_map_center_latitude\` numeric DEFAULT 0 NOT NULL,
  	\`default_map_center_longitude\` numeric DEFAULT 0 NOT NULL,
  	\`default_zoom_level\` numeric DEFAULT 10,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`sy_atlas_translations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`sy_atlas_translations_locales\` (
  	\`strings\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`sy_atlas_translations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`sy_atlas_translations_locales_locale_parent_id_unique\` ON \`sy_atlas_translations_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_sy_atlas_translations_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_sy_atlas_translations_v_created_at_idx\` ON \`_sy_atlas_translations_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_sy_atlas_translations_v_updated_at_idx\` ON \`_sy_atlas_translations_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_sy_atlas_translations_v_locales\` (
  	\`version_strings\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_sy_atlas_translations_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_sy_atlas_translations_v_locales_locale_parent_id_unique\` ON \`_sy_atlas_translations_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`we_meditate_web_settings\`;`)
  await db.run(sql`DROP TABLE \`we_meditate_web_settings_rels\`;`)
  await db.run(sql`DROP TABLE \`we_meditate_app_settings\`;`)
  await db.run(sql`DROP TABLE \`we_meditate_app_settings_rels\`;`)
  await db.run(sql`DROP TABLE \`sahaj_atlas_settings\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`we_meditate_web_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`home_page_id\` integer NOT NULL,
  	\`music_page_id\` integer NOT NULL,
  	\`subtle_system_page_id\` integer NOT NULL,
  	\`left_id\` integer NOT NULL,
  	\`right_id\` integer NOT NULL,
  	\`center_id\` integer NOT NULL,
  	\`mooladhara_id\` integer NOT NULL,
  	\`kundalini_id\` integer NOT NULL,
  	\`swadhistan_id\` integer NOT NULL,
  	\`nabhi_id\` integer NOT NULL,
  	\`void_id\` integer NOT NULL,
  	\`anahat_id\` integer NOT NULL,
  	\`vishuddhi_id\` integer NOT NULL,
  	\`agnya_id\` integer NOT NULL,
  	\`sahasrara_id\` integer NOT NULL,
  	\`techniques_page_id\` integer NOT NULL,
  	\`inspiration_page_id\` integer NOT NULL,
  	\`classes_page_id\` integer NOT NULL,
  	\`live_meditations_page_id\` integer NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`home_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`music_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`subtle_system_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`left_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`right_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`center_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`mooladhara_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`kundalini_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`swadhistan_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`nabhi_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`void_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`anahat_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`vishuddhi_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`agnya_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`sahasrara_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`techniques_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`inspiration_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`classes_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`live_meditations_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_home_page_idx\` ON \`we_meditate_web_settings\` (\`home_page_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_music_page_idx\` ON \`we_meditate_web_settings\` (\`music_page_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_subtle_system_page_idx\` ON \`we_meditate_web_settings\` (\`subtle_system_page_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_left_idx\` ON \`we_meditate_web_settings\` (\`left_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_right_idx\` ON \`we_meditate_web_settings\` (\`right_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_center_idx\` ON \`we_meditate_web_settings\` (\`center_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_mooladhara_idx\` ON \`we_meditate_web_settings\` (\`mooladhara_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_kundalini_idx\` ON \`we_meditate_web_settings\` (\`kundalini_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_swadhistan_idx\` ON \`we_meditate_web_settings\` (\`swadhistan_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_nabhi_idx\` ON \`we_meditate_web_settings\` (\`nabhi_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_void_idx\` ON \`we_meditate_web_settings\` (\`void_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_anahat_idx\` ON \`we_meditate_web_settings\` (\`anahat_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_vishuddhi_idx\` ON \`we_meditate_web_settings\` (\`vishuddhi_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_agnya_idx\` ON \`we_meditate_web_settings\` (\`agnya_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_sahasrara_idx\` ON \`we_meditate_web_settings\` (\`sahasrara_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_techniques_page_idx\` ON \`we_meditate_web_settings\` (\`techniques_page_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_inspiration_page_idx\` ON \`we_meditate_web_settings\` (\`inspiration_page_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_classes_page_idx\` ON \`we_meditate_web_settings\` (\`classes_page_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_live_meditations_page_idx\` ON \`we_meditate_web_settings\` (\`live_meditations_page_id\`);`)
  await db.run(sql`CREATE TABLE \`we_meditate_web_settings_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`we_meditate_web_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_rels_order_idx\` ON \`we_meditate_web_settings_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_rels_parent_idx\` ON \`we_meditate_web_settings_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_rels_path_idx\` ON \`we_meditate_web_settings_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_rels_pages_id_idx\` ON \`we_meditate_web_settings_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE TABLE \`we_meditate_app_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`app_version\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`we_meditate_app_settings_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`meditations_id\` integer,
  	\`lessons_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`we_meditate_app_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lessons_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`we_meditate_app_settings_rels_order_idx\` ON \`we_meditate_app_settings_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_app_settings_rels_parent_idx\` ON \`we_meditate_app_settings_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_app_settings_rels_path_idx\` ON \`we_meditate_app_settings_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_app_settings_rels_meditations_id_idx\` ON \`we_meditate_app_settings_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_app_settings_rels_lessons_id_idx\` ON \`we_meditate_app_settings_rels\` (\`lessons_id\`);`)
  await db.run(sql`CREATE TABLE \`sahaj_atlas_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`atlas_version\` text,
  	\`default_map_center_latitude\` numeric DEFAULT 0 NOT NULL,
  	\`default_map_center_longitude\` numeric DEFAULT 0 NOT NULL,
  	\`default_zoom_level\` numeric DEFAULT 10,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`DROP TABLE \`wm_web_config\`;`)
  await db.run(sql`DROP TABLE \`wm_web_config_rels\`;`)
  await db.run(sql`DROP TABLE \`wm_web_translations\`;`)
  await db.run(sql`DROP TABLE \`wm_web_translations_locales\`;`)
  await db.run(sql`DROP TABLE \`_wm_web_translations_v\`;`)
  await db.run(sql`DROP TABLE \`_wm_web_translations_v_locales\`;`)
  await db.run(sql`DROP TABLE \`wm_app_config\`;`)
  await db.run(sql`DROP TABLE \`wm_app_translations\`;`)
  await db.run(sql`DROP TABLE \`wm_app_translations_locales\`;`)
  await db.run(sql`DROP TABLE \`_wm_app_translations_v\`;`)
  await db.run(sql`DROP TABLE \`_wm_app_translations_v_locales\`;`)
  await db.run(sql`DROP TABLE \`sy_atlas_config\`;`)
  await db.run(sql`DROP TABLE \`sy_atlas_translations\`;`)
  await db.run(sql`DROP TABLE \`sy_atlas_translations_locales\`;`)
  await db.run(sql`DROP TABLE \`_sy_atlas_translations_v\`;`)
  await db.run(sql`DROP TABLE \`_sy_atlas_translations_v_locales\`;`)
}
