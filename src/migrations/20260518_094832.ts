import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Add meditation_id to lessons_locales and backfill before the lessons table rebuild,
  // so we can read lessons.meditation_id while it still exists.
  await db.run(sql`ALTER TABLE \`lessons_locales\` ADD \`meditation_id\` integer REFERENCES meditations(id);`)
  await db.run(sql`UPDATE \`lessons_locales\` SET \`meditation_id\` = (SELECT \`meditation_id\` FROM \`lessons\` WHERE \`lessons\`.\`id\` = \`lessons_locales\`.\`_parent_id\`) WHERE \`_locale\` = 'en';`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lessons\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text NOT NULL,
  	\`intro_audio_id\` integer,
  	\`intro_subtitles\` text,
  	\`unit\` text NOT NULL,
  	\`step\` numeric NOT NULL,
  	\`icon_id\` integer NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`deleted_at\` text,
  	FOREIGN KEY (\`intro_audio_id\`) REFERENCES \`files\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`icon_id\`) REFERENCES \`images\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lessons\`("id", "title", "intro_audio_id", "intro_subtitles", "unit", "step", "icon_id", "updated_at", "created_at", "deleted_at") SELECT "id", "title", "intro_audio_id", "intro_subtitles", "unit", "step", "icon_id", "updated_at", "created_at", "deleted_at" FROM \`lessons\`;`)
  await db.run(sql`DROP TABLE \`lessons\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons\` RENAME TO \`lessons\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lessons_intro_audio_idx\` ON \`lessons\` (\`intro_audio_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_icon_idx\` ON \`lessons\` (\`icon_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_updated_at_idx\` ON \`lessons\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons_created_at_idx\` ON \`lessons\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons_deleted_at_idx\` ON \`lessons\` (\`deleted_at\`);`)
  await db.run(sql`CREATE INDEX \`lessons_meditation_idx\` ON \`lessons_locales\` (\`meditation_id\`,\`_locale\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lessons_locales\` (
  	\`article\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lessons_locales\`("article", "id", "_locale", "_parent_id") SELECT "article", "id", "_locale", "_parent_id" FROM \`lessons_locales\`;`)
  await db.run(sql`DROP TABLE \`lessons_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons_locales\` RENAME TO \`lessons_locales\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`lessons_locales_locale_parent_id_unique\` ON \`lessons_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`lessons\` ADD \`meditation_id\` integer REFERENCES meditations(id);`)
  await db.run(sql`CREATE INDEX \`lessons_meditation_idx\` ON \`lessons\` (\`meditation_id\`);`)
}
