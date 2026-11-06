import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_clients_mailing_list_provider" ADD VALUE 'cleverreach';
  ALTER TABLE "clients" ADD COLUMN "mailing_list_client_id" varchar;
  ALTER TABLE "clients" ADD COLUMN "mailing_list_doi_flow_id" varchar;
  ALTER TABLE "_clients_v" ADD COLUMN "version_mailing_list_client_id" varchar;
  ALTER TABLE "_clients_v" ADD COLUMN "version_mailing_list_doi_flow_id" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" ALTER COLUMN "mailing_list_provider" SET DATA TYPE text;
  ALTER TABLE "_clients_v" ALTER COLUMN "version_mailing_list_provider" SET DATA TYPE text;
  DROP TYPE "public"."enum_clients_mailing_list_provider";
  CREATE TYPE "public"."enum_clients_mailing_list_provider" AS ENUM('mailchimp', 'brevo', 'klaviyo');
  ALTER TABLE "clients" ALTER COLUMN "mailing_list_provider" SET DATA TYPE "public"."enum_clients_mailing_list_provider" USING "mailing_list_provider"::"public"."enum_clients_mailing_list_provider";
  ALTER TABLE "_clients_v" ALTER COLUMN "version_mailing_list_provider" SET DATA TYPE "public"."enum_clients_mailing_list_provider" USING "version_mailing_list_provider"::"public"."enum_clients_mailing_list_provider";
  ALTER TABLE "clients" DROP COLUMN "mailing_list_client_id";
  ALTER TABLE "clients" DROP COLUMN "mailing_list_doi_flow_id";
  ALTER TABLE "_clients_v" DROP COLUMN "version_mailing_list_client_id";
  ALTER TABLE "_clients_v" DROP COLUMN "version_mailing_list_doi_flow_id";`)
}
