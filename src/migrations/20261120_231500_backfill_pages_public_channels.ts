import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Existing pages arrive Web-on / App-off from the column defaults
// (20261120_231045_add_pages_public_channels), so only the exceptions move.
//
// ⚠ **Those four take App-on as well as Web-off, and the slug list is the only
// thing that can give it to them.** Three of them — `path`,
// `let-the-app-find-your-city`, `live-meditations-reminder` — are named by none
// of the three stored sources below, so Web-off alone would leave them readable
// by no service at all. The app reaches them by a route of its own, and it
// ships compiled: App-off there is unrecoverable, while App-on costs an editor
// one unticked box.
//
// ⚠ **The app's read set is wider than the fourteen `wm_app_config` slots.**
// All twelve `subtle-system-nodes.page` ids sit outside them, and that
// relationship is what renders a node's detail page in the app. Derived from
// the fourteen alone, this backfill would mark every chakra and channel page
// Web-only and the installed app would lose all twelve. The app-card
// destinations happen to sit inside the fourteen today, which is why the three
// columns are read rather than today's values.
//
// ⚠ **The ids are resolved in SQL, never listed here.** A list measured on one
// database is wrong on the next one, and this runs against production and every
// preview alike.
//
// ⚠ **`_pages_v` is mirrored, or the first publish undoes the backfill.**
// `pages` autosaves a draft every 60s and a publish loads the document it
// writes from the `latest` version row, so a row left at the column default
// there writes that default back over the main table.
//
// ⚠ **The Web-off half excepts any page `wm_web_config` names.** The slug list
// was measured against one database, and the website's required `homePage` —
// or any of its five page lists — answering `null` 404s the site. So the same
// rule the App half follows applies in reverse: read the stored sources, never
// trust the list.
//
// ⚠ **A page named only from another page's rich text is not reachable here.**
// `SubtleSystemBlock` and `ShowcaseBlock` keep their references inside the
// Lexical JSON, not in `pages_rels`. Today the pages the first names are the
// node pages below, so nothing is missed; a showcase card later aimed at a
// Web-only page arrives in the app as a bare id until an editor ticks the box.

/** The fourteen `wm-app-config` page slots (`WeMeditateAppConfig.ts`). */
const APP_CONFIG_PAGE_COLUMNS = [
  'classes_page_id',
  'live_meditations_page_id',
  'explore_page_id',
  'explore_deeper_page_id',
  'meditate_together_page_id',
  'techniques_page_id',
  'lectures_page_id',
  'lessons_page_id',
  'music_page_id',
  'shri_mataji_page_id',
  'sahaja_yoga_page_id',
  'subtle_system_page_id',
  'privacy_page_id',
  'terms_page_id',
]

/** An app card's three page destinations (`AppCards.ts`). */
const APP_CARD_PAGE_COLUMNS = ['default_page_id', 'starting_soon_page_id', 'live_now_page_id']

/** Where the website stores a page reference (`WeMeditateWebConfig.ts`). */
const WEB_CONFIG_PAGE_IDS = sql`SELECT "home_page_id" AS "id" FROM "wm_web_config"
  UNION SELECT "pages_id" AS "id" FROM "wm_web_config_rels"`

/** The pages the app alone reads: App-on, and the website stops seeing them. */
const APP_ONLY_SLUGS = ['explore', 'path', 'let-the-app-find-your-city', 'live-meditations-reminder']

type Db = MigrateUpArgs['db']

/** Every page id the app can reach today, from the three sources that store one. */
const appPageIds = sql.join(
  [
    ...APP_CONFIG_PAGE_COLUMNS.map(
      (column) => sql`SELECT ${sql.identifier(column)} AS "id" FROM "wm_app_config"`,
    ),
    sql`SELECT "page_id" AS "id" FROM "subtle_system_nodes"`,
    ...APP_CARD_PAGE_COLUMNS.map(
      (column) => sql`SELECT ${sql.identifier(column)} AS "id" FROM "app_cards"`,
    ),
  ],
  sql` UNION `,
)

/**
 * Page ids carrying one of the app-only slugs.
 *
 * ⚠ Spelled as an `IN` list of placeholders, never `= ANY($1)`: drizzle expands
 * an array parameter into a parenthesised tuple, which Postgres refuses with
 * "op ANY/ALL (array) requires array on right side" (measured).
 */
const appOnlyPageIds = sql`SELECT "id" FROM "pages" WHERE "slug" IN (${sql.join(
  APP_ONLY_SLUGS.map((slug) => sql`${slug}`),
  sql`, `,
)})`

/** Those pages, less any the website's own configuration still names. */
const webOffPageIds = sql`SELECT "id" FROM (${appOnlyPageIds}) AS "appOnly"
  WHERE "id" NOT IN (SELECT "id" FROM (${WEB_CONFIG_PAGE_IDS}) AS "webConfig" WHERE "id" IS NOT NULL)`

/**
 * Writes one channel column on `pages` and on its `latest` version row, for the
 * page ids the subquery answers.
 */
async function setChannel(
  db: Db,
  column: { main: string; version: string },
  value: boolean,
  ids: ReturnType<typeof sql>,
): Promise<void> {
  await db.execute(sql`
    UPDATE "pages" SET ${sql.identifier(column.main)} = ${value}
      WHERE "id" IN (SELECT "id" FROM (${ids}) AS "targets" WHERE "id" IS NOT NULL)`)

  await db.execute(sql`
    UPDATE "_pages_v" SET ${sql.identifier(column.version)} = ${value}
      WHERE "latest"
        AND "parent_id" IN (SELECT "id" FROM (${ids}) AS "targets" WHERE "id" IS NOT NULL)`)
}

const WEB = { main: 'published_to_web', version: 'version_published_to_web' }
const APP = { main: 'published_to_app', version: 'version_published_to_app' }

/** Every page that goes App-on: the stored references, plus the app-only slugs. */
const appOnIds = sql.join([appPageIds, appOnlyPageIds], sql` UNION `)

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await setChannel(db, APP, true, appOnIds)
  await setChannel(db, WEB, false, webOffPageIds)
}

/**
 * ⚠ Restores the column defaults, so it discards whatever an editor has chosen
 * since. There is nothing else to restore to: before this migration every row
 * held the default.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await setChannel(db, APP, false, appOnIds)
  await setChannel(db, WEB, true, webOffPageIds)
}
