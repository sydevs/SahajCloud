import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`lectures_subtitles\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`locale\` text,
  	\`url\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`lectures_subtitles_order_idx\` ON \`lectures_subtitles\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lectures_subtitles_parent_id_idx\` ON \`lectures_subtitles\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`lecture_clips_subtitles\`;`)
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
  	\`audiences_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lectures_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_app_cards_rels\`("id", "order", "parent_id", "path", "lectures_id", "albums_id", "meditations_id", "audiences_id") SELECT "id", "order", "parent_id", "path", "lectures_id", "albums_id", "meditations_id", "audiences_id" FROM \`app_cards_rels\`;`)
  await db.run(sql`DROP TABLE \`app_cards_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_app_cards_rels\` RENAME TO \`app_cards_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_order_idx\` ON \`app_cards_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_parent_idx\` ON \`app_cards_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_path_idx\` ON \`app_cards_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_lectures_id_idx\` ON \`app_cards_rels\` (\`lectures_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_albums_id_idx\` ON \`app_cards_rels\` (\`albums_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_meditations_id_idx\` ON \`app_cards_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_audiences_id_idx\` ON \`app_cards_rels\` (\`audiences_id\`);`)
  await db.run(sql`CREATE TABLE \`__new__app_cards_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`lectures_id\` integer,
  	\`albums_id\` integer,
  	\`meditations_id\` integer,
  	\`audiences_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_app_cards_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lectures_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new__app_cards_v_rels\`("id", "order", "parent_id", "path", "lectures_id", "albums_id", "meditations_id", "audiences_id") SELECT "id", "order", "parent_id", "path", "lectures_id", "albums_id", "meditations_id", "audiences_id" FROM \`_app_cards_v_rels\`;`)
  await db.run(sql`DROP TABLE \`_app_cards_v_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new__app_cards_v_rels\` RENAME TO \`_app_cards_v_rels\`;`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_order_idx\` ON \`_app_cards_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_parent_idx\` ON \`_app_cards_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_path_idx\` ON \`_app_cards_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_lectures_id_idx\` ON \`_app_cards_v_rels\` (\`lectures_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_albums_id_idx\` ON \`_app_cards_v_rels\` (\`albums_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_meditations_id_idx\` ON \`_app_cards_v_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_audiences_id_idx\` ON \`_app_cards_v_rels\` (\`audiences_id\`);`)
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
  	\`audiences_id\` integer,
  	\`user_choices_id\` integer,
  	\`subtle_system_nodes_id\` integer,
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
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`user_choices_id\`) REFERENCES \`user_choices\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`subtle_system_nodes_id\`) REFERENCES \`subtle_system_nodes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`song_tags_id\`) REFERENCES \`song_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`managers_id\`) REFERENCES \`managers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`app_cards_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`forms_id\`) REFERENCES \`forms\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`form_submissions_id\`) REFERENCES \`form_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "pages_id", "meditations_id", "songs_id", "albums_id", "videos_id", "lessons_id", "lectures_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "audiences_id", "user_choices_id", "subtle_system_nodes_id", "song_tags_id", "managers_id", "clients_id", "app_cards_id", "forms_id", "form_submissions_id") SELECT "id", "order", "parent_id", "path", "pages_id", "meditations_id", "songs_id", "albums_id", "videos_id", "lessons_id", "lectures_id", "frames_id", "narrators_id", "authors_id", "images_id", "files_id", "audiences_id", "user_choices_id", "subtle_system_nodes_id", "song_tags_id", "managers_id", "clients_id", "app_cards_id", "forms_id", "form_submissions_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_meditations_id_idx\` ON \`payload_locked_documents_rels\` (\`meditations_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_songs_id_idx\` ON \`payload_locked_documents_rels\` (\`songs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_albums_id_idx\` ON \`payload_locked_documents_rels\` (\`albums_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_videos_id_idx\` ON \`payload_locked_documents_rels\` (\`videos_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lessons_id_idx\` ON \`payload_locked_documents_rels\` (\`lessons_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lectures_id_idx\` ON \`payload_locked_documents_rels\` (\`lectures_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_frames_id_idx\` ON \`payload_locked_documents_rels\` (\`frames_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_narrators_id_idx\` ON \`payload_locked_documents_rels\` (\`narrators_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_authors_id_idx\` ON \`payload_locked_documents_rels\` (\`authors_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_images_id_idx\` ON \`payload_locked_documents_rels\` (\`images_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_files_id_idx\` ON \`payload_locked_documents_rels\` (\`files_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_audiences_id_idx\` ON \`payload_locked_documents_rels\` (\`audiences_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_user_choices_id_idx\` ON \`payload_locked_documents_rels\` (\`user_choices_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_subtle_system_nodes_id_idx\` ON \`payload_locked_documents_rels\` (\`subtle_system_nodes_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_song_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`song_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_managers_id_idx\` ON \`payload_locked_documents_rels\` (\`managers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`clients_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_app_cards_id_idx\` ON \`payload_locked_documents_rels\` (\`app_cards_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_forms_id_idx\` ON \`payload_locked_documents_rels\` (\`forms_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_form_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`form_submissions_id\`);`)
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
  await db.run(sql`INSERT INTO \`__new_wm_app_config_locales\`("self_realization_meditation_id", "post_realization_lecture_id", "id", "_locale", "_parent_id") SELECT "self_realization_meditation_id", "post_realization_lecture_id", "id", "_locale", "_parent_id" FROM \`wm_app_config_locales\`;`)
  await db.run(sql`DROP TABLE \`wm_app_config_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_wm_app_config_locales\` RENAME TO \`wm_app_config_locales\`;`)
  await db.run(sql`CREATE INDEX \`wm_app_config_self_realization_meditation_idx\` ON \`wm_app_config_locales\` (\`self_realization_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_post_realization_lecture_idx\` ON \`wm_app_config_locales\` (\`post_realization_lecture_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`wm_app_config_locales_locale_parent_id_unique\` ON \`wm_app_config_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`DROP INDEX \`lectures_nirmal_vidya_vimeo_url_idx\`;`)
  await db.run(sql`ALTER TABLE \`lectures\` ADD \`start_time\` numeric;`)
  await db.run(sql`ALTER TABLE \`lectures\` ADD \`end_time\` numeric;`)
  await db.run(sql`ALTER TABLE \`lectures\` ADD \`full_lecture_id\` integer REFERENCES lectures(id);`)
  await db.run(sql`CREATE INDEX \`lectures_full_lecture_idx\` ON \`lectures\` (\`full_lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_nirmal_vidya_vimeo_url_idx\` ON \`lectures\` (\`nirmal_vidya_vimeo_url\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`lecture_clips_subtitles\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`locale\` text NOT NULL,
  	\`url\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`lecture_clips_subtitles_order_idx\` ON \`lecture_clips_subtitles\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_subtitles_parent_id_idx\` ON \`lecture_clips_subtitles\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`lecture_clips\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`lecture_id\` integer NOT NULL,
  	\`start_time\` numeric DEFAULT 0 NOT NULL,
  	\`end_time\` numeric DEFAULT 600 NOT NULL,
  	\`thumbnail_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`lecture_clips_lecture_idx\` ON \`lecture_clips\` (\`lecture_id\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_thumbnail_idx\` ON \`lecture_clips\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_updated_at_idx\` ON \`lecture_clips\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_created_at_idx\` ON \`lecture_clips\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`lecture_clips_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`lecture_clips_locales_locale_parent_id_unique\` ON \`lecture_clips_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`lecture_clips_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`audiences_id\` integer,
  	\`subtle_system_nodes_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`subtle_system_nodes_id\`) REFERENCES \`subtle_system_nodes\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`lecture_clips_rels_order_idx\` ON \`lecture_clips_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_rels_parent_idx\` ON \`lecture_clips_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_rels_path_idx\` ON \`lecture_clips_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_rels_audiences_id_idx\` ON \`lecture_clips_rels\` (\`audiences_id\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_rels_subtle_system_nodes_id_idx\` ON \`lecture_clips_rels\` (\`subtle_system_nodes_id\`);`)
  await db.run(sql`DROP TABLE \`lectures_subtitles\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lectures\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`nirmal_vidya_vimeo_url\` text NOT NULL,
  	\`thumbnail_id\` integer,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`thumbnail_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lectures\`("id", "nirmal_vidya_vimeo_url", "thumbnail_id", "metadata", "updated_at", "created_at") SELECT "id", "nirmal_vidya_vimeo_url", "thumbnail_id", "metadata", "updated_at", "created_at" FROM \`lectures\`;`)
  await db.run(sql`DROP TABLE \`lectures\`;`)
  await db.run(sql`ALTER TABLE \`__new_lectures\` RENAME TO \`lectures\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`lectures_nirmal_vidya_vimeo_url_idx\` ON \`lectures\` (\`nirmal_vidya_vimeo_url\`);`)
  await db.run(sql`CREATE INDEX \`lectures_thumbnail_idx\` ON \`lectures\` (\`thumbnail_id\`);`)
  await db.run(sql`CREATE INDEX \`lectures_updated_at_idx\` ON \`lectures\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lectures_created_at_idx\` ON \`lectures\` (\`created_at\`);`)
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
  await db.run(sql`INSERT INTO \`__new_wm_app_config_locales\`("self_realization_meditation_id", "post_realization_lecture_id", "id", "_locale", "_parent_id") SELECT "self_realization_meditation_id", "post_realization_lecture_id", "id", "_locale", "_parent_id" FROM \`wm_app_config_locales\`;`)
  await db.run(sql`DROP TABLE \`wm_app_config_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_wm_app_config_locales\` RENAME TO \`wm_app_config_locales\`;`)
  await db.run(sql`CREATE INDEX \`wm_app_config_self_realization_meditation_idx\` ON \`wm_app_config_locales\` (\`self_realization_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_post_realization_lecture_idx\` ON \`wm_app_config_locales\` (\`post_realization_lecture_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`wm_app_config_locales_locale_parent_id_unique\` ON \`wm_app_config_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`app_cards_rels\` ADD \`lecture_clips_id\` integer REFERENCES lecture_clips(id);`)
  await db.run(sql`CREATE INDEX \`app_cards_rels_lecture_clips_id_idx\` ON \`app_cards_rels\` (\`lecture_clips_id\`);`)
  await db.run(sql`ALTER TABLE \`_app_cards_v_rels\` ADD \`lecture_clips_id\` integer REFERENCES lecture_clips(id);`)
  await db.run(sql`CREATE INDEX \`_app_cards_v_rels_lecture_clips_id_idx\` ON \`_app_cards_v_rels\` (\`lecture_clips_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`lecture_clips_id\` integer REFERENCES lecture_clips(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_lecture_clips_id_idx\` ON \`payload_locked_documents_rels\` (\`lecture_clips_id\`);`)
}
