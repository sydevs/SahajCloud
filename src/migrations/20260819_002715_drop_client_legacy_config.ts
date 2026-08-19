import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" DROP COLUMN "legacy_config";
  ALTER TABLE "_clients_v" DROP COLUMN "version_legacy_config";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" ADD COLUMN "legacy_config" jsonb;
  ALTER TABLE "_clients_v" ADD COLUMN "version_legacy_config" jsonb;`)
}
