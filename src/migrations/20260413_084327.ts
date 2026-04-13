import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`wm_app_config_vibe_check_tracks\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`identifier\` text NOT NULL,
  	\`audio_id\` integer NOT NULL,
  	\`subtitles_id\` integer NOT NULL,
  	FOREIGN KEY (\`audio_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`subtitles_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`wm_app_config\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`wm_app_config_vibe_check_tracks_order_idx\` ON \`wm_app_config_vibe_check_tracks\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_vibe_check_tracks_parent_id_idx\` ON \`wm_app_config_vibe_check_tracks\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_vibe_check_tracks_locale_idx\` ON \`wm_app_config_vibe_check_tracks\` (\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_vibe_check_tracks_audio_idx\` ON \`wm_app_config_vibe_check_tracks\` (\`audio_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_vibe_check_tracks_subtitles_idx\` ON \`wm_app_config_vibe_check_tracks\` (\`subtitles_id\`);`)
  await db.run(sql`ALTER TABLE \`wm_app_config_locales\` ADD \`post_realization_lecture_id\` integer REFERENCES lectures(id);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_post_realization_lecture_idx\` ON \`wm_app_config_locales\` (\`post_realization_lecture_id\`,\`_locale\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`wm_app_config_vibe_check_tracks\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_wm_app_config_locales\` (
  	\`self_realization_meditation_id\` integer,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`self_realization_meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`wm_app_config\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_wm_app_config_locales\`("self_realization_meditation_id", "id", "_locale", "_parent_id") SELECT "self_realization_meditation_id", "id", "_locale", "_parent_id" FROM \`wm_app_config_locales\`;`)
  await db.run(sql`DROP TABLE \`wm_app_config_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_wm_app_config_locales\` RENAME TO \`wm_app_config_locales\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`wm_app_config_self_realization_meditation_idx\` ON \`wm_app_config_locales\` (\`self_realization_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`wm_app_config_locales_locale_parent_id_unique\` ON \`wm_app_config_locales\` (\`_locale\`,\`_parent_id\`);`)
}
