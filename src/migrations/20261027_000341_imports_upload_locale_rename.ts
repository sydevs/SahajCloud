import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Rename `imports.locale` to `imports.uploadLocale`: the admin locale an
// upload happened in, which says nothing about who may write the row — while a
// top-level column named `locale` IS a document's own language and so scopes
// its collection's writes (#912, #980, `docs/rules/access.md`).
//
// This intentionally diverges from Payload's default generated SQL, which adds
// the new column and then drops the old one — blanking the locale of every
// import already in the database, so a run still pending at the deploy would
// create its classes in the default language instead of the uploader's.
// `ALTER TABLE ... RENAME COLUMN` carries the values across. The column is
// `varchar` either side, carries no index and no enum type, so nothing is
// retyped and no row is recast.
//
// The .json snapshot is generated, and records the same end state a rename
// produces; only these up/down bodies are hand-written.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "imports" RENAME COLUMN "locale" TO "upload_locale";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "imports" RENAME COLUMN "upload_locale" TO "locale";`)
}
