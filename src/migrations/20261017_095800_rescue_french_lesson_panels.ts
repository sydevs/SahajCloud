import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Data only: no schema change, so the snapshot is the previous migration's.
 *
 * Two Path Steps hold French in their English panel slots, typed there while
 * `panels` was shared across every language (#977). This gives each of those
 * steps a French panel list of its own, copied from its English one, so the
 * French survives whoever restores the English text over the top of it.
 *
 * Both halves are guarded, so this is a no-op on an environment with no Path
 * Steps and on one a translator has since edited: a step is matched by the
 * exact French string in its English panels, and is skipped entirely if it
 * already has French panels. Row ids are derived from the English row's, which
 * is what lets `down` delete only the rows this migration wrote.
 */

const FRENCH_IN_ENGLISH_SLOTS = sql`
  SELECT DISTINCT "_parent_id"
  FROM "lessons_panels"
  WHERE "_locale" = 'en'
    AND (
      "text" = '"Votre Kundalini elle-même vous donnera accès à la conscience sans pensée. Elle saura comment vous y faire parvenir."'
      OR "title" = 'Qu''est-ce que la Kundalini ?'
    )`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  INSERT INTO "lessons_panels"
    ("_order", "_parent_id", "_locale", "id", "title", "text", "media_id", "subtitles")
  SELECT
    "en"."_order",
    "en"."_parent_id",
    'fr',
    substr(md5("en"."id" || ':fr'), 1, 24),
    "en"."title",
    "en"."text",
    "en"."media_id",
    "en"."subtitles"
  FROM "lessons_panels" AS "en"
  WHERE "en"."_locale" = 'en'
    AND "en"."_parent_id" IN (${FRENCH_IN_ENGLISH_SLOTS})
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
    AND "fr"."id" = substr(md5("en"."id" || ':fr'), 1, 24);`)
}
