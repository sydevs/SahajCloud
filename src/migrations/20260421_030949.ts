import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`lecture_clips\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`start_time\` numeric DEFAULT 0 NOT NULL,
  	\`end_time\` numeric DEFAULT 600 NOT NULL,
  	\`thumbnail_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`lecture_clips_parent_idx\` ON \`lecture_clips\` (\`parent_id\`);`)
  await db.run(
    sql`CREATE INDEX \`lecture_clips_thumbnail_idx\` ON \`lecture_clips\` (\`thumbnail_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`lecture_clips_updated_at_idx\` ON \`lecture_clips\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`lecture_clips_created_at_idx\` ON \`lecture_clips\` (\`created_at\`);`,
  )
  await db.run(sql`CREATE TABLE \`lecture_clips_locales\` (
  	\`title\` text NOT NULL,
  	\`subtitles_url\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE UNIQUE INDEX \`lecture_clips_locales_locale_parent_id_unique\` ON \`lecture_clips_locales\` (\`_locale\`,\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`lecture_clips_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lecture_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lecture_tags_id\`) REFERENCES \`lecture_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`lecture_clips_rels_order_idx\` ON \`lecture_clips_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`lecture_clips_rels_parent_idx\` ON \`lecture_clips_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`lecture_clips_rels_path_idx\` ON \`lecture_clips_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`lecture_clips_rels_lecture_tags_id_idx\` ON \`lecture_clips_rels\` (\`lecture_tags_id\`);`,
  )
  await db.run(sql`DROP TABLE \`_lectures_v\`;`)
  await db.run(sql`DROP TABLE \`_lectures_v_locales\`;`)
  await db.run(sql`DROP TABLE \`_lectures_v_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_app_cards_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lecture_clips_id\` integer,
  	\`albums_id\` integer,
  	\`meditations_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lecture_clips_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  // Drizzle's auto-generated SELECT references `lecture_clips_id` from the OLD
  // `app_cards_rels` table where only `lectures_id` exists. Per issue #291,
  // polymorphic FKs pointing at the old lectures collection are NOT rewritten
  // to lecture-clips (no row migration) — drop the column from both sides of
  // the copy so `lecture_clips_id` stays NULL for any pre-existing rows.
  await db.run(
    sql`INSERT INTO \`__new_app_cards_rels\`("id", "order", "parent_id", "path", "albums_id", "meditations_id") SELECT "id", "order", "parent_id", "path", "albums_id", "meditations_id" FROM \`app_cards_rels\`;`,
  )
  await db.run(sql`DROP TABLE \`app_cards_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_app_cards_rels\` RENAME TO \`app_cards_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_order_idx\` ON \`app_cards_rels\` (\`order\`);`)
  await db.run(
    sql`CREATE INDEX \`app_cards_rels_parent_idx\` ON \`app_cards_rels\` (\`parent_id\`);`,
  )
  await db.run(sql`CREATE INDEX \`app_cards_rels_path_idx\` ON \`app_cards_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`app_cards_rels_lecture_clips_id_idx\` ON \`app_cards_rels\` (\`lecture_clips_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`app_cards_rels_albums_id_idx\` ON \`app_cards_rels\` (\`albums_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`app_cards_rels_meditations_id_idx\` ON \`app_cards_rels\` (\`meditations_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`__new__app_cards_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lecture_clips_id\` integer,
  	\`albums_id\` integer,
  	\`meditations_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_app_cards_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lecture_clips_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  // Same adjustment as __new_app_cards_rels above — `lecture_clips_id` is a
  // new column with no corresponding old data.
  await db.run(
    sql`INSERT INTO \`__new__app_cards_v_rels\`("id", "order", "parent_id", "path", "albums_id", "meditations_id") SELECT "id", "order", "parent_id", "path", "albums_id", "meditations_id" FROM \`_app_cards_v_rels\`;`,
  )
  await db.run(sql`DROP TABLE \`_app_cards_v_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new__app_cards_v_rels\` RENAME TO \`_app_cards_v_rels\`;`)
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_order_idx\` ON \`_app_cards_v_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_parent_idx\` ON \`_app_cards_v_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_path_idx\` ON \`_app_cards_v_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_lecture_clips_id_idx\` ON \`_app_cards_v_rels\` (\`lecture_clips_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_albums_id_idx\` ON \`_app_cards_v_rels\` (\`albums_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_meditations_id_idx\` ON \`_app_cards_v_rels\` (\`meditations_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`__new_wm_app_config_locales\` (
  	\`self_realization_meditation_id\` integer,
  	\`post_realization_lecture_id\` integer,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`self_realization_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`post_realization_lecture_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`wm_app_config\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  // Issue #291: the FK for `post_realization_lecture_id` moved from the old
  // `lectures` collection to the new (empty) `lecture_clips`. Existing values
  // are stale lecture ids, not valid lecture_clips ids, so drop them to NULL
  // during the copy — otherwise the FK check fails on prod data.
  await db.run(
    sql`INSERT INTO \`__new_wm_app_config_locales\`("self_realization_meditation_id", "post_realization_lecture_id", "id", "_locale", "_parent_id") SELECT "self_realization_meditation_id", NULL, "id", "_locale", "_parent_id" FROM \`wm_app_config_locales\`;`,
  )
  await db.run(sql`DROP TABLE \`wm_app_config_locales\`;`)
  await db.run(
    sql`ALTER TABLE \`__new_wm_app_config_locales\` RENAME TO \`wm_app_config_locales\`;`,
  )
  await db.run(
    sql`CREATE INDEX \`wm_app_config_self_realization_meditation_idx\` ON \`wm_app_config_locales\` (\`self_realization_meditation_id\`,\`_locale\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`wm_app_config_post_realization_lecture_idx\` ON \`wm_app_config_locales\` (\`post_realization_lecture_id\`,\`_locale\`);`,
  )
  await db.run(
    sql`CREATE UNIQUE INDEX \`wm_app_config_locales_locale_parent_id_unique\` ON \`wm_app_config_locales\` (\`_locale\`,\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`__new_lectures\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nirmal_vidya_vimeo_url\` text NOT NULL,
  	\`thumbnail_id\` integer,
  	\`video_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_lectures\`("id", "nirmal_vidya_vimeo_url", "thumbnail_id", "video_url", "updated_at", "created_at") SELECT "id", "nirmal_vidya_vimeo_url", "thumbnail_id", "video_url", "updated_at", "created_at" FROM \`lectures\`;`,
  )
  await db.run(sql`DROP TABLE \`lectures\`;`)
  await db.run(sql`ALTER TABLE \`__new_lectures\` RENAME TO \`lectures\`;`)
  await db.run(sql`CREATE INDEX \`lectures_thumbnail_idx\` ON \`lectures\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_updated_at_idx\` ON \`lectures\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lectures_created_at_idx\` ON \`lectures\` (\`created_at\`);`)
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`lecture_clips_id\` integer REFERENCES lecture_clips(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_lecture_clips_id_idx\` ON \`payload_locked_documents_rels\` (\`lecture_clips_id\`);`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`_lectures_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_nirmal_vidya_vimeo_url\` text,
  	\`version_start_time\` numeric DEFAULT 0,
  	\`version_end_time\` numeric DEFAULT 600,
  	\`version_thumbnail_id\` integer,
  	\`version_video_url\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_lectures_v_parent_idx\` ON \`_lectures_v\` (\`parent_id\`);`)
  await db.run(
    sql`CREATE INDEX \`_lectures_v_version_version_thumbnail_idx\` ON \`_lectures_v\` (\`version_thumbnail_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_lectures_v_version_version_updated_at_idx\` ON \`_lectures_v\` (\`version_updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_lectures_v_version_version_created_at_idx\` ON \`_lectures_v\` (\`version_created_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_lectures_v_version_version__status_idx\` ON \`_lectures_v\` (\`version__status\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_lectures_v_created_at_idx\` ON \`_lectures_v\` (\`created_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_lectures_v_updated_at_idx\` ON \`_lectures_v\` (\`updated_at\`);`,
  )
  await db.run(sql`CREATE INDEX \`_lectures_v_snapshot_idx\` ON \`_lectures_v\` (\`snapshot\`);`)
  await db.run(
    sql`CREATE INDEX \`_lectures_v_published_locale_idx\` ON \`_lectures_v\` (\`published_locale\`);`,
  )
  await db.run(sql`CREATE INDEX \`_lectures_v_latest_idx\` ON \`_lectures_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_lectures_v_locales\` (
  	\`version_title\` text,
  	\`version_subtitles_url\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_lectures_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE UNIQUE INDEX \`_lectures_v_locales_locale_parent_id_unique\` ON \`_lectures_v_locales\` (\`_locale\`,\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`_lectures_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lecture_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_lectures_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lecture_tags_id\`) REFERENCES \`lecture_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`_lectures_v_rels_order_idx\` ON \`_lectures_v_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_lectures_v_rels_parent_idx\` ON \`_lectures_v_rels\` (\`parent_id\`);`,
  )
  await db.run(sql`CREATE INDEX \`_lectures_v_rels_path_idx\` ON \`_lectures_v_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`_lectures_v_rels_lecture_tags_id_idx\` ON \`_lectures_v_rels\` (\`lecture_tags_id\`);`,
  )
  await db.run(sql`DROP TABLE \`lecture_clips\`;`)
  await db.run(sql`DROP TABLE \`lecture_clips_locales\`;`)
  await db.run(sql`DROP TABLE \`lecture_clips_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_app_cards_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lectures_id\` integer,
  	\`albums_id\` integer,
  	\`meditations_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lectures_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_app_cards_rels\`("id", "order", "parent_id", "path", "lectures_id", "albums_id", "meditations_id") SELECT "id", "order", "parent_id", "path", "lectures_id", "albums_id", "meditations_id" FROM \`app_cards_rels\`;`,
  )
  await db.run(sql`DROP TABLE \`app_cards_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_app_cards_rels\` RENAME TO \`app_cards_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_order_idx\` ON \`app_cards_rels\` (\`order\`);`)
  await db.run(
    sql`CREATE INDEX \`app_cards_rels_parent_idx\` ON \`app_cards_rels\` (\`parent_id\`);`,
  )
  await db.run(sql`CREATE INDEX \`app_cards_rels_path_idx\` ON \`app_cards_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`app_cards_rels_lectures_id_idx\` ON \`app_cards_rels\` (\`lectures_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`app_cards_rels_albums_id_idx\` ON \`app_cards_rels\` (\`albums_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`app_cards_rels_meditations_id_idx\` ON \`app_cards_rels\` (\`meditations_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`__new__app_cards_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lectures_id\` integer,
  	\`albums_id\` integer,
  	\`meditations_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_app_cards_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lectures_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new__app_cards_v_rels\`("id", "order", "parent_id", "path", "lectures_id", "albums_id", "meditations_id") SELECT "id", "order", "parent_id", "path", "lectures_id", "albums_id", "meditations_id" FROM \`_app_cards_v_rels\`;`,
  )
  await db.run(sql`DROP TABLE \`_app_cards_v_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new__app_cards_v_rels\` RENAME TO \`_app_cards_v_rels\`;`)
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_order_idx\` ON \`_app_cards_v_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_parent_idx\` ON \`_app_cards_v_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_path_idx\` ON \`_app_cards_v_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_lectures_id_idx\` ON \`_app_cards_v_rels\` (\`lectures_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_albums_id_idx\` ON \`_app_cards_v_rels\` (\`albums_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_app_cards_v_rels_meditations_id_idx\` ON \`_app_cards_v_rels\` (\`meditations_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`pages_id\` integer,
  	\`meditations_id\` integer,
  	\`songs_id\` integer,
  	\`albums_id\` integer,
  	\`videos_id\` integer,
  	\`lessons_id\` integer,
  	\`lectures_id\` integer,
  	\`frames_id\` integer,
  	\`narrators_id\` integer,
  	\`authors_id\` integer,
  	\`images_id\` integer,
  	\`files_id\` integer,
  	\`lecture_tags_id\` integer,
  	\`meditation_tags_id\` integer,
  	\`song_tags_id\` integer,
  	\`managers_id\` integer,
  	\`clients_id\` integer,
  	\`app_cards_id\` integer,
  	\`forms_id\` integer,
  	\`form_submissions_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`songs_id\`) REFERENCES \`songs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`videos_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lessons_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lectures_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`frames_id\`) REFERENCES \`frames\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`narrators_id\`) REFERENCES \`narrators\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`authors_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`images_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`files_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lecture_tags_id\`) REFERENCES \`lecture_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditation_tags_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`song_tags_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`managers_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`app_cards_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`forms_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`form_submissions_id\`) REFERENCES \`form_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "pages_id", "meditations_id", "songs_id", "albums_id", "videos_id", "lessons_id", "lectures_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "lecture_tags_id", "meditation_tags_id", "song_tags_id", "managers_id", "clients_id", "app_cards_id", "forms_id", "form_submissions_id") SELECT "id", "order", "parent_id", "path", "pages_id", "meditations_id", "songs_id", "albums_id", "videos_id", "lessons_id", "lectures_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "lecture_tags_id", "meditation_tags_id", "song_tags_id", "managers_id", "clients_id", "app_cards_id", "forms_id", "form_submissions_id" FROM \`payload_locked_documents_rels\`;`,
  )
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(
    sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_meditations_id_idx\` ON \`payload_locked_documents_rels\` (\`meditations_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_songs_id_idx\` ON \`payload_locked_documents_rels\` (\`songs_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_albums_id_idx\` ON \`payload_locked_documents_rels\` (\`albums_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_videos_id_idx\` ON \`payload_locked_documents_rels\` (\`videos_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_lessons_id_idx\` ON \`payload_locked_documents_rels\` (\`lessons_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_lectures_id_idx\` ON \`payload_locked_documents_rels\` (\`lectures_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_frames_id_idx\` ON \`payload_locked_documents_rels\` (\`frames_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_narrators_id_idx\` ON \`payload_locked_documents_rels\` (\`narrators_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_authors_id_idx\` ON \`payload_locked_documents_rels\` (\`authors_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_images_id_idx\` ON \`payload_locked_documents_rels\` (\`images_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_files_id_idx\` ON \`payload_locked_documents_rels\` (\`files_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_lecture_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`lecture_tags_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_meditation_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`meditation_tags_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_song_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`song_tags_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_managers_id_idx\` ON \`payload_locked_documents_rels\` (\`managers_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`clients_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_app_cards_id_idx\` ON \`payload_locked_documents_rels\` (\`app_cards_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_forms_id_idx\` ON \`payload_locked_documents_rels\` (\`forms_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_form_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`form_submissions_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`__new_wm_app_config_locales\` (
  	\`self_realization_meditation_id\` integer,
  	\`post_realization_lecture_id\` integer,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`self_realization_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`post_realization_lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`wm_app_config\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_wm_app_config_locales\`("self_realization_meditation_id", "post_realization_lecture_id", "id", "_locale", "_parent_id") SELECT "self_realization_meditation_id", "post_realization_lecture_id", "id", "_locale", "_parent_id" FROM \`wm_app_config_locales\`;`,
  )
  await db.run(sql`DROP TABLE \`wm_app_config_locales\`;`)
  await db.run(
    sql`ALTER TABLE \`__new_wm_app_config_locales\` RENAME TO \`wm_app_config_locales\`;`,
  )
  await db.run(
    sql`CREATE INDEX \`wm_app_config_self_realization_meditation_idx\` ON \`wm_app_config_locales\` (\`self_realization_meditation_id\`,\`_locale\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`wm_app_config_post_realization_lecture_idx\` ON \`wm_app_config_locales\` (\`post_realization_lecture_id\`,\`_locale\`);`,
  )
  await db.run(
    sql`CREATE UNIQUE INDEX \`wm_app_config_locales_locale_parent_id_unique\` ON \`wm_app_config_locales\` (\`_locale\`,\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`__new_lectures\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nirmal_vidya_vimeo_url\` text,
  	\`start_time\` numeric DEFAULT 0,
  	\`end_time\` numeric DEFAULT 600,
  	\`thumbnail_id\` integer,
  	\`video_url\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_lectures\`("id", "nirmal_vidya_vimeo_url", "start_time", "end_time", "thumbnail_id", "video_url", "updated_at", "created_at", "_status") SELECT "id", "nirmal_vidya_vimeo_url", "start_time", "end_time", "thumbnail_id", "video_url", "updated_at", "created_at", "_status" FROM \`lectures\`;`,
  )
  await db.run(sql`DROP TABLE \`lectures\`;`)
  await db.run(sql`ALTER TABLE \`__new_lectures\` RENAME TO \`lectures\`;`)
  await db.run(sql`CREATE INDEX \`lectures_thumbnail_idx\` ON \`lectures\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_updated_at_idx\` ON \`lectures\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lectures_created_at_idx\` ON \`lectures\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`lectures__status_idx\` ON \`lectures\` (\`_status\`);`)
}
