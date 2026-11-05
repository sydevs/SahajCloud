import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" ALTER COLUMN "color1" DROP DEFAULT;
  ALTER TABLE "clients" ALTER COLUMN "color2" DROP DEFAULT;
  ALTER TABLE "clients" ALTER COLUMN "color3" DROP DEFAULT;
  ALTER TABLE "_clients_v" ALTER COLUMN "version_color1" DROP DEFAULT;
  ALTER TABLE "_clients_v" ALTER COLUMN "version_color2" DROP DEFAULT;
  ALTER TABLE "_clients_v" ALTER COLUMN "version_color3" DROP DEFAULT;
  ALTER TABLE "clients" DROP COLUMN "key_generated_at";
  ALTER TABLE "_clients_v" DROP COLUMN "version_key_generated_at";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" ALTER COLUMN "color1" SET DEFAULT '#000000';
  ALTER TABLE "clients" ALTER COLUMN "color2" SET DEFAULT '#000000';
  ALTER TABLE "clients" ALTER COLUMN "color3" SET DEFAULT '#000000';
  ALTER TABLE "_clients_v" ALTER COLUMN "version_color1" SET DEFAULT '#000000';
  ALTER TABLE "_clients_v" ALTER COLUMN "version_color2" SET DEFAULT '#000000';
  ALTER TABLE "_clients_v" ALTER COLUMN "version_color3" SET DEFAULT '#000000';
  ALTER TABLE "clients" ADD COLUMN "key_generated_at" timestamp(3) with time zone;
  ALTER TABLE "_clients_v" ADD COLUMN "version_key_generated_at" timestamp(3) with time zone;`)
}
