import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "pages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"managers_id" integer
  );
  
  CREATE TABLE "_pages_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"managers_id" integer
  );
  
  DROP TABLE "managers_rels" CASCADE;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_rels_order_idx" ON "pages_rels" USING btree ("order");
  CREATE INDEX "pages_rels_parent_idx" ON "pages_rels" USING btree ("parent_id");
  CREATE INDEX "pages_rels_path_idx" ON "pages_rels" USING btree ("path");
  CREATE INDEX "pages_rels_managers_id_idx" ON "pages_rels" USING btree ("managers_id");
  CREATE INDEX "_pages_v_rels_order_idx" ON "_pages_v_rels" USING btree ("order");
  CREATE INDEX "_pages_v_rels_parent_idx" ON "_pages_v_rels" USING btree ("parent_id");
  CREATE INDEX "_pages_v_rels_path_idx" ON "_pages_v_rels" USING btree ("path");
  CREATE INDEX "_pages_v_rels_managers_id_idx" ON "_pages_v_rels" USING btree ("managers_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "managers_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer
  );
  
  DROP TABLE "pages_rels" CASCADE;
  DROP TABLE "_pages_v_rels" CASCADE;
  ALTER TABLE "managers_rels" ADD CONSTRAINT "managers_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "managers_rels" ADD CONSTRAINT "managers_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "managers_rels_order_idx" ON "managers_rels" USING btree ("order");
  CREATE INDEX "managers_rels_parent_idx" ON "managers_rels" USING btree ("parent_id");
  CREATE INDEX "managers_rels_path_idx" ON "managers_rels" USING btree ("path");
  CREATE INDEX "managers_rels_pages_id_idx" ON "managers_rels" USING btree ("pages_id");`)
}
