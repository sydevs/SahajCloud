import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `user_submissions.routing_region_id` — the region whose manager reviews a
 * proposal, moved out of the `region_hint` JSON column so the access layer can
 * query it with an index (#1068).
 *
 * ⚠ **The backfill is hand-added, and the column is useless without it.**
 * `managerSubmissionScope` stops querying `region_hint` in the same change, so
 * a proposal routed only by the hint — one for a city the atlas does not hold
 * yet — becomes unreadable by the very manager `deliverProposal` mailed it to
 * until this `UPDATE` runs. Requested on the PR review thread rather than
 * decided here, per `AGENTS.md`.
 *
 * ⚠ **Both guards keep a failure out of the boot migration**, which would
 * crash-loop the deploy rather than report anything. `jsonb_typeof` is why no
 * cast can throw: the column is a closed `strictObject` of `z.int()`, so a
 * non-numeric value is unreachable today and a text one would abort every
 * later migration in the chain. `EXISTS` is why no row can violate the new
 * foreign key: the hint records ids that were live when it was written, and a
 * region deleted since is simply not routable.
 *
 * `region_hint` keeps all three keys. Nothing reads `.state` or `.country` any
 * more, but dropping either from the schema makes every row still carrying it
 * fail validation on its next save — the reviewer's own Accept included.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_submissions" ADD COLUMN "routing_region_id" integer;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_routing_region_id_regions_id_fk" FOREIGN KEY ("routing_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "user_submissions_routing_region_idx" ON "user_submissions" USING btree ("routing_region_id");`)

  await db.execute(sql`
  UPDATE "user_submissions" AS s
     SET "routing_region_id" = routed.candidate
    FROM (
      SELECT
        "id",
        COALESCE(
          "region_id",
          CASE WHEN jsonb_typeof("region_hint" -> 'anchorRegion') = 'number'
            THEN ("region_hint" ->> 'anchorRegion')::integer END,
          CASE WHEN jsonb_typeof("region_hint" -> 'state') = 'number'
            THEN ("region_hint" ->> 'state')::integer END,
          CASE WHEN jsonb_typeof("region_hint" -> 'country') = 'number'
            THEN ("region_hint" ->> 'country')::integer END
        ) AS candidate
      FROM "user_submissions"
      WHERE "type" = 'proposal'
    ) AS routed
   WHERE s."id" = routed."id"
     AND routed.candidate IS NOT NULL
     AND EXISTS (SELECT 1 FROM "regions" r WHERE r."id" = routed.candidate);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_submissions" DROP CONSTRAINT "user_submissions_routing_region_id_regions_id_fk";

  DROP INDEX "user_submissions_routing_region_idx";
  ALTER TABLE "user_submissions" DROP COLUMN "routing_region_id";`)
}
