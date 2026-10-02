import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sahaja_glossary_terms_category" AS ENUM('subtle-system', 'practice', 'phrase', 'app');
  CREATE TABLE "sahaja_glossary_terms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"category" "enum_sahaja_glossary_terms_category" NOT NULL,
  	"keep_as_is" boolean
  );
  
  CREATE TABLE "sahaja_glossary_terms_locales" (
  	"term" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "sahaja_glossary" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "sahaja_glossary_locales" (
  	"translator_notes" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "sahaja_glossary_terms" ADD CONSTRAINT "sahaja_glossary_terms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sahaja_glossary"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sahaja_glossary_terms_locales" ADD CONSTRAINT "sahaja_glossary_terms_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sahaja_glossary_terms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sahaja_glossary_locales" ADD CONSTRAINT "sahaja_glossary_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sahaja_glossary"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sahaja_glossary_terms_order_idx" ON "sahaja_glossary_terms" USING btree ("_order");
  CREATE INDEX "sahaja_glossary_terms_parent_id_idx" ON "sahaja_glossary_terms" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "sahaja_glossary_terms_locales_locale_parent_id_unique" ON "sahaja_glossary_terms_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "sahaja_glossary_locales_locale_parent_id_unique" ON "sahaja_glossary_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "sahaja_glossary_terms" CASCADE;
  DROP TABLE "sahaja_glossary_terms_locales" CASCADE;
  DROP TABLE "sahaja_glossary" CASCADE;
  DROP TABLE "sahaja_glossary_locales" CASCADE;
  DROP TYPE "public"."enum_sahaja_glossary_terms_category";`)
}
