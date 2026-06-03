import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`lessons_prescreen_lines\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`line\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`lessons_prescreen_lines_order_idx\` ON \`lessons_prescreen_lines\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`lessons_prescreen_lines_parent_id_idx\` ON \`lessons_prescreen_lines\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_prescreen_lines_locale_idx\` ON \`lessons_prescreen_lines\` (\`_locale\`);`)
  await db.run(sql`ALTER TABLE \`lessons\` ADD \`meditation_kind\` text DEFAULT 'audio' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`lessons_locales\` ADD \`video_id\` integer REFERENCES videos(id);`)
  await db.run(sql`CREATE INDEX \`lessons_video_idx\` ON \`lessons_locales\` (\`video_id\`,\`_locale\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`lessons_prescreen_lines\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lessons_locales\` (
  	\`meditation_id\` integer,
  	\`article\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`meditation_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lessons_locales\`("meditation_id", "article", "id", "_locale", "_parent_id") SELECT "meditation_id", "article", "id", "_locale", "_parent_id" FROM \`lessons_locales\`;`)
  await db.run(sql`DROP TABLE \`lessons_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons_locales\` RENAME TO \`lessons_locales\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lessons_meditation_idx\` ON \`lessons_locales\` (\`meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`lessons_locales_locale_parent_id_unique\` ON \`lessons_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`lessons\` DROP COLUMN \`meditation_kind\`;`)
}
