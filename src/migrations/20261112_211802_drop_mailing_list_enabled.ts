import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * A chosen provider is now what turns a service's mailing list on, so the
 * separate switch goes. A list that was switched off keeps that meaning by
 * losing its provider; its other settings stay stored, unused.
 *
 * `down` restores the switch as on wherever a provider remains — the only state
 * the new rule could have left behind. It cannot restore a provider `up` cleared.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "clients" SET "mailing_list_provider" = NULL
   WHERE "mailing_list_enabled" IS NOT TRUE AND "mailing_list_provider" IS NOT NULL;
   ALTER TABLE "clients" DROP COLUMN "mailing_list_enabled";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" ADD COLUMN "mailing_list_enabled" boolean DEFAULT false;
   UPDATE "clients" SET "mailing_list_enabled" = true WHERE "mailing_list_provider" IS NOT NULL;`)
}
