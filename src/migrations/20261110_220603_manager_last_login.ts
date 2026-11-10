import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `last_login_at` is when a manager last signed in, stamped by `createSession`
 * from now on (#908). The manager contacts table on Regions and Events shows it.
 *
 * The backfill below is a hand edit to a generated migration, which this folder
 * otherwise refuses. The owner asked for it on this PR: without it, every
 * manager imported from Atlas reads "Never" until their next sign-in, though
 * Atlas recorded one for most of them. The value is a pure projection of the
 * imported row the same table already holds, so no foreign key and no second
 * table is involved, as in #1087's.
 *
 * Only a string is cast. A JSON null, or a row imported before the field
 * existed in the extraction, stays NULL and reads "Never".
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "managers" ADD COLUMN "last_login_at" timestamp(3) with time zone;`)

  await db.execute(sql`
   UPDATE "managers"
      SET "last_login_at" = ("legacy_data" ->> 'lastLoginAt')::timestamptz
    WHERE jsonb_typeof("legacy_data" -> 'lastLoginAt') = 'string';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "managers" DROP COLUMN "last_login_at";`)
}
