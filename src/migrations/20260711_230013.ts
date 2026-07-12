import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Country slugs become ISO alpha-2 codes (belgium -> be), read from the raw
  // imported record (#556) — the Atlas derives the country code from the slug,
  // dropping deprecated legacyData.countryCode. webPath/webUrl are virtual
  // (resolved from current slugs per read), so no stored paths need backfill.
  // Guards: alpha-2-shaped codes only, and skip if another region already holds
  // the slug — a unique violation would abort the in-process boot migration.
  await db.execute(sql`
    UPDATE "regions" r
    SET "slug" = lower(r."legacy_data"->>'countryCode')
    WHERE r."level" = 'country'
      AND r."legacy_data"->>'countryCode' ~ '^[A-Za-z]{2}$'
      AND NOT EXISTS (
        SELECT 1 FROM "regions" other
        WHERE other."slug" = lower(r."legacy_data"->>'countryCode')
          AND other."id" <> r."id"
      );`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Forward-only: the old name-based slugs (with collision suffixes) aren't
  // recoverable in SQL, and no deployed Atlas links to them.
}
