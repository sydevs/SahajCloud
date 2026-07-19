import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_registrations_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  ALTER TABLE "clients" ADD COLUMN "logo_id" integer;
  ALTER TABLE "clients" ADD COLUMN "website_url" varchar;
  ALTER TABLE "clients" ADD COLUMN "support_email" varchar;
  ALTER TABLE "_clients_v" ADD COLUMN "version_logo_id" integer;
  ALTER TABLE "_clients_v" ADD COLUMN "version_website_url" varchar;
  ALTER TABLE "_clients_v" ADD COLUMN "version_support_email" varchar;
  ALTER TABLE "registrations" ADD COLUMN "client_id" integer;
  ALTER TABLE "registrations" ADD COLUMN "locale" "enum_registrations_locale" DEFAULT 'en';
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "emails" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_emails" jsonb;
  ALTER TABLE "clients" ADD CONSTRAINT "clients_logo_id_images_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clients_v" ADD CONSTRAINT "_clients_v_version_logo_id_images_id_fk" FOREIGN KEY ("version_logo_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "registrations" ADD CONSTRAINT "registrations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "clients_logo_idx" ON "clients" USING btree ("logo_id");
  CREATE INDEX "_clients_v_version_version_logo_idx" ON "_clients_v" USING btree ("version_logo_id");
  CREATE INDEX "registrations_client_idx" ON "registrations" USING btree ("client_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" DROP CONSTRAINT "clients_logo_id_images_id_fk";
  
  ALTER TABLE "_clients_v" DROP CONSTRAINT "_clients_v_version_logo_id_images_id_fk";
  
  ALTER TABLE "registrations" DROP CONSTRAINT "registrations_client_id_clients_id_fk";
  
  DROP INDEX "clients_logo_idx";
  DROP INDEX "_clients_v_version_version_logo_idx";
  DROP INDEX "registrations_client_idx";
  ALTER TABLE "clients" DROP COLUMN "logo_id";
  ALTER TABLE "clients" DROP COLUMN "website_url";
  ALTER TABLE "clients" DROP COLUMN "support_email";
  ALTER TABLE "_clients_v" DROP COLUMN "version_logo_id";
  ALTER TABLE "_clients_v" DROP COLUMN "version_website_url";
  ALTER TABLE "_clients_v" DROP COLUMN "version_support_email";
  ALTER TABLE "registrations" DROP COLUMN "client_id";
  ALTER TABLE "registrations" DROP COLUMN "locale";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "emails";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_emails";
  DROP TYPE "public"."enum_registrations_locale";`)
}
