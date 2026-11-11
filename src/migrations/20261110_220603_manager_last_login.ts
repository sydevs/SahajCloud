import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `last_login_at`, stamped by `createSession` from now on (#908).
 *
 * The backfill is a hand edit, which the owner asked for: without it every
 * manager imported from Atlas reads "Never" until their next sign-in. It
 * projects the imported row the same table holds, as #1087's does. Only a
 * string is cast; anything else stays NULL.
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
