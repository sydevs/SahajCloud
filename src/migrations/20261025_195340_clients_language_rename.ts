import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Rename `Clients.locale` to `Clients.language`: a service's own preferred
// language, on a collection that is not localized, so `locale` read as
// Payload's localization locale and invited a rule derived from the column's
// name (#980).
//
// This intentionally diverges from Payload's default generated SQL, which adds
// the new column and then drops the old one — blanking the configured language
// of every service already in the database. `ALTER TABLE ... RENAME COLUMN`
// carries the values across instead, and `ALTER TYPE ... RENAME TO` carries
// the enum: the member lists are byte-identical either side, since only the
// field's name changed, so nothing is retyped and no row is recast.
//
// `_clients_v.published_locale` is Payload's own localization column and is
// left alone; only the field's own `version_locale` copy moves.
//
// The .json snapshot is generated, and records the same end state a rename
// produces; only these up/down bodies are hand-written.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" RENAME COLUMN "locale" TO "language";
  ALTER TABLE "_clients_v" RENAME COLUMN "version_locale" TO "version_language";
  ALTER TYPE "public"."enum_clients_locale" RENAME TO "enum_clients_language";
  ALTER TYPE "public"."enum__clients_v_version_locale" RENAME TO "enum__clients_v_version_language";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" RENAME COLUMN "language" TO "locale";
  ALTER TABLE "_clients_v" RENAME COLUMN "version_language" TO "version_locale";
  ALTER TYPE "public"."enum_clients_language" RENAME TO "enum_clients_locale";
  ALTER TYPE "public"."enum__clients_v_version_language" RENAME TO "enum__clients_v_version_locale";`)
}
