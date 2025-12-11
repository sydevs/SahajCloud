import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`external_videos\` RENAME TO \`lectures\`;`)
  await db.run(sql`ALTER TABLE \`external_videos_locales\` RENAME TO \`lectures_locales\`;`)
  await db.run(sql`CREATE TABLE \`image_tags_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`image_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`image_tags_locales_locale_parent_id_unique\` ON \`image_tags_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`external_videos_category\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lectures\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`thumbnail_id\` integer NOT NULL,
  	\`video_url\` text NOT NULL,
  	\`subtitles_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lectures\`("id", "thumbnail_id", "video_url", "subtitles_url", "updated_at", "created_at") SELECT "id", "thumbnail_id", "video_url", "subtitles_url", "updated_at", "created_at" FROM \`lectures\`;`)
  await db.run(sql`DROP TABLE \`lectures\`;`)
  await db.run(sql`ALTER TABLE \`__new_lectures\` RENAME TO \`lectures\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lectures_thumbnail_idx\` ON \`lectures\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_updated_at_idx\` ON \`lectures\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lectures_created_at_idx\` ON \`lectures\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_lectures_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lectures_locales\`("title", "id", "_locale", "_parent_id") SELECT "title", "id", "_locale", "_parent_id" FROM \`lectures_locales\`;`)
  await db.run(sql`DROP TABLE \`lectures_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_lectures_locales\` RENAME TO \`lectures_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`lectures_locales_locale_parent_id_unique\` ON \`lectures_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	\`meditations_id\` integer,
  	\`lessons_id\` integer,
  	\`music_id\` integer,
  	\`lectures_id\` integer,
  	\`frames_id\` integer,
  	\`narrators_id\` integer,
  	\`authors_id\` integer,
  	\`images_id\` integer,
  	\`files_id\` integer,
  	\`image_tags_id\` integer,
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
  	FOREIGN KEY (\`lectures_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`frames_id\`) REFERENCES \`frames\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`narrators_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`authors_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`images_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`files_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`image_tags_id\`) REFERENCES \`image_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditation_tags_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`music_tags_id\`) REFERENCES \`music_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`page_tags_id\`) REFERENCES \`page_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`managers_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`forms_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`form_submissions_id\`) REFERENCES \`form_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "pages_id", "meditations_id", "lessons_id", "music_id", "lectures_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "image_tags_id", "meditation_tags_id", "music_tags_id", "page_tags_id", "managers_id", "clients_id", "forms_id", "form_submissions_id") SELECT "id", "order", "parent_id", "path", "pages_id", "meditations_id", "lessons_id", "music_id", "lectures_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "image_tags_id", "meditation_tags_id", "music_tags_id", "page_tags_id", "managers_id", "clients_id", "forms_id", "form_submissions_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_meditations_id_idx\` ON \`payload_locked_documents_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lessons_id_idx\` ON \`payload_locked_documents_rels\` (\`lessons_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_music_id_idx\` ON \`payload_locked_documents_rels\` (\`music_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lectures_id_idx\` ON \`payload_locked_documents_rels\` (\`lectures_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_frames_id_idx\` ON \`payload_locked_documents_rels\` (\`frames_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_narrators_id_idx\` ON \`payload_locked_documents_rels\` (\`narrators_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_authors_id_idx\` ON \`payload_locked_documents_rels\` (\`authors_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_images_id_idx\` ON \`payload_locked_documents_rels\` (\`images_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_files_id_idx\` ON \`payload_locked_documents_rels\` (\`files_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_image_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`image_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_meditation_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`meditation_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_music_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`music_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_page_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`page_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_managers_id_idx\` ON \`payload_locked_documents_rels\` (\`managers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`clients_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_forms_id_idx\` ON \`payload_locked_documents_rels\` (\`forms_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_form_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`form_submissions_id\`);`)
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
  	FOREIGN KEY (\`icon_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
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
  	FOREIGN KEY (\`version_icon_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
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
  await db.run(sql`CREATE TABLE \`__new_files_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lessons_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lessons_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_files_rels\`("id", "order", "parent_id", "path", "lessons_id") SELECT "id", "order", "parent_id", "path", "lessons_id" FROM \`files_rels\`;`)
  await db.run(sql`DROP TABLE \`files_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_files_rels\` RENAME TO \`files_rels\`;`)
  await db.run(sql`CREATE INDEX \`files_rels_order_idx\` ON \`files_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`files_rels_parent_idx\` ON \`files_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`files_rels_path_idx\` ON \`files_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`files_rels_lessons_id_idx\` ON \`files_rels\` (\`lessons_id\`);`)
  await db.run(sql`ALTER TABLE \`authors\` ADD \`slug\` text;`)
  await db.run(sql`ALTER TABLE \`authors\` ADD \`slug_lock\` integer DEFAULT true;`)
  await db.run(sql`CREATE UNIQUE INDEX \`authors_slug_idx\` ON \`authors\` (\`slug\`);`)
  await db.run(sql`ALTER TABLE \`image_tags\` DROP COLUMN \`title\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`lectures\` RENAME TO \`external_videos\`;`)
  await db.run(sql`ALTER TABLE \`lectures_locales\` RENAME TO \`external_videos_locales\`;`)
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
  await db.run(sql`DROP TABLE \`image_tags_locales\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
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
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`external_videos_thumbnail_idx\` ON \`external_videos\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`external_videos_updated_at_idx\` ON \`external_videos\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`external_videos_created_at_idx\` ON \`external_videos\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_external_videos_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`external_videos\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_external_videos_locales\`("title", "id", "_locale", "_parent_id") SELECT "title", "id", "_locale", "_parent_id" FROM \`external_videos_locales\`;`)
  await db.run(sql`DROP TABLE \`external_videos_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_external_videos_locales\` RENAME TO \`external_videos_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`external_videos_locales_locale_parent_id_unique\` ON \`external_videos_locales\` (\`_locale\`,\`_parent_id\`);`)
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
  	\`image_tags_id\` integer,
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
  	FOREIGN KEY (\`image_tags_id\`) REFERENCES \`image_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditation_tags_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`music_tags_id\`) REFERENCES \`music_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`page_tags_id\`) REFERENCES \`page_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`managers_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`forms_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`form_submissions_id\`) REFERENCES \`form_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "pages_id", "meditations_id", "lessons_id", "music_id", "external_videos_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "image_tags_id", "meditation_tags_id", "music_tags_id", "page_tags_id", "managers_id", "clients_id", "forms_id", "form_submissions_id") SELECT "id", "order", "parent_id", "path", "pages_id", "meditations_id", "lessons_id", "music_id", "external_videos_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "image_tags_id", "meditation_tags_id", "music_tags_id", "page_tags_id", "managers_id", "clients_id", "forms_id", "form_submissions_id" FROM \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_image_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`image_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_meditation_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`meditation_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_music_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`music_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_page_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`page_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_managers_id_idx\` ON \`payload_locked_documents_rels\` (\`managers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`clients_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_forms_id_idx\` ON \`payload_locked_documents_rels\` (\`forms_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_form_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`form_submissions_id\`);`)
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
  await db.run(sql`DROP INDEX \`authors_slug_idx\`;`)
  await db.run(sql`ALTER TABLE \`authors\` DROP COLUMN \`slug\`;`)
  await db.run(sql`ALTER TABLE \`authors\` DROP COLUMN \`slug_lock\`;`)
  await db.run(sql`ALTER TABLE \`files_rels\` ADD \`frames_id\` integer REFERENCES frames(id);`)
  await db.run(sql`CREATE INDEX \`files_rels_frames_id_idx\` ON \`files_rels\` (\`frames_id\`);`)
  await db.run(sql`ALTER TABLE \`image_tags\` ADD \`title\` text NOT NULL;`)
}
