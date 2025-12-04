import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
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
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`DROP TABLE \`media_locales\`;`)
  await db.run(sql`DROP TABLE \`media_rels\`;`)
  await db.run(sql`DROP TABLE \`file_attachments\`;`)
  await db.run(sql`DROP TABLE \`file_attachments_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_pages_locales\` (
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
  await db.run(sql`INSERT INTO \`__new_pages_locales\`("title", "content", "meta_title", "meta_description", "meta_image_id", "publish_at", "id", "_locale", "_parent_id") SELECT "title", "content", "meta_title", "meta_description", "meta_image_id", "publish_at", "id", "_locale", "_parent_id" FROM \`pages_locales\`;`)
  await db.run(sql`DROP TABLE \`pages_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_pages_locales\` RENAME TO \`pages_locales\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`pages_meta_meta_image_idx\` ON \`pages_locales\` (\`meta_image_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`pages_locales_locale_parent_id_unique\` ON \`pages_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new__pages_v_locales\` (
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
  await db.run(sql`INSERT INTO \`__new__pages_v_locales\`("version_title", "version_content", "version_meta_title", "version_meta_description", "version_meta_image_id", "version_publish_at", "id", "_locale", "_parent_id") SELECT "version_title", "version_content", "version_meta_title", "version_meta_description", "version_meta_image_id", "version_publish_at", "id", "_locale", "_parent_id" FROM \`_pages_v_locales\`;`)
  await db.run(sql`DROP TABLE \`_pages_v_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new__pages_v_locales\` RENAME TO \`_pages_v_locales\`;`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_meta_version_meta_image_idx\` ON \`_pages_v_locales\` (\`version_meta_image_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`_pages_v_locales_locale_parent_id_unique\` ON \`_pages_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_meditations\` (
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
  await db.run(sql`INSERT INTO \`__new_meditations\`("id", "label", "locale", "narrator_id", "music_tag_id", "file_metadata", "duration_minutes", "publish_at", "title", "slug", "slug_lock", "thumbnail_id", "frames", "updated_at", "created_at", "deleted_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "label", "locale", "narrator_id", "music_tag_id", "file_metadata", "duration_minutes", "publish_at", "title", "slug", "slug_lock", "thumbnail_id", "frames", "updated_at", "created_at", "deleted_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditations\`;`)
  await db.run(sql`DROP TABLE \`meditations\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditations\` RENAME TO \`meditations\`;`)
  await db.run(sql`CREATE INDEX \`meditations_narrator_idx\` ON \`meditations\` (\`narrator_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_music_tag_idx\` ON \`meditations\` (\`music_tag_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditations_slug_idx\` ON \`meditations\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditations_thumbnail_idx\` ON \`meditations\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_updated_at_idx\` ON \`meditations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations_created_at_idx\` ON \`meditations\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations_deleted_at_idx\` ON \`meditations\` (\`deleted_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditations_filename_idx\` ON \`meditations\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_lessons_blocks_video\` (
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
  await db.run(sql`INSERT INTO \`__new_lessons_blocks_video\`("_order", "_parent_id", "_path", "id", "video_id", "block_name") SELECT "_order", "_parent_id", "_path", "id", "video_id", "block_name" FROM \`lessons_blocks_video\`;`)
  await db.run(sql`DROP TABLE \`lessons_blocks_video\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons_blocks_video\` RENAME TO \`lessons_blocks_video\`;`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_order_idx\` ON \`lessons_blocks_video\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_parent_id_idx\` ON \`lessons_blocks_video\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_path_idx\` ON \`lessons_blocks_video\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_video_idx\` ON \`lessons_blocks_video\` (\`video_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_lessons_blocks_text\` (
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
  await db.run(sql`INSERT INTO \`__new_lessons_blocks_text\`("_order", "_parent_id", "_path", "id", "title", "text", "image_id", "block_name") SELECT "_order", "_parent_id", "_path", "id", "title", "text", "image_id", "block_name" FROM \`lessons_blocks_text\`;`)
  await db.run(sql`DROP TABLE \`lessons_blocks_text\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons_blocks_text\` RENAME TO \`lessons_blocks_text\`;`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_order_idx\` ON \`lessons_blocks_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_parent_id_idx\` ON \`lessons_blocks_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_path_idx\` ON \`lessons_blocks_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_image_idx\` ON \`lessons_blocks_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_lessons\` (
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
  await db.run(sql`INSERT INTO \`__new_lessons\`("id", "title", "meditation_id", "intro_audio_id", "intro_subtitles", "unit", "step", "icon_id", "updated_at", "created_at", "deleted_at", "_status") SELECT "id", "title", "meditation_id", "intro_audio_id", "intro_subtitles", "unit", "step", "icon_id", "updated_at", "created_at", "deleted_at", "_status" FROM \`lessons\`;`)
  await db.run(sql`DROP TABLE \`lessons\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons\` RENAME TO \`lessons\`;`)
  await db.run(sql`CREATE INDEX \`lessons_meditation_idx\` ON \`lessons\` (\`meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_intro_audio_idx\` ON \`lessons\` (\`intro_audio_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_icon_idx\` ON \`lessons\` (\`icon_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_updated_at_idx\` ON \`lessons\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons_created_at_idx\` ON \`lessons\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons_deleted_at_idx\` ON \`lessons\` (\`deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons__status_idx\` ON \`lessons\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`__new__lessons_v_blocks_video\` (
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
  await db.run(sql`INSERT INTO \`__new__lessons_v_blocks_video\`("_order", "_parent_id", "_path", "id", "video_id", "_uuid", "block_name") SELECT "_order", "_parent_id", "_path", "id", "video_id", "_uuid", "block_name" FROM \`_lessons_v_blocks_video\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v_blocks_video\`;`)
  await db.run(sql`ALTER TABLE \`__new__lessons_v_blocks_video\` RENAME TO \`_lessons_v_blocks_video\`;`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_order_idx\` ON \`_lessons_v_blocks_video\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_parent_id_idx\` ON \`_lessons_v_blocks_video\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_path_idx\` ON \`_lessons_v_blocks_video\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_video_idx\` ON \`_lessons_v_blocks_video\` (\`video_id\`);`)
  await db.run(sql`CREATE TABLE \`__new__lessons_v_blocks_text\` (
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
  await db.run(sql`INSERT INTO \`__new__lessons_v_blocks_text\`("_order", "_parent_id", "_path", "id", "title", "text", "image_id", "_uuid", "block_name") SELECT "_order", "_parent_id", "_path", "id", "title", "text", "image_id", "_uuid", "block_name" FROM \`_lessons_v_blocks_text\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v_blocks_text\`;`)
  await db.run(sql`ALTER TABLE \`__new__lessons_v_blocks_text\` RENAME TO \`_lessons_v_blocks_text\`;`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_order_idx\` ON \`_lessons_v_blocks_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_parent_id_idx\` ON \`_lessons_v_blocks_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_path_idx\` ON \`_lessons_v_blocks_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_image_idx\` ON \`_lessons_v_blocks_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`__new__lessons_v\` (
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
  await db.run(sql`INSERT INTO \`__new__lessons_v\`("id", "parent_id", "version_title", "version_meditation_id", "version_intro_audio_id", "version_intro_subtitles", "version_unit", "version_step", "version_icon_id", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_title", "version_meditation_id", "version_intro_audio_id", "version_intro_subtitles", "version_unit", "version_step", "version_icon_id", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_lessons_v\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__lessons_v\` RENAME TO \`_lessons_v\`;`)
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
  await db.run(sql`CREATE TABLE \`__new_external_videos\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`thumbnail_id\` integer NOT NULL,
  	\`video_url\` text NOT NULL,
  	\`subtitles_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_external_videos\`("id", "thumbnail_id", "video_url", "subtitles_url", "updated_at", "created_at") SELECT "id", "thumbnail_id", "video_url", "subtitles_url", "updated_at", "created_at" FROM \`external_videos\`;`)
  await db.run(sql`DROP TABLE \`external_videos\`;`)
  await db.run(sql`ALTER TABLE \`__new_external_videos\` RENAME TO \`external_videos\`;`)
  await db.run(sql`CREATE INDEX \`external_videos_thumbnail_idx\` ON \`external_videos\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`external_videos_updated_at_idx\` ON \`external_videos\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`external_videos_created_at_idx\` ON \`external_videos\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_frames\` (
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
  await db.run(sql`INSERT INTO \`__new_frames\`("id", "image_set", "category", "duration", "file_metadata", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "image_set", "category", "duration", "file_metadata", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`frames\`;`)
  await db.run(sql`DROP TABLE \`frames\`;`)
  await db.run(sql`ALTER TABLE \`__new_frames\` RENAME TO \`frames\`;`)
  await db.run(sql`CREATE INDEX \`frames_updated_at_idx\` ON \`frames\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`frames_created_at_idx\` ON \`frames\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`frames_filename_idx\` ON \`frames\` (\`filename\`);`)
  await db.run(sql`CREATE INDEX \`imageSet_idx\` ON \`frames\` (\`image_set\`);`)
  await db.run(sql`CREATE TABLE \`__new_authors\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`country_code\` text,
  	\`years_meditating\` numeric,
  	\`image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_authors\`("id", "country_code", "years_meditating", "image_id", "updated_at", "created_at") SELECT "id", "country_code", "years_meditating", "image_id", "updated_at", "created_at" FROM \`authors\`;`)
  await db.run(sql`DROP TABLE \`authors\`;`)
  await db.run(sql`ALTER TABLE \`__new_authors\` RENAME TO \`authors\`;`)
  await db.run(sql`CREATE INDEX \`authors_image_idx\` ON \`authors\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`authors_updated_at_idx\` ON \`authors\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`authors_created_at_idx\` ON \`authors\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
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
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "pages_id", "meditations_id", "lessons_id", "music_id", "external_videos_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "media_tags_id", "meditation_tags_id", "music_tags_id", "page_tags_id", "managers_id", "clients_id", "forms_id", "form_submissions_id") SELECT "id", "order", "parent_id", "path", "pages_id", "meditations_id", "lessons_id", "music_id", "external_videos_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "media_tags_id", "meditation_tags_id", "music_tags_id", "page_tags_id", "managers_id", "clients_id", "forms_id", "form_submissions_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`ALTER TABLE \`music\` DROP COLUMN \`url\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`file_metadata\` text,
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
  	\`focal_y\` numeric,
  	\`sizes_thumbnail_url\` text,
  	\`sizes_thumbnail_width\` numeric,
  	\`sizes_thumbnail_height\` numeric,
  	\`sizes_thumbnail_mime_type\` text,
  	\`sizes_thumbnail_filesize\` numeric,
  	\`sizes_thumbnail_filename\` text,
  	\`sizes_card_url\` text,
  	\`sizes_card_width\` numeric,
  	\`sizes_card_height\` numeric,
  	\`sizes_card_mime_type\` text,
  	\`sizes_card_filesize\` numeric,
  	\`sizes_card_filename\` text,
  	\`sizes_tablet_url\` text,
  	\`sizes_tablet_width\` numeric,
  	\`sizes_tablet_height\` numeric,
  	\`sizes_tablet_mime_type\` text,
  	\`sizes_tablet_filesize\` numeric,
  	\`sizes_tablet_filename\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_thumbnail_sizes_thumbnail_filename_idx\` ON \`media\` (\`sizes_thumbnail_filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_card_sizes_card_filename_idx\` ON \`media\` (\`sizes_card_filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_tablet_sizes_tablet_filename_idx\` ON \`media\` (\`sizes_tablet_filename\`);`)
  await db.run(sql`CREATE TABLE \`media_locales\` (
  	\`alt\` text NOT NULL,
  	\`credit\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`media_locales_locale_parent_id_unique\` ON \`media_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`media_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_tags_id\`) REFERENCES \`media_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`media_rels_order_idx\` ON \`media_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`media_rels_parent_idx\` ON \`media_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`media_rels_path_idx\` ON \`media_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`media_rels_media_tags_id_idx\` ON \`media_rels\` (\`media_tags_id\`);`)
  await db.run(sql`CREATE TABLE \`file_attachments\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
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
  await db.run(sql`CREATE INDEX \`file_attachments_updated_at_idx\` ON \`file_attachments\` (\`updated_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`file_attachments_filename_idx\` ON \`file_attachments\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`file_attachments_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lessons_id\` integer,
  	\`frames_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`file_attachments\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lessons_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`frames_id\`) REFERENCES \`frames\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`file_attachments_rels_order_idx\` ON \`file_attachments_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`file_attachments_rels_parent_idx\` ON \`file_attachments_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`file_attachments_rels_path_idx\` ON \`file_attachments_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`file_attachments_rels_lessons_id_idx\` ON \`file_attachments_rels\` (\`lessons_id\`);`)
  await db.run(sql`CREATE INDEX \`file_attachments_rels_frames_id_idx\` ON \`file_attachments_rels\` (\`frames_id\`);`)
  await db.run(sql`DROP TABLE \`images\`;`)
  await db.run(sql`DROP TABLE \`images_locales\`;`)
  await db.run(sql`DROP TABLE \`images_rels\`;`)
  await db.run(sql`DROP TABLE \`files\`;`)
  await db.run(sql`DROP TABLE \`files_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_pages_locales\` (
  	\`title\` text,
  	\`content\` text,
  	\`meta_title\` text,
  	\`meta_description\` text,
  	\`meta_image_id\` integer,
  	\`publish_at\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`meta_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_pages_locales\`("title", "content", "meta_title", "meta_description", "meta_image_id", "publish_at", "id", "_locale", "_parent_id") SELECT "title", "content", "meta_title", "meta_description", "meta_image_id", "publish_at", "id", "_locale", "_parent_id" FROM \`pages_locales\`;`)
  await db.run(sql`DROP TABLE \`pages_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_pages_locales\` RENAME TO \`pages_locales\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`pages_meta_meta_image_idx\` ON \`pages_locales\` (\`meta_image_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`pages_locales_locale_parent_id_unique\` ON \`pages_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new__pages_v_locales\` (
  	\`version_title\` text,
  	\`version_content\` text,
  	\`version_meta_title\` text,
  	\`version_meta_description\` text,
  	\`version_meta_image_id\` integer,
  	\`version_publish_at\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`version_meta_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_pages_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new__pages_v_locales\`("version_title", "version_content", "version_meta_title", "version_meta_description", "version_meta_image_id", "version_publish_at", "id", "_locale", "_parent_id") SELECT "version_title", "version_content", "version_meta_title", "version_meta_description", "version_meta_image_id", "version_publish_at", "id", "_locale", "_parent_id" FROM \`_pages_v_locales\`;`)
  await db.run(sql`DROP TABLE \`_pages_v_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new__pages_v_locales\` RENAME TO \`_pages_v_locales\`;`)
  await db.run(sql`CREATE INDEX \`_pages_v_version_meta_version_meta_image_idx\` ON \`_pages_v_locales\` (\`version_meta_image_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`_pages_v_locales_locale_parent_id_unique\` ON \`_pages_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_meditations\` (
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
  	\`url\` text,
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
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditations\`("id", "label", "locale", "narrator_id", "music_tag_id", "file_metadata", "duration_minutes", "publish_at", "title", "slug", "slug_lock", "thumbnail_id", "frames", "updated_at", "created_at", "deleted_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "label", "locale", "narrator_id", "music_tag_id", "file_metadata", "duration_minutes", "publish_at", "title", "slug", "slug_lock", "thumbnail_id", "frames", "updated_at", "created_at", "deleted_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditations\`;`)
  await db.run(sql`DROP TABLE \`meditations\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditations\` RENAME TO \`meditations\`;`)
  await db.run(sql`CREATE INDEX \`meditations_narrator_idx\` ON \`meditations\` (\`narrator_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_music_tag_idx\` ON \`meditations\` (\`music_tag_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditations_slug_idx\` ON \`meditations\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditations_thumbnail_idx\` ON \`meditations\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`meditations_updated_at_idx\` ON \`meditations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations_created_at_idx\` ON \`meditations\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`meditations_deleted_at_idx\` ON \`meditations\` (\`deleted_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditations_filename_idx\` ON \`meditations\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_lessons_blocks_video\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`video_id\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`video_id\`) REFERENCES \`file_attachments\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lessons_blocks_video\`("_order", "_parent_id", "_path", "id", "video_id", "block_name") SELECT "_order", "_parent_id", "_path", "id", "video_id", "block_name" FROM \`lessons_blocks_video\`;`)
  await db.run(sql`DROP TABLE \`lessons_blocks_video\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons_blocks_video\` RENAME TO \`lessons_blocks_video\`;`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_order_idx\` ON \`lessons_blocks_video\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_parent_id_idx\` ON \`lessons_blocks_video\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_path_idx\` ON \`lessons_blocks_video\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_video_video_idx\` ON \`lessons_blocks_video\` (\`video_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_lessons_blocks_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`text\` text,
  	\`image_id\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lessons_blocks_text\`("_order", "_parent_id", "_path", "id", "title", "text", "image_id", "block_name") SELECT "_order", "_parent_id", "_path", "id", "title", "text", "image_id", "block_name" FROM \`lessons_blocks_text\`;`)
  await db.run(sql`DROP TABLE \`lessons_blocks_text\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons_blocks_text\` RENAME TO \`lessons_blocks_text\`;`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_order_idx\` ON \`lessons_blocks_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_parent_id_idx\` ON \`lessons_blocks_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_path_idx\` ON \`lessons_blocks_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`lessons_blocks_text_image_idx\` ON \`lessons_blocks_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_lessons\` (
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
  	FOREIGN KEY (\`intro_audio_id\`) REFERENCES \`file_attachments\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`icon_id\`) REFERENCES \`file_attachments\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lessons\`("id", "title", "meditation_id", "intro_audio_id", "intro_subtitles", "unit", "step", "icon_id", "updated_at", "created_at", "deleted_at", "_status") SELECT "id", "title", "meditation_id", "intro_audio_id", "intro_subtitles", "unit", "step", "icon_id", "updated_at", "created_at", "deleted_at", "_status" FROM \`lessons\`;`)
  await db.run(sql`DROP TABLE \`lessons\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons\` RENAME TO \`lessons\`;`)
  await db.run(sql`CREATE INDEX \`lessons_meditation_idx\` ON \`lessons\` (\`meditation_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_intro_audio_idx\` ON \`lessons\` (\`intro_audio_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_icon_idx\` ON \`lessons\` (\`icon_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_updated_at_idx\` ON \`lessons\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons_created_at_idx\` ON \`lessons\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons_deleted_at_idx\` ON \`lessons\` (\`deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons__status_idx\` ON \`lessons\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`__new__lessons_v_blocks_video\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`video_id\` integer,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`video_id\`) REFERENCES \`file_attachments\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_lessons_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new__lessons_v_blocks_video\`("_order", "_parent_id", "_path", "id", "video_id", "_uuid", "block_name") SELECT "_order", "_parent_id", "_path", "id", "video_id", "_uuid", "block_name" FROM \`_lessons_v_blocks_video\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v_blocks_video\`;`)
  await db.run(sql`ALTER TABLE \`__new__lessons_v_blocks_video\` RENAME TO \`_lessons_v_blocks_video\`;`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_order_idx\` ON \`_lessons_v_blocks_video\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_parent_id_idx\` ON \`_lessons_v_blocks_video\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_path_idx\` ON \`_lessons_v_blocks_video\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_video_video_idx\` ON \`_lessons_v_blocks_video\` (\`video_id\`);`)
  await db.run(sql`CREATE TABLE \`__new__lessons_v_blocks_text\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`text\` text,
  	\`image_id\` integer,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_lessons_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new__lessons_v_blocks_text\`("_order", "_parent_id", "_path", "id", "title", "text", "image_id", "_uuid", "block_name") SELECT "_order", "_parent_id", "_path", "id", "title", "text", "image_id", "_uuid", "block_name" FROM \`_lessons_v_blocks_text\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v_blocks_text\`;`)
  await db.run(sql`ALTER TABLE \`__new__lessons_v_blocks_text\` RENAME TO \`_lessons_v_blocks_text\`;`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_order_idx\` ON \`_lessons_v_blocks_text\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_parent_id_idx\` ON \`_lessons_v_blocks_text\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_path_idx\` ON \`_lessons_v_blocks_text\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_lessons_v_blocks_text_image_idx\` ON \`_lessons_v_blocks_text\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`__new__lessons_v\` (
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
  	FOREIGN KEY (\`version_intro_audio_id\`) REFERENCES \`file_attachments\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_icon_id\`) REFERENCES \`file_attachments\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__lessons_v\`("id", "parent_id", "version_title", "version_meditation_id", "version_intro_audio_id", "version_intro_subtitles", "version_unit", "version_step", "version_icon_id", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_title", "version_meditation_id", "version_intro_audio_id", "version_intro_subtitles", "version_unit", "version_step", "version_icon_id", "version_updated_at", "version_created_at", "version_deleted_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_lessons_v\`;`)
  await db.run(sql`DROP TABLE \`_lessons_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__lessons_v\` RENAME TO \`_lessons_v\`;`)
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
  await db.run(sql`CREATE TABLE \`__new_external_videos\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`thumbnail_id\` integer NOT NULL,
  	\`video_url\` text NOT NULL,
  	\`subtitles_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_external_videos\`("id", "thumbnail_id", "video_url", "subtitles_url", "updated_at", "created_at") SELECT "id", "thumbnail_id", "video_url", "subtitles_url", "updated_at", "created_at" FROM \`external_videos\`;`)
  await db.run(sql`DROP TABLE \`external_videos\`;`)
  await db.run(sql`ALTER TABLE \`__new_external_videos\` RENAME TO \`external_videos\`;`)
  await db.run(sql`CREATE INDEX \`external_videos_thumbnail_idx\` ON \`external_videos\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`external_videos_updated_at_idx\` ON \`external_videos\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`external_videos_created_at_idx\` ON \`external_videos\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_authors\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`country_code\` text,
  	\`years_meditating\` numeric,
  	\`image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_authors\`("id", "country_code", "years_meditating", "image_id", "updated_at", "created_at") SELECT "id", "country_code", "years_meditating", "image_id", "updated_at", "created_at" FROM \`authors\`;`)
  await db.run(sql`DROP TABLE \`authors\`;`)
  await db.run(sql`ALTER TABLE \`__new_authors\` RENAME TO \`authors\`;`)
  await db.run(sql`CREATE INDEX \`authors_image_idx\` ON \`authors\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`authors_updated_at_idx\` ON \`authors\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`authors_created_at_idx\` ON \`authors\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
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
  	\`media_id\` integer,
  	\`file_attachments_id\` integer,
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
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`file_attachments_id\`) REFERENCES \`file_attachments\`(\`id\`) ON UPDATE no action ON DELETE cascade,
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
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "pages_id", "meditations_id", "lessons_id", "music_id", "external_videos_id", "frames_id", "narrators_id", "authors_id", "media_id", "file_attachments_id", "media_tags_id", "meditation_tags_id", "music_tags_id", "page_tags_id", "managers_id", "clients_id", "forms_id", "form_submissions_id") SELECT "id", "order", "parent_id", "path", "pages_id", "meditations_id", "lessons_id", "music_id", "external_videos_id", "frames_id", "narrators_id", "authors_id", "media_id", "file_attachments_id", "media_tags_id", "meditation_tags_id", "music_tags_id", "page_tags_id", "managers_id", "clients_id", "forms_id", "form_submissions_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_file_attachments_id_idx\` ON \`payload_locked_documents_rels\` (\`file_attachments_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`media_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_meditation_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`meditation_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_music_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`music_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_page_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`page_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_managers_id_idx\` ON \`payload_locked_documents_rels\` (\`managers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`clients_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_forms_id_idx\` ON \`payload_locked_documents_rels\` (\`forms_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_form_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`form_submissions_id\`);`)
  await db.run(sql`ALTER TABLE \`music\` ADD \`url\` text;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`thumbnail_id\` integer REFERENCES file_attachments(id);`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_small_url\` text;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_small_width\` numeric;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_small_height\` numeric;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_small_mime_type\` text;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_small_filesize\` numeric;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_small_filename\` text;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_large_url\` text;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_large_width\` numeric;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_large_height\` numeric;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_large_mime_type\` text;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_large_filesize\` numeric;`)
  await db.run(sql`ALTER TABLE \`frames\` ADD \`sizes_large_filename\` text;`)
  await db.run(sql`CREATE INDEX \`frames_thumbnail_idx\` ON \`frames\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`frames_sizes_small_sizes_small_filename_idx\` ON \`frames\` (\`sizes_small_filename\`);`)
  await db.run(sql`CREATE INDEX \`frames_sizes_large_sizes_large_filename_idx\` ON \`frames\` (\`sizes_large_filename\`);`)
}
