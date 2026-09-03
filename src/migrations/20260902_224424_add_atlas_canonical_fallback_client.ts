import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_config" ADD COLUMN "canonical_fallback_client_id" integer;
  ALTER TABLE "sy_atlas_config" ADD CONSTRAINT "sy_atlas_config_canonical_fallback_client_id_clients_id_fk" FOREIGN KEY ("canonical_fallback_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "sy_atlas_config_canonical_fallback_client_idx" ON "sy_atlas_config" USING btree ("canonical_fallback_client_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_config" DROP CONSTRAINT "sy_atlas_config_canonical_fallback_client_id_clients_id_fk";
  
  DROP INDEX "sy_atlas_config_canonical_fallback_client_idx";
  ALTER TABLE "sy_atlas_config" DROP COLUMN "canonical_fallback_client_id";`)
}
