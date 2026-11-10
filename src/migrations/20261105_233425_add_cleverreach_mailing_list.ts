import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * ⚠ The `_clients_v` statements this was generated with are gone, by hand.
 *
 * `20261106_094841_clients_one_site` drops that table, and carries the higher
 * timestamp — so on production this runs against a schema that no longer has
 * it, and `ALTER TABLE "_clients_v"` aborts the boot migration. The two
 * `clients` columns and the enum value are the whole of what `cleverreach`
 * needs now that the collection keeps no versions.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_clients_mailing_list_provider" ADD VALUE 'cleverreach';
  ALTER TABLE "clients" ADD COLUMN "mailing_list_client_id" varchar;
  ALTER TABLE "clients" ADD COLUMN "mailing_list_doi_flow_id" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" ALTER COLUMN "mailing_list_provider" SET DATA TYPE text;
  DROP TYPE "public"."enum_clients_mailing_list_provider";
  CREATE TYPE "public"."enum_clients_mailing_list_provider" AS ENUM('mailchimp', 'brevo', 'klaviyo');
  ALTER TABLE "clients" ALTER COLUMN "mailing_list_provider" SET DATA TYPE "public"."enum_clients_mailing_list_provider" USING "mailing_list_provider"::"public"."enum_clients_mailing_list_provider";
  ALTER TABLE "clients" DROP COLUMN "mailing_list_client_id";
  ALTER TABLE "clients" DROP COLUMN "mailing_list_doi_flow_id";`)
}
