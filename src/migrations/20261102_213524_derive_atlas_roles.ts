import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Hand-edited after `migrate:create`, in two places. Both are load-bearing.
 *
 * ⚠ **UP: the DELETE has to come first.** The generator's own
 * `USING "value"::"public"."enum_managers_roles"` cast throws
 * `invalid input value for enum` on any surviving `atlas-manager` row, so the
 * migration the generator wrote aborts the boot of every deploy that has one.
 *
 * ⚠ **DOWN: the enum is rebuilt rather than extended.** `ALTER TYPE … ADD
 * VALUE`, which the generator emitted, adds the member but Postgres refuses to
 * let the same transaction *use* it — and a migration runs in one — so the
 * INSERT below could not name it. Rebuilding creates a fresh type, which the
 * same transaction may use.
 *
 * DOWN is lossy by design: the role was assigned by hand and is now derived,
 * so nothing records who held it. It restores the grant to every manager
 * listed on a region, which is who holds the derived role going forward.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "managers_roles" WHERE "value" = 'atlas-manager';
  ALTER TABLE "managers_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_managers_roles";
  CREATE TYPE "public"."enum_managers_roles" AS ENUM('meditations-editor', 'path-editor', 'web-translator');
  ALTER TABLE "managers_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_managers_roles" USING "value"::"public"."enum_managers_roles";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "managers_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_managers_roles";
  CREATE TYPE "public"."enum_managers_roles" AS ENUM('meditations-editor', 'path-editor', 'web-translator', 'atlas-manager');
  ALTER TABLE "managers_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_managers_roles" USING "value"::"public"."enum_managers_roles";
  INSERT INTO "managers_roles" ("order", "parent_id", "value", "locale")
  SELECT
    COALESCE(
      (
        SELECT MAX("existing"."order")
        FROM "managers_roles" "existing"
        WHERE "existing"."parent_id" = "listed"."managers_id"
          AND "existing"."locale" = 'en'::"public"."_locales"
      ),
      0
    ) + 1,
    "listed"."managers_id",
    'atlas-manager'::"public"."enum_managers_roles",
    'en'::"public"."_locales"
  FROM (
    SELECT DISTINCT "managers_id"
    FROM "regions_rels"
    WHERE "path" = 'managers' AND "managers_id" IS NOT NULL
  ) AS "listed";`)
}
