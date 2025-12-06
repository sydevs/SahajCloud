import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`pages\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`slug_lock\` integer DEFAULT true,
  	\`author_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`author_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`pages_slug_idx\` ON \`pages\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`pages_author_idx\` ON \`pages\` (\`author_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_updated_at_idx\` ON \`pages\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`pages_created_at_idx\` ON \`pages\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`pages_deleted_at_idx\` ON \`pages\` (\`deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`pages__status_idx\` ON \`pages\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`pages_locales\` (
  	\`title\` text,
  	\`content\` text,
  	\`meta_title\` text,
  	\`meta_description\` text,
  	\`meta_image_id\` integer,
  	\`publish_at\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`meta_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`pages_meta_meta_image_idx\` ON \`pages_locales\` (\`meta_image_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`pages_locales_locale_parent_id_unique\` ON \`pages_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`pages_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`page_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`page_tags_id\`) REFERENCES \`page_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`pages_rels_order_idx\` ON \`pages_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`pages_rels_parent_idx\` ON \`pages_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_rels_path_idx\` ON \`pages_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`pages_rels_page_tags_id_idx\` ON \`pages_rels\` (\`page_tags_id\`);`)
  await db.run(sql`CREATE TABLE \`_pages_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_slug\` text,
  	\`version_slug_lock\` integer DEFAULT true,
  	\`version_author_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version_deleted_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_author_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_pages_v_parent_idx\` ON \`_pages_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version_slug_idx\` ON \`_pages_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version_author_idx\` ON \`_pages_v\` (\`version_author_id\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version_updated_at_idx\` ON \`_pages_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version_created_at_idx\` ON \`_pages_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version_deleted_at_idx\` ON \`_pages_v\` (\`version_deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_version__status_idx\` ON \`_pages_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_created_at_idx\` ON \`_pages_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_updated_at_idx\` ON \`_pages_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_snapshot_idx\` ON \`_pages_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_published_locale_idx\` ON \`_pages_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_latest_idx\` ON \`_pages_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_pages_v_locales\` (
  	\`version_title\` text,
  	\`version_content\` text,
  	\`version_meta_title\` text,
  	\`version_meta_description\` text,
  	\`version_meta_image_id\` integer,
  	\`version_publish_at\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`version_meta_image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_pages_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_pages_v_version_meta_version_meta_image_idx\` ON \`_pages_v_locales\` (\`version_meta_image_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`_pages_v_locales_locale_parent_id_unique\` ON \`_pages_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_pages_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`page_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_pages_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`page_tags_id\`) REFERENCES \`page_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_pages_v_rels_order_idx\` ON \`_pages_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_rels_parent_idx\` ON \`_pages_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_rels_path_idx\` ON \`_pages_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_pages_v_rels_page_tags_id_idx\` ON \`_pages_v_rels\` (\`page_tags_id\`);`)
  await db.run(sql`CREATE TABLE \`meditations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	\`locale\` text DEFAULT 'en' NOT NULL,
  	\`narrator_id\` integer NOT NULL,
  	\`music_tag_id\` integer,
  	\`file_metadata\` text,
  	\`duration_minutes\` numeric,
  	\`publish_at\` text,
  	\`title\` text,
  	\`slug\` text,
  	\`slug_lock\` integer DEFAULT true,
  	\`thumbnail_id\` integer,
  	\`frames\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`narrator_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`music_tag_id\`) REFERENCES \`music_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`meditations_narrator_idx\` ON \`meditations\` (\`narrator_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_music_tag_idx\` ON \`meditations\` (\`music_tag_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditations_slug_idx\` ON \`meditations\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditations_thumbnail_idx\` ON \`meditations\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_updated_at_idx\` ON \`meditations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations_created_at_idx\` ON \`meditations\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations_deleted_at_idx\` ON \`meditations\` (\`deleted_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditations_filename_idx\` ON \`meditations\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`meditations_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`meditation_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditation_tags_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`meditations_rels_order_idx\` ON \`meditations_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`meditations_rels_parent_idx\` ON \`meditations_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_rels_path_idx\` ON \`meditations_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`meditations_rels_meditation_tags_id_idx\` ON \`meditations_rels\` (\`meditation_tags_id\`);`)
  await db.run(sql`CREATE TABLE \`lessons_blocks_cover\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`quote\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`lessons_blocks_cover_order_idx\` ON \`lessons_blocks_cover\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_cover_parent_id_idx\` ON \`lessons_blocks_cover\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_cover_path_idx\` ON \`lessons_blocks_cover\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`lessons_blocks_video\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`video_id\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`video_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_order_idx\` ON \`lessons_blocks_video\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_parent_id_idx\` ON \`lessons_blocks_video\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_path_idx\` ON \`lessons_blocks_video\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_video_idx\` ON \`lessons_blocks_video\` (\`video_id\`);`)
  await db.run(sql`CREATE TABLE \`lessons_blocks_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`text\` text,
  	\`image_id\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_order_idx\` ON \`lessons_blocks_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_parent_id_idx\` ON \`lessons_blocks_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_path_idx\` ON \`lessons_blocks_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_image_idx\` ON \`lessons_blocks_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`lessons\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`meditation_id\` integer,
  	\`intro_audio_id\` integer,
  	\`intro_subtitles\` text,
  	\`unit\` text,
  	\`step\` numeric,
  	\`icon_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`intro_audio_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`icon_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`lessons_meditation_idx\` ON \`lessons\` (\`meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_intro_audio_idx\` ON \`lessons\` (\`intro_audio_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_icon_idx\` ON \`lessons\` (\`icon_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_updated_at_idx\` ON \`lessons\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons_created_at_idx\` ON \`lessons\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons_deleted_at_idx\` ON \`lessons\` (\`deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons__status_idx\` ON \`lessons\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`lessons_locales\` (
  	\`article\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`lessons_locales_locale_parent_id_unique\` ON \`lessons_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_lessons_v_blocks_cover\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`quote\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_lessons_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_cover_order_idx\` ON \`_lessons_v_blocks_cover\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_cover_parent_id_idx\` ON \`_lessons_v_blocks_cover\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_cover_path_idx\` ON \`_lessons_v_blocks_cover\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_lessons_v_blocks_video\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`video_id\` integer,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`video_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_lessons_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_order_idx\` ON \`_lessons_v_blocks_video\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_parent_id_idx\` ON \`_lessons_v_blocks_video\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_path_idx\` ON \`_lessons_v_blocks_video\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_video_idx\` ON \`_lessons_v_blocks_video\` (\`video_id\`);`)
  await db.run(sql`CREATE TABLE \`_lessons_v_blocks_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`text\` text,
  	\`image_id\` integer,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_lessons_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_order_idx\` ON \`_lessons_v_blocks_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_parent_id_idx\` ON \`_lessons_v_blocks_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_path_idx\` ON \`_lessons_v_blocks_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_image_idx\` ON \`_lessons_v_blocks_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`_lessons_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_title\` text,
  	\`version_meditation_id\` integer,
  	\`version_intro_audio_id\` integer,
  	\`version_intro_subtitles\` text,
  	\`version_unit\` text,
  	\`version_step\` numeric,
  	\`version_icon_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version_deleted_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_intro_audio_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_icon_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_lessons_v_parent_idx\` ON \`_lessons_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_version_version_meditation_idx\` ON \`_lessons_v\` (\`version_meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_version_version_intro_audio_idx\` ON \`_lessons_v\` (\`version_intro_audio_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_version_version_icon_idx\` ON \`_lessons_v\` (\`version_icon_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_version_version_updated_at_idx\` ON \`_lessons_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_version_version_created_at_idx\` ON \`_lessons_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_version_version_deleted_at_idx\` ON \`_lessons_v\` (\`version_deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_version_version__status_idx\` ON \`_lessons_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_created_at_idx\` ON \`_lessons_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_updated_at_idx\` ON \`_lessons_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_snapshot_idx\` ON \`_lessons_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_published_locale_idx\` ON \`_lessons_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_latest_idx\` ON \`_lessons_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_lessons_v_locales\` (
  	\`version_article\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_lessons_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_lessons_v_locales_locale_parent_id_unique\` ON \`_lessons_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`music\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`slug_lock\` integer DEFAULT true,
  	\`file_metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`music_slug_idx\` ON \`music\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`music_updated_at_idx\` ON \`music\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`music_created_at_idx\` ON \`music\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`music_deleted_at_idx\` ON \`music\` (\`deleted_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`music_filename_idx\` ON \`music\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`music_locales\` (
  	\`title\` text NOT NULL,
  	\`credit\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`music\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`music_locales_locale_parent_id_unique\` ON \`music_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`music_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`music_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`music\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`music_tags_id\`) REFERENCES \`music_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`music_rels_order_idx\` ON \`music_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`music_rels_parent_idx\` ON \`music_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`music_rels_path_idx\` ON \`music_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`music_rels_music_tags_id_idx\` ON \`music_rels\` (\`music_tags_id\`);`)
  await db.run(sql`CREATE TABLE \`external_videos_category\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`external_videos\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`external_videos_category_order_idx\` ON \`external_videos_category\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`external_videos_category_parent_idx\` ON \`external_videos_category\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`external_videos\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`thumbnail_id\` integer NOT NULL,
  	\`video_url\` text NOT NULL,
  	\`subtitles_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`external_videos_thumbnail_idx\` ON \`external_videos\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`external_videos_updated_at_idx\` ON \`external_videos\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`external_videos_created_at_idx\` ON \`external_videos\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`external_videos_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`external_videos\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`external_videos_locales_locale_parent_id_unique\` ON \`external_videos_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`frames_tags\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`frames\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`frames_tags_order_idx\` ON \`frames_tags\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`frames_tags_parent_idx\` ON \`frames_tags\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`frames\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`image_set\` text NOT NULL,
  	\`category\` text NOT NULL,
  	\`duration\` numeric,
  	\`file_metadata\` text DEFAULT '{}',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`CREATE INDEX \`frames_updated_at_idx\` ON \`frames\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`frames_created_at_idx\` ON \`frames\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`frames_filename_idx\` ON \`frames\` (\`filename\`);`)
  await db.run(sql`CREATE INDEX \`imageSet_idx\` ON \`frames\` (\`image_set\`);`)
  await db.run(sql`CREATE TABLE \`narrators\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`gender\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`narrators_updated_at_idx\` ON \`narrators\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`narrators_created_at_idx\` ON \`narrators\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`authors\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`country_code\` text,
  	\`years_meditating\` numeric,
  	\`image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`authors_image_idx\` ON \`authors\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`authors_updated_at_idx\` ON \`authors\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`authors_created_at_idx\` ON \`authors\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`authors_locales\` (
  	\`name\` text NOT NULL,
  	\`title\` text,
  	\`description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`authors_locales_locale_parent_id_unique\` ON \`authors_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`images\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`file_metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`CREATE INDEX \`images_updated_at_idx\` ON \`images\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`images_created_at_idx\` ON \`images\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`images_filename_idx\` ON \`images\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`images_locales\` (
  	\`alt\` text NOT NULL,
  	\`credit\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`images_locales_locale_parent_id_unique\` ON \`images_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`images_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_tags_id\`) REFERENCES \`media_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`images_rels_order_idx\` ON \`images_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`images_rels_parent_idx\` ON \`images_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`images_rels_path_idx\` ON \`images_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`images_rels_media_tags_id_idx\` ON \`images_rels\` (\`media_tags_id\`);`)
  await db.run(sql`CREATE TABLE \`files\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`CREATE INDEX \`files_updated_at_idx\` ON \`files\` (\`updated_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`files_filename_idx\` ON \`files\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`files_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lessons_id\` integer,
  	\`frames_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lessons_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`frames_id\`) REFERENCES \`frames\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`files_rels_order_idx\` ON \`files_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`files_rels_parent_idx\` ON \`files_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`files_rels_path_idx\` ON \`files_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`files_rels_lessons_id_idx\` ON \`files_rels\` (\`lessons_id\`);`)
  await db.run(sql`CREATE INDEX \`files_rels_frames_id_idx\` ON \`files_rels\` (\`frames_id\`);`)
  await db.run(sql`CREATE TABLE \`media_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`media_tags_updated_at_idx\` ON \`media_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_tags_created_at_idx\` ON \`media_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`media_tags_locales\` (
  	\`name\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`media_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`media_tags_locales_locale_parent_id_unique\` ON \`media_tags_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`meditation_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`meditation_tags_updated_at_idx\` ON \`meditation_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_created_at_idx\` ON \`meditation_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`meditation_tags_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_locales_locale_parent_id_unique\` ON \`meditation_tags_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`music_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`music_tags_updated_at_idx\` ON \`music_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`music_tags_created_at_idx\` ON \`music_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`music_tags_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`music_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`music_tags_locales_locale_parent_id_unique\` ON \`music_tags_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`page_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`page_tags_updated_at_idx\` ON \`page_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`page_tags_created_at_idx\` ON \`page_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`page_tags_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`page_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`page_tags_locales_locale_parent_id_unique\` ON \`page_tags_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`managers_roles\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`locale\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`managers_roles_order_idx\` ON \`managers_roles\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`managers_roles_parent_idx\` ON \`managers_roles\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`managers_roles_locale_idx\` ON \`managers_roles\` (\`locale\`);`)
  await db.run(sql`CREATE TABLE \`managers_sessions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`created_at\` text,
  	\`expires_at\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`managers_sessions_order_idx\` ON \`managers_sessions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`managers_sessions_parent_id_idx\` ON \`managers_sessions\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`managers\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`current_project\` text,
  	\`type\` text DEFAULT 'manager' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`_verified\` integer,
  	\`_verificationtoken\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`managers_updated_at_idx\` ON \`managers\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`managers_created_at_idx\` ON \`managers\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`managers_email_idx\` ON \`managers\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`managers_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`managers_rels_order_idx\` ON \`managers_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`managers_rels_parent_idx\` ON \`managers_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`managers_rels_path_idx\` ON \`managers_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`managers_rels_pages_id_idx\` ON \`managers_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE TABLE \`clients_roles\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`clients_roles_order_idx\` ON \`clients_roles\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`clients_roles_parent_idx\` ON \`clients_roles\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`clients\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`notes\` text,
  	\`primary_contact_id\` integer NOT NULL,
  	\`domains\` text,
  	\`active\` integer DEFAULT true,
  	\`key_generated_at\` text,
  	\`usage_stats_total_requests\` numeric DEFAULT 0,
  	\`usage_stats_daily_requests\` numeric DEFAULT 0,
  	\`usage_stats_max_daily_requests\` numeric DEFAULT 0,
  	\`usage_stats_last_request_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`enable_a_p_i_key\` integer,
  	\`api_key\` text,
  	\`api_key_index\` text,
  	FOREIGN KEY (\`primary_contact_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`clients_primary_contact_idx\` ON \`clients\` (\`primary_contact_id\`);`)
  await db.run(sql`CREATE INDEX \`clients_updated_at_idx\` ON \`clients\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`clients_created_at_idx\` ON \`clients\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`active_idx\` ON \`clients\` (\`active\`);`)
  await db.run(sql`CREATE TABLE \`clients_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`managers_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`managers_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`clients_rels_order_idx\` ON \`clients_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`clients_rels_parent_idx\` ON \`clients_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`clients_rels_path_idx\` ON \`clients_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`clients_rels_managers_id_idx\` ON \`clients_rels\` (\`managers_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_checkbox\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`width\` numeric,
  	\`required\` integer,
  	\`default_value\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_blocks_checkbox_order_idx\` ON \`forms_blocks_checkbox\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_checkbox_parent_id_idx\` ON \`forms_blocks_checkbox\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_checkbox_path_idx\` ON \`forms_blocks_checkbox\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_checkbox_locales\` (
  	\`label\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_checkbox\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_blocks_checkbox_locales_locale_parent_id_unique\` ON \`forms_blocks_checkbox_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_country\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`width\` numeric,
  	\`required\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_blocks_country_order_idx\` ON \`forms_blocks_country\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_country_parent_id_idx\` ON \`forms_blocks_country\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_country_path_idx\` ON \`forms_blocks_country\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_country_locales\` (
  	\`label\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_country\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_blocks_country_locales_locale_parent_id_unique\` ON \`forms_blocks_country_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_email\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`width\` numeric,
  	\`required\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_blocks_email_order_idx\` ON \`forms_blocks_email\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_email_parent_id_idx\` ON \`forms_blocks_email\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_email_path_idx\` ON \`forms_blocks_email\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_email_locales\` (
  	\`label\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_email\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_blocks_email_locales_locale_parent_id_unique\` ON \`forms_blocks_email_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_message\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_blocks_message_order_idx\` ON \`forms_blocks_message\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_message_parent_id_idx\` ON \`forms_blocks_message\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_message_path_idx\` ON \`forms_blocks_message\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_message_locales\` (
  	\`message\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_message\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_blocks_message_locales_locale_parent_id_unique\` ON \`forms_blocks_message_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_number\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`width\` numeric,
  	\`default_value\` numeric,
  	\`required\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_blocks_number_order_idx\` ON \`forms_blocks_number\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_number_parent_id_idx\` ON \`forms_blocks_number\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_number_path_idx\` ON \`forms_blocks_number\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_number_locales\` (
  	\`label\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_number\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_blocks_number_locales_locale_parent_id_unique\` ON \`forms_blocks_number_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_select_options\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`value\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_select\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_blocks_select_options_order_idx\` ON \`forms_blocks_select_options\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_select_options_parent_id_idx\` ON \`forms_blocks_select_options\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_select_options_locales\` (
  	\`label\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_select_options\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_blocks_select_options_locales_locale_parent_id_unique\` ON \`forms_blocks_select_options_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_select\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`width\` numeric,
  	\`placeholder\` text,
  	\`required\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_blocks_select_order_idx\` ON \`forms_blocks_select\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_select_parent_id_idx\` ON \`forms_blocks_select\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_select_path_idx\` ON \`forms_blocks_select\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_select_locales\` (
  	\`label\` text,
  	\`default_value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_select\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_blocks_select_locales_locale_parent_id_unique\` ON \`forms_blocks_select_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_state\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`width\` numeric,
  	\`required\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_blocks_state_order_idx\` ON \`forms_blocks_state\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_state_parent_id_idx\` ON \`forms_blocks_state\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_state_path_idx\` ON \`forms_blocks_state\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_state_locales\` (
  	\`label\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_state\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_blocks_state_locales_locale_parent_id_unique\` ON \`forms_blocks_state_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`width\` numeric,
  	\`required\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_blocks_text_order_idx\` ON \`forms_blocks_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_text_parent_id_idx\` ON \`forms_blocks_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_text_path_idx\` ON \`forms_blocks_text\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_text_locales\` (
  	\`label\` text,
  	\`default_value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_text\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_blocks_text_locales_locale_parent_id_unique\` ON \`forms_blocks_text_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_textarea\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`width\` numeric,
  	\`required\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_blocks_textarea_order_idx\` ON \`forms_blocks_textarea\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_textarea_parent_id_idx\` ON \`forms_blocks_textarea\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`forms_blocks_textarea_path_idx\` ON \`forms_blocks_textarea\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`forms_blocks_textarea_locales\` (
  	\`label\` text,
  	\`default_value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_blocks_textarea\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_blocks_textarea_locales_locale_parent_id_unique\` ON \`forms_blocks_textarea_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_emails\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`email_to\` text,
  	\`cc\` text,
  	\`bcc\` text,
  	\`reply_to\` text,
  	\`email_from\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_emails_order_idx\` ON \`forms_emails\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`forms_emails_parent_id_idx\` ON \`forms_emails\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms_emails_locales\` (
  	\`subject\` text DEFAULT 'You''ve received a new message.' NOT NULL,
  	\`message\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms_emails\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_emails_locales_locale_parent_id_unique\` ON \`forms_emails_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`forms\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text NOT NULL,
  	\`confirmation_type\` text DEFAULT 'message',
  	\`redirect_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`forms_updated_at_idx\` ON \`forms\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`forms_created_at_idx\` ON \`forms\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`forms_locales\` (
  	\`submit_button_label\` text,
  	\`confirmation_message\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`forms_locales_locale_parent_id_unique\` ON \`forms_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`form_submissions_submission_data\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`field\` text NOT NULL,
  	\`value\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`form_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`form_submissions_submission_data_order_idx\` ON \`form_submissions_submission_data\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`form_submissions_submission_data_parent_id_idx\` ON \`form_submissions_submission_data\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`form_submissions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`form_id\` integer NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`form_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`form_submissions_form_idx\` ON \`form_submissions\` (\`form_id\`);`)
  await db.run(sql`CREATE INDEX \`form_submissions_updated_at_idx\` ON \`form_submissions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`form_submissions_created_at_idx\` ON \`form_submissions\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`CREATE TABLE \`payload_jobs_log\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`executed_at\` text NOT NULL,
  	\`completed_at\` text NOT NULL,
  	\`task_slug\` text NOT NULL,
  	\`task_i_d\` text NOT NULL,
  	\`input\` text,
  	\`output\` text,
  	\`state\` text NOT NULL,
  	\`error\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`payload_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_jobs_log_order_idx\` ON \`payload_jobs_log\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_log_parent_id_idx\` ON \`payload_jobs_log\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_jobs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`input\` text,
  	\`completed_at\` text,
  	\`total_tried\` numeric DEFAULT 0,
  	\`has_error\` integer DEFAULT false,
  	\`error\` text,
  	\`task_slug\` text,
  	\`queue\` text DEFAULT 'default',
  	\`wait_until\` text,
  	\`processing\` integer DEFAULT false,
  	\`meta\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_jobs_completed_at_idx\` ON \`payload_jobs\` (\`completed_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_total_tried_idx\` ON \`payload_jobs\` (\`total_tried\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_has_error_idx\` ON \`payload_jobs\` (\`has_error\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_task_slug_idx\` ON \`payload_jobs\` (\`task_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_queue_idx\` ON \`payload_jobs\` (\`queue\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_wait_until_idx\` ON \`payload_jobs\` (\`wait_until\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_processing_idx\` ON \`payload_jobs\` (\`processing\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_updated_at_idx\` ON \`payload_jobs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_created_at_idx\` ON \`payload_jobs\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`global_slug\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	\`meditations_id\` integer,
  	\`lessons_id\` integer,
  	\`music_id\` integer,
  	\`external_videos_id\` integer,
  	\`frames_id\` integer,
  	\`narrators_id\` integer,
  	\`authors_id\` integer,
  	\`images_id\` integer,
  	\`files_id\` integer,
  	\`media_tags_id\` integer,
  	\`meditation_tags_id\` integer,
  	\`music_tags_id\` integer,
  	\`page_tags_id\` integer,
  	\`managers_id\` integer,
  	\`clients_id\` integer,
  	\`forms_id\` integer,
  	\`form_submissions_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lessons_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`music_id\`) REFERENCES \`music\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`external_videos_id\`) REFERENCES \`external_videos\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`frames_id\`) REFERENCES \`frames\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`narrators_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`authors_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`images_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`files_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_tags_id\`) REFERENCES \`media_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditation_tags_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`music_tags_id\`) REFERENCES \`music_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`page_tags_id\`) REFERENCES \`page_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`managers_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`forms_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`form_submissions_id\`) REFERENCES \`form_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_meditations_id_idx\` ON \`payload_locked_documents_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lessons_id_idx\` ON \`payload_locked_documents_rels\` (\`lessons_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_music_id_idx\` ON \`payload_locked_documents_rels\` (\`music_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_external_videos_id_idx\` ON \`payload_locked_documents_rels\` (\`external_videos_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_frames_id_idx\` ON \`payload_locked_documents_rels\` (\`frames_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_narrators_id_idx\` ON \`payload_locked_documents_rels\` (\`narrators_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_authors_id_idx\` ON \`payload_locked_documents_rels\` (\`authors_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_images_id_idx\` ON \`payload_locked_documents_rels\` (\`images_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_files_id_idx\` ON \`payload_locked_documents_rels\` (\`files_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`media_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_meditation_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`meditation_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_music_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`music_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_page_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`page_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_managers_id_idx\` ON \`payload_locked_documents_rels\` (\`managers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`clients_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_forms_id_idx\` ON \`payload_locked_documents_rels\` (\`forms_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_form_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`form_submissions_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text,
  	\`value\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`managers_id\` integer,
  	\`clients_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`managers_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_managers_id_idx\` ON \`payload_preferences_rels\` (\`managers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_clients_id_idx\` ON \`payload_preferences_rels\` (\`clients_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`batch\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`)
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
  	\`technique_page_tag_id\` integer NOT NULL,
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
  	FOREIGN KEY (\`technique_page_tag_id\`) REFERENCES \`page_tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
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
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_technique_page_tag_idx\` ON \`we_meditate_web_settings\` (\`technique_page_tag_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_inspiration_page_idx\` ON \`we_meditate_web_settings\` (\`inspiration_page_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_classes_page_idx\` ON \`we_meditate_web_settings\` (\`classes_page_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_live_meditations_page_idx\` ON \`we_meditate_web_settings\` (\`live_meditations_page_id\`);`)
  await db.run(sql`CREATE TABLE \`we_meditate_web_settings_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	\`music_tags_id\` integer,
  	\`page_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`we_meditate_web_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`music_tags_id\`) REFERENCES \`music_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`page_tags_id\`) REFERENCES \`page_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_rels_order_idx\` ON \`we_meditate_web_settings_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_rels_parent_idx\` ON \`we_meditate_web_settings_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_rels_path_idx\` ON \`we_meditate_web_settings_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_rels_pages_id_idx\` ON \`we_meditate_web_settings_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_rels_music_tags_id_idx\` ON \`we_meditate_web_settings_rels\` (\`music_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`we_meditate_web_settings_rels_page_tags_id_idx\` ON \`we_meditate_web_settings_rels\` (\`page_tags_id\`);`)
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
  await db.run(sql`CREATE TABLE \`payload_jobs_stats\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`stats\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`pages\`;`)
  await db.run(sql`DROP TABLE \`pages_locales\`;`)
  await db.run(sql`DROP TABLE \`pages_rels\`;`)
  await db.run(sql`DROP TABLE \`_pages_v\`;`)
  await db.run(sql`DROP TABLE \`_pages_v_locales\`;`)
  await db.run(sql`DROP TABLE \`_pages_v_rels\`;`)
  await db.run(sql`DROP TABLE \`meditations\`;`)
  await db.run(sql`DROP TABLE \`meditations_rels\`;`)
  await db.run(sql`DROP TABLE \`lessons_blocks_cover\`;`)
  await db.run(sql`DROP TABLE \`lessons_blocks_video\`;`)
  await db.run(sql`DROP TABLE \`lessons_blocks_text\`;`)
  await db.run(sql`DROP TABLE \`lessons\`;`)
  await db.run(sql`DROP TABLE \`lessons_locales\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v_blocks_cover\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v_blocks_video\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v_blocks_text\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v_locales\`;`)
  await db.run(sql`DROP TABLE \`music\`;`)
  await db.run(sql`DROP TABLE \`music_locales\`;`)
  await db.run(sql`DROP TABLE \`music_rels\`;`)
  await db.run(sql`DROP TABLE \`external_videos_category\`;`)
  await db.run(sql`DROP TABLE \`external_videos\`;`)
  await db.run(sql`DROP TABLE \`external_videos_locales\`;`)
  await db.run(sql`DROP TABLE \`frames_tags\`;`)
  await db.run(sql`DROP TABLE \`frames\`;`)
  await db.run(sql`DROP TABLE \`narrators\`;`)
  await db.run(sql`DROP TABLE \`authors\`;`)
  await db.run(sql`DROP TABLE \`authors_locales\`;`)
  await db.run(sql`DROP TABLE \`images\`;`)
  await db.run(sql`DROP TABLE \`images_locales\`;`)
  await db.run(sql`DROP TABLE \`images_rels\`;`)
  await db.run(sql`DROP TABLE \`files\`;`)
  await db.run(sql`DROP TABLE \`files_rels\`;`)
  await db.run(sql`DROP TABLE \`media_tags\`;`)
  await db.run(sql`DROP TABLE \`media_tags_locales\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags_locales\`;`)
  await db.run(sql`DROP TABLE \`music_tags\`;`)
  await db.run(sql`DROP TABLE \`music_tags_locales\`;`)
  await db.run(sql`DROP TABLE \`page_tags\`;`)
  await db.run(sql`DROP TABLE \`page_tags_locales\`;`)
  await db.run(sql`DROP TABLE \`managers_roles\`;`)
  await db.run(sql`DROP TABLE \`managers_sessions\`;`)
  await db.run(sql`DROP TABLE \`managers\`;`)
  await db.run(sql`DROP TABLE \`managers_rels\`;`)
  await db.run(sql`DROP TABLE \`clients_roles\`;`)
  await db.run(sql`DROP TABLE \`clients\`;`)
  await db.run(sql`DROP TABLE \`clients_rels\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_checkbox\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_checkbox_locales\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_country\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_country_locales\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_email\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_email_locales\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_message\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_message_locales\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_number\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_number_locales\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_select_options\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_select_options_locales\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_select\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_select_locales\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_state\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_state_locales\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_text\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_text_locales\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_textarea\`;`)
  await db.run(sql`DROP TABLE \`forms_blocks_textarea_locales\`;`)
  await db.run(sql`DROP TABLE \`forms_emails\`;`)
  await db.run(sql`DROP TABLE \`forms_emails_locales\`;`)
  await db.run(sql`DROP TABLE \`forms\`;`)
  await db.run(sql`DROP TABLE \`forms_locales\`;`)
  await db.run(sql`DROP TABLE \`form_submissions_submission_data\`;`)
  await db.run(sql`DROP TABLE \`form_submissions\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`DROP TABLE \`payload_jobs_log\`;`)
  await db.run(sql`DROP TABLE \`payload_jobs\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_migrations\`;`)
  await db.run(sql`DROP TABLE \`we_meditate_web_settings\`;`)
  await db.run(sql`DROP TABLE \`we_meditate_web_settings_rels\`;`)
  await db.run(sql`DROP TABLE \`we_meditate_app_settings\`;`)
  await db.run(sql`DROP TABLE \`we_meditate_app_settings_rels\`;`)
  await db.run(sql`DROP TABLE \`sahaj_atlas_settings\`;`)
  await db.run(sql`DROP TABLE \`payload_jobs_stats\`;`)
}
