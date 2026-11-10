import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Hand-edited from drizzle's drop + add: `name` is renamed in place, so every
// service keeps its internal name.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "clients" RENAME COLUMN "name" TO "label";
  ALTER TABLE "clients" ADD COLUMN "title" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "clients" DROP COLUMN "title";
  ALTER TABLE "clients" RENAME COLUMN "label" TO "name";`)
}
