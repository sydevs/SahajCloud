import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Data only: no schema change, so the snapshot is the previous migration's.
 *
 * Two Path Steps hold French in their English panel slots, typed there while
 * `panels` was shared across every language (#977). This gives each of those
 * steps a French panel list of its own, copied from its English one, so the
 * French survives whoever restores the English text over the top of it.
 *
 * A step is skipped once it has French panels of its own, so this inserts
 * nothing on a second apply and nothing over a translator's own work. The
 * derived row id is what lets `down` delete these rows and leave those alone.
 *
 * The match is a substring rather than the whole string, and carries no
 * apostrophe or accent: a migration that matched nothing would still record as
 * applied, so one curly quote would make this unrepeatable.
 */

const FRENCH_ROW_ID = sql`substr(md5("en"."id" || ':fr'), 1, 24)`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  INSERT INTO "lessons_panels"
    ("_order", "_parent_id", "_locale", "id", "title", "text", "media_id", "subtitles")
  SELECT
    "en"."_order",
    "en"."_parent_id",
    'fr',
    ${FRENCH_ROW_ID},
    "en"."title",
    "en"."text",
    "en"."media_id",
    "en"."subtitles"
  FROM "lessons_panels" AS "en"
  WHERE "en"."_locale" = 'en'
    AND "en"."_parent_id" IN (
      SELECT "_parent_id" FROM "lessons_panels"
      WHERE "_locale" = 'en'
        AND ("text" LIKE '%Votre Kundalini%' OR "title" LIKE '%-ce que la Kundalini%')
    )
    AND NOT EXISTS (
      SELECT 1 FROM "lessons_panels" AS "existing"
      WHERE "existing"."_locale" = 'fr'
        AND "existing"."_parent_id" = "en"."_parent_id"
    );`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DELETE FROM "lessons_panels" AS "fr"
  USING "lessons_panels" AS "en"
  WHERE "fr"."_locale" = 'fr'
    AND "en"."_locale" = 'en'
    AND "fr"."_parent_id" = "en"."_parent_id"
    AND "fr"."id" = ${FRENCH_ROW_ID};`)
}
