import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Stage 1 of 3 (additive) — see 20260604_070512 (backfill) and 20260604_070513
// (removal). Split from a single generated migration so the polymorphic
// `meditation` conversion can backfill existing links before the old
// `lessons_locales.meditation_id` column is dropped (no Path step loses its
// meditation). This stage only ADDS: the `lessons_rels` join table that now
// stores the polymorphic relationship, and the `pre_meditation_lines` override
// column. The old `meditation_id` column stays until stage 3.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`lessons_rels\` (
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
  await db.run(sql`CREATE INDEX \`lessons_rels_order_idx\` ON \`lessons_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_parent_idx\` ON \`lessons_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_path_idx\` ON \`lessons_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_locale_idx\` ON \`lessons_rels\` (\`locale\`);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_meditations_id_idx\` ON \`lessons_rels\` (\`meditations_id\`,\`locale\`);`)
  await db.run(sql`CREATE INDEX \`lessons_rels_videos_id_idx\` ON \`lessons_rels\` (\`videos_id\`,\`locale\`);`)
  // Additive column — existing rows stay SQL NULL ("not overridden").
  await db.run(sql`ALTER TABLE \`lessons_locales\` ADD \`pre_meditation_lines\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`lessons_locales\` DROP COLUMN \`pre_meditation_lines\`;`)
  await db.run(sql`DROP TABLE \`lessons_rels\`;`)
}
