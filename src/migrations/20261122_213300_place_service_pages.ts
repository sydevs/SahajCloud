import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// A website key reads only the pages `wm-web-config` places, and the Page tags
// that place most of them arrive empty, so without this the website would lose
// every page no configuration field names on the deploy that ships the clause
// (#783). The two lists are decisions, not measurements: the website takes every
// facet tag plus `subtle-system`, and the app takes `technique` (the technique
// pages its techniques page links to) plus `subtle-system`. The chakra and
// channel pages — every page a subtle-system node names — get `subtle-system`.
//
// It runs as its own migration because a new enum value cannot be used in the
// transaction that adds it, and each migration is its own transaction.
//
// ⚠ A configuration that already lists tags is left alone, and a page already
// carrying `subtle-system` gains no second row. The down migration removes every
// Page tag and every `subtle-system` tag, whoever set it.

type Db = MigrateUpArgs['db']

const SERVICE_TAGS = [
  {
    table: 'wm_web_config',
    tags: ['wisdom', 'lifestyle', 'creativity', 'event', 'technique', 'subtle-system'],
  },
  { table: 'wm_app_config', tags: ['technique', 'subtle-system'] },
]

/** Pages and their latest version row, each with its own tags table. */
const PAGE_TAG_TABLES = [
  {
    tags: '_pages_v_version_tags',
    enumType: 'enum__pages_v_version_tags',
    owners: sql`SELECT "v"."id" FROM "_pages_v" "v"
      JOIN "subtle_system_nodes" "n" ON "n"."page_id" = "v"."parent_id"
      WHERE "v"."latest"`,
  },
  {
    tags: 'pages_tags',
    enumType: 'enum_pages_tags',
    owners: sql`SELECT "page_id" FROM "subtle_system_nodes" WHERE "page_id" IS NOT NULL`,
  },
]

async function placeConfigs(db: Db): Promise<void> {
  for (const { table, tags } of SERVICE_TAGS) {
    const tagTable = sql.identifier(`${table}_page_tags`)
    const enumType = sql.identifier(`enum_${table}_page_tags`)
    await db.execute(sql`
      INSERT INTO ${tagTable} ("order", "parent_id", "value")
      SELECT "t"."ord", "c"."id", "t"."tag"::${enumType}
        FROM ${sql.identifier(table)} "c"
        CROSS JOIN unnest(ARRAY[${sql.join(
          tags.map((tag) => sql`${tag}`),
          sql`, `,
        )}]::text[]) WITH ORDINALITY AS "t"("tag", "ord")
        WHERE NOT EXISTS (SELECT 1 FROM ${tagTable} WHERE "parent_id" = "c"."id")`)
  }
}

async function tagNodePages(db: Db): Promise<void> {
  for (const { tags, enumType, owners } of PAGE_TAG_TABLES) {
    const tagTable = sql.identifier(tags)
    await db.execute(sql`
      INSERT INTO ${tagTable} ("order", "parent_id", "value")
      SELECT COALESCE(MAX("existing"."order"), 0) + 1, "o"."id", 'subtle-system'::${sql.identifier(enumType)}
        FROM (SELECT DISTINCT "id" FROM (${owners}) AS "owners"("id")) "o"
        LEFT JOIN ${tagTable} "existing" ON "existing"."parent_id" = "o"."id"
        WHERE NOT EXISTS (
          SELECT 1 FROM ${tagTable} "already"
            WHERE "already"."parent_id" = "o"."id" AND "already"."value" = 'subtle-system')
        GROUP BY "o"."id"`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await placeConfigs(db)
  await tagNodePages(db)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const { table } of SERVICE_TAGS) {
    await db.execute(sql`DELETE FROM ${sql.identifier(`${table}_page_tags`)}`)
  }
  for (const { tags } of PAGE_TAG_TABLES) {
    await db.execute(sql`DELETE FROM ${sql.identifier(tags)} WHERE "value" = 'subtle-system'`)
  }
}
