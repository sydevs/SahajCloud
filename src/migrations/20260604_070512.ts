import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Stage 2 of 3 (data-only backfill) — copies every existing localized
// `lessons_locales.meditation_id` link into the new polymorphic `lessons_rels`
// join table (path 'meditation', same locale, meditations_id). Runs after the
// additive stage (20260604_070511) and before the removal stage
// (20260604_070513), so no Path step loses its meditation. `meditation_id`
// remains the source of truth until stage 3 drops it.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`INSERT INTO \`lessons_rels\` (\`parent_id\`, \`path\`, \`order\`, \`locale\`, \`meditations_id\`)
    SELECT \`_parent_id\`, 'meditation', 1, \`_locale\`, \`meditation_id\`
    FROM \`lessons_locales\`
    WHERE \`meditation_id\` IS NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(
    sql`DELETE FROM \`lessons_rels\` WHERE \`path\` = 'meditation' AND \`meditations_id\` IS NOT NULL;`,
  )
}
