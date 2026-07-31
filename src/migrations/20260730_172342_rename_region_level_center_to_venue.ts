import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Hand-edited away from the generated drop/recreate. As generated, this cast the
// column to text, dropped the type, recreated it without 'center', then cast back
// with `USING "level"::"enum_regions_level"` — which throws
// `22P02 invalid input value for enum enum_regions_level: "center"` on every
// existing 'center' row (44 in prod). Verified against a scratch schema: the
// generated form fails, `RENAME VALUE` succeeds, preserves the column default and
// reverses cleanly. Per .claude/rules/migrations.md this is augmentation case 1 —
// the migration fails without the edit.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_regions_level" RENAME VALUE 'center' TO 'venue';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_regions_level" RENAME VALUE 'venue' TO 'center';`)
}
