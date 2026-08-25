import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sy_atlas_config_languages_code" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TABLE "sy_atlas_config_languages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"code" "enum_sy_atlas_config_languages_code" NOT NULL
  );
  
  ALTER TABLE "sy_atlas_config_languages" ADD CONSTRAINT "sy_atlas_config_languages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sy_atlas_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sy_atlas_config_languages_order_idx" ON "sy_atlas_config_languages" USING btree ("_order");
  CREATE INDEX "sy_atlas_config_languages_parent_id_idx" ON "sy_atlas_config_languages" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "sy_atlas_config_languages" CASCADE;
  DROP TYPE "public"."enum_sy_atlas_config_languages_code";`)
}
