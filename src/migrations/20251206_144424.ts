import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media_tags\` RENAME TO \`image_tags\`;`)
  await db.run(sql`DROP TABLE \`media_tags_locales\`;`)
  await db.run(sql`DROP INDEX \`media_tags_updated_at_idx\`;`)
  await db.run(sql`DROP INDEX \`media_tags_created_at_idx\`;`)
  await db.run(sql`ALTER TABLE \`image_tags\` ADD \`title\` text NOT NULL;`)
  await db.run(sql`CREATE INDEX \`image_tags_updated_at_idx\` ON \`image_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`image_tags_created_at_idx\` ON \`image_tags\` (\`created_at\`);`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_images_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`image_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`image_tags_id\`) REFERENCES \`image_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_images_rels\`("id", "order", "parent_id", "path", "image_tags_id") SELECT "id", "order", "parent_id", "path", "image_tags_id" FROM \`images_rels\`;`)
  await db.run(sql`DROP TABLE \`images_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_images_rels\` RENAME TO \`images_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`images_rels_order_idx\` ON \`images_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`images_rels_parent_idx\` ON \`images_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`images_rels_path_idx\` ON \`images_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`images_rels_image_tags_id_idx\` ON \`images_rels\` (\`image_tags_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`slug_lock\` integer DEFAULT true,
  	\`color\` text DEFAULT '#000000' NOT NULL,
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
  await db.run(sql`INSERT INTO \`__new_meditation_tags\`("id", "slug", "slug_lock", "color", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "slug", "slug_lock", "color", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`meditation_tags\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags\` RENAME TO \`meditation_tags\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_slug_idx\` ON \`meditation_tags\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_updated_at_idx\` ON \`meditation_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_created_at_idx\` ON \`meditation_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_filename_idx\` ON \`meditation_tags\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_music_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`slug_lock\` integer DEFAULT true,
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
  await db.run(sql`INSERT INTO \`__new_music_tags\`("id", "slug", "slug_lock", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "slug", "slug_lock", "updated_at", "created_at", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`music_tags\`;`)
  await db.run(sql`DROP TABLE \`music_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_music_tags\` RENAME TO \`music_tags\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`music_tags_slug_idx\` ON \`music_tags\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`music_tags_updated_at_idx\` ON \`music_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`music_tags_created_at_idx\` ON \`music_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`music_tags_filename_idx\` ON \`music_tags\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_page_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`slug_lock\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`INSERT INTO \`__new_page_tags\`("id", "slug", "slug_lock", "updated_at", "created_at") SELECT "id", "slug", "slug_lock", "updated_at", "created_at" FROM \`page_tags\`;`)
  await db.run(sql`DROP TABLE \`page_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_page_tags\` RENAME TO \`page_tags\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`page_tags_slug_idx\` ON \`page_tags\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`page_tags_updated_at_idx\` ON \`page_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`page_tags_created_at_idx\` ON \`page_tags\` (\`created_at\`);`)
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
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`image_tags\` RENAME TO \`media_tags\`;`)
  await db.run(sql`CREATE TABLE \`media_tags_locales\` (
  	\`name\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`media_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`media_tags_locales_locale_parent_id_unique\` ON \`media_tags_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`DROP INDEX \`image_tags_updated_at_idx\`;`)
  await db.run(sql`DROP INDEX \`image_tags_created_at_idx\`;`)
  await db.run(sql`CREATE INDEX \`media_tags_updated_at_idx\` ON \`media_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_tags_created_at_idx\` ON \`media_tags\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`media_tags\` DROP COLUMN \`title\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_images_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_tags_id\`) REFERENCES \`media_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_images_rels\`("id", "order", "parent_id", "path", "media_tags_id") SELECT "id", "order", "parent_id", "path", "media_tags_id" FROM \`images_rels\`;`)
  await db.run(sql`DROP TABLE \`images_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_images_rels\` RENAME TO \`images_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`images_rels_order_idx\` ON \`images_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`images_rels_parent_idx\` ON \`images_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`images_rels_path_idx\` ON \`images_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`images_rels_media_tags_id_idx\` ON \`images_rels\` (\`media_tags_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditation_tags\`("id", "name", "updated_at", "created_at") SELECT "id", "name", "updated_at", "created_at" FROM \`meditation_tags\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags\` RENAME TO \`meditation_tags\`;`)
  await db.run(sql`CREATE INDEX \`meditation_tags_updated_at_idx\` ON \`meditation_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_created_at_idx\` ON \`meditation_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_music_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`INSERT INTO \`__new_music_tags\`("id", "name", "updated_at", "created_at") SELECT "id", "name", "updated_at", "created_at" FROM \`music_tags\`;`)
  await db.run(sql`DROP TABLE \`music_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_music_tags\` RENAME TO \`music_tags\`;`)
  await db.run(sql`CREATE INDEX \`music_tags_updated_at_idx\` ON \`music_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`music_tags_created_at_idx\` ON \`music_tags\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_page_tags\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`INSERT INTO \`__new_page_tags\`("id", "name", "updated_at", "created_at") SELECT "id", "name", "updated_at", "created_at" FROM \`page_tags\`;`)
  await db.run(sql`DROP TABLE \`page_tags\`;`)
  await db.run(sql`ALTER TABLE \`__new_page_tags\` RENAME TO \`page_tags\`;`)
  await db.run(sql`CREATE INDEX \`page_tags_updated_at_idx\` ON \`page_tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`page_tags_created_at_idx\` ON \`page_tags\` (\`created_at\`);`)
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
}
