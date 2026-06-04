import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Stage 3 of 3 (removal) — drops the now-redundant `lessons_locales.meditation_id`
// column via a table rebuild, after the backfill (20260604_070512) copied every
// link into `lessons_rels`. SQLite can't drop a column in place when it carries
// an index/FK, so the table is recreated without it. `pre_meditation_lines`
// already exists (added in stage 1), so the INSERT ... SELECT is safe — this is
// why the conversion was split rather than left as the single generated rebuild
// (which selected pre_meditation_lines from a table that didn't have it yet).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lessons_locales\` (
  	\`pre_meditation_lines\` text,
  	\`article\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lessons\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lessons_locales\`("pre_meditation_lines", "article", "id", "_locale", "_parent_id") SELECT "pre_meditation_lines", "article", "id", "_locale", "_parent_id" FROM \`lessons_locales\`;`)
  await db.run(sql`DROP TABLE \`lessons_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_lessons_locales\` RENAME TO \`lessons_locales\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`lessons_locales_locale_parent_id_unique\` ON \`lessons_locales\` (\`_locale\`,\`_parent_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Re-add meditation_id and restore links from lessons_rels BEFORE the backfill
  // stage's down() removes those rels rows, so a full rollback keeps every
  // meditation. Video links can't map back to a single meditation_id and are
  // intentionally dropped on rollback.
  await db.run(sql`ALTER TABLE \`lessons_locales\` ADD \`meditation_id\` integer REFERENCES meditations(id);`)
  await db.run(
    sql`CREATE INDEX \`lessons_meditation_idx\` ON \`lessons_locales\` (\`meditation_id\`,\`_locale\`);`,
  )
  await db.run(sql`UPDATE \`lessons_locales\` SET \`meditation_id\` = (
    SELECT \`r\`.\`meditations_id\` FROM \`lessons_rels\` \`r\`
    WHERE \`r\`.\`parent_id\` = \`lessons_locales\`.\`_parent_id\`
      AND \`r\`.\`locale\` = \`lessons_locales\`.\`_locale\`
      AND \`r\`.\`path\` = 'meditation'
      AND \`r\`.\`meditations_id\` IS NOT NULL
    LIMIT 1
  );`)
}
