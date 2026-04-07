import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`meditation_tags_timings\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`meditation_tags_timings_order_idx\` ON \`meditation_tags_timings\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_timings_parent_idx\` ON \`meditation_tags_timings\` (\`parent_id\`);`)
  await db.run(sql`DROP TABLE \`meditations_rels\`;`)
  await db.run(sql`DROP TABLE \`_meditations_v_rels\`;`)
  await db.run(sql`ALTER TABLE \`meditation_tags_locales\` ADD \`morning_meditation_id\` integer REFERENCES meditations(id);`)
  await db.run(sql`ALTER TABLE \`meditation_tags_locales\` ADD \`afternoon_meditation_id\` integer REFERENCES meditations(id);`)
  await db.run(sql`ALTER TABLE \`meditation_tags_locales\` ADD \`evening_meditation_id\` integer REFERENCES meditations(id);`)
  await db.run(sql`ALTER TABLE \`meditation_tags_locales\` ADD \`night_meditation_id\` integer REFERENCES meditations(id);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_morning_meditation_idx\` ON \`meditation_tags_locales\` (\`morning_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_afternoon_meditation_idx\` ON \`meditation_tags_locales\` (\`afternoon_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_evening_meditation_idx\` ON \`meditation_tags_locales\` (\`evening_meditation_id\`,\`_locale\`);`)
  await db.run(sql`CREATE INDEX \`meditation_tags_night_meditation_idx\` ON \`meditation_tags_locales\` (\`night_meditation_id\`,\`_locale\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
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
  await db.run(sql`CREATE TABLE \`_meditations_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`meditation_tags_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_meditations_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditation_tags_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_meditations_v_rels_order_idx\` ON \`_meditations_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_rels_parent_idx\` ON \`_meditations_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_rels_path_idx\` ON \`_meditations_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_meditations_v_rels_meditation_tags_id_idx\` ON \`_meditations_v_rels\` (\`meditation_tags_id\`);`)
  await db.run(sql`DROP TABLE \`meditation_tags_timings\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_meditation_tags_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`meditation_tags\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_meditation_tags_locales\`("title", "id", "_locale", "_parent_id") SELECT "title", "id", "_locale", "_parent_id" FROM \`meditation_tags_locales\`;`)
  await db.run(sql`DROP TABLE \`meditation_tags_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_meditation_tags_locales\` RENAME TO \`meditation_tags_locales\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`meditation_tags_locales_locale_parent_id_unique\` ON \`meditation_tags_locales\` (\`_locale\`,\`_parent_id\`);`)
}
