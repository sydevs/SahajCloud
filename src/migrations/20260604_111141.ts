import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`lessons_rels\` ADD \`lectures_id\` integer REFERENCES lectures(id);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_lectures_id_idx\` ON \`lessons_rels\` (\`lectures_id\`,\`locale\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lessons_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`locale\` text,
  	\`meditations_id\` integer,
  	\`videos_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`meditations_id\`) REFERENCES \`meditations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`videos_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lessons_rels\`("id", "order", "parent_id", "path", "locale", "meditations_id", "videos_id") SELECT "id", "order", "parent_id", "path", "locale", "meditations_id", "videos_id" FROM \`lessons_rels\`;`)
  await db.run(sql`DROP TABLE \`lessons_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons_rels\` RENAME TO \`lessons_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lessons_rels_order_idx\` ON \`lessons_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_parent_idx\` ON \`lessons_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_path_idx\` ON \`lessons_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_locale_idx\` ON \`lessons_rels\` (\`locale\`);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_meditations_id_idx\` ON \`lessons_rels\` (\`meditations_id\`,\`locale\`);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_videos_id_idx\` ON \`lessons_rels\` (\`videos_id\`,\`locale\`);`)
}
