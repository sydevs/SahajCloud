import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_clients_canonical_routing" AS ENUM('query', 'path');
  CREATE TYPE "public"."enum__clients_v_version_canonical_routing" AS ENUM('query', 'path');
  ALTER TABLE "clients" ADD COLUMN "canonical_enabled" boolean DEFAULT false;
  ALTER TABLE "clients" ADD COLUMN "canonical_domain" varchar;
  ALTER TABLE "clients" ADD COLUMN "canonical_mount" varchar DEFAULT '/';
  ALTER TABLE "clients" ADD COLUMN "canonical_routing" "enum_clients_canonical_routing" DEFAULT 'query';
  ALTER TABLE "clients" ADD COLUMN "embed_metadata" jsonb;
  ALTER TABLE "_clients_v" ADD COLUMN "version_canonical_enabled" boolean DEFAULT false;
  ALTER TABLE "_clients_v" ADD COLUMN "version_canonical_domain" varchar;
  ALTER TABLE "_clients_v" ADD COLUMN "version_canonical_mount" varchar DEFAULT '/';
  ALTER TABLE "_clients_v" ADD COLUMN "version_canonical_routing" "enum__clients_v_version_canonical_routing" DEFAULT 'query';
  ALTER TABLE "_clients_v" ADD COLUMN "version_embed_metadata" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" DROP COLUMN "canonical_enabled";
  ALTER TABLE "clients" DROP COLUMN "canonical_domain";
  ALTER TABLE "clients" DROP COLUMN "canonical_mount";
  ALTER TABLE "clients" DROP COLUMN "canonical_routing";
  ALTER TABLE "clients" DROP COLUMN "embed_metadata";
  ALTER TABLE "_clients_v" DROP COLUMN "version_canonical_enabled";
  ALTER TABLE "_clients_v" DROP COLUMN "version_canonical_domain";
  ALTER TABLE "_clients_v" DROP COLUMN "version_canonical_mount";
  ALTER TABLE "_clients_v" DROP COLUMN "version_canonical_routing";
  ALTER TABLE "_clients_v" DROP COLUMN "version_embed_metadata";
  DROP TYPE "public"."enum_clients_canonical_routing";
  DROP TYPE "public"."enum__clients_v_version_canonical_routing";`)
}
