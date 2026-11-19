# Data Seed Scripts

Scripts that write content into Payload CMS from a committed data file or from
what the target already holds. Every script extends `BaseImporter` for
idempotent, resilient runs.

⚠ **The one-shot content migrations are gone** (#1169). The legacy We Meditate
database, Storyblok, the meditation library, Cloudinary tags and the Sahaj Atlas
sync each ran to completion, so their importers, data dumps and `pnpm
atlas:sync` were deleted rather than left to rot against a schema they no longer
match. What is here is what is still run.

## Quick start

### CLI usage

`pnpm seed` is a thin HTTP client that calls the seed API endpoint. It can
target local development or production.

```bash
pnpm seed --help                 # Show available scripts
pnpm seed <script> --dry-run     # Validate (local dev)
pnpm seed <script>               # Full seed (idempotent — safe to re-run)
SAHAJCLOUD_URL=https://cloud.sydevelopers.com pnpm seed <script>  # Seed production
```

**Environment variables:**

- `SAHAJCLOUD_URL` — target URL (default: `http://localhost:PORT`)
- `ADMIN_TOKEN` — **only needed for a remote target**. A manager session token.
  ⚠ **There is no password to send instead** — `POST /api/managers/login`
  answers 403 everywhere since #840. **Get one from a sign-in link**, requested
  at the target's `/admin/login` as an admin manager, and hand it straight to
  the run:

  ```bash
  pnpm tsx scripts/redeem-signin-link.ts '<sign-in link>' --seed <script> [seed flags]
  ```

  It redeems the link the way the sign-in page's button does, checks the
  session against `/api/managers/me`, and runs `pnpm seed` with `ADMIN_TOKEN`
  and `SAHAJCLOUD_URL` taken from the link. **Nothing is saved**: the session
  expires within hours, so a copy in `.env.local` only goes stale. ⚠ It spends
  the link, so every run needs a fresh one — a dry run and the real run are
  two links. Without `--seed` it prints the token, for
  `export ADMIN_TOKEN=$(pnpm -s tsx scripts/redeem-signin-link.ts '<link>')`.
  Copying the `payload-token` cookie out of a signed-in browser still works.

  **An agent can run it with a link the operator pastes**, once the operator
  allows `Bash(pnpm tsx scripts/redeem-signin-link.ts *)` in the main
  checkout's `.claude/settings.local.json` (worktrees share it). Without that
  rule, Claude Code's auto mode refuses to turn a pasted link into a session,
  even when asked to. `--seed` runs `pnpm seed` and nothing else, so the rule
  grants no other command.

  `seeds/env.ts` resolves it the way Next.js does: a shell-exported (or
  command-prefixed) value wins, then `.env.local`, then `.env` — so the blank
  `ADMIN_TOKEN=` local dev keeps in `.env.local` never clobbers a credential
  passed for a production run.

**Seeding localhost needs no credentials.** Local dev enables Payload's
`admin.autoLogin` (`src/payload.config.ts`), applied in its JWT auth
strategy — a request with no token authenticates as that admin. The CLI
probes `/api/managers/me`. When the target auto-logs-in, it skips the
token step and sends requests with no `Authorization` header. Leave
`ADMIN_TOKEN` blank or unset locally — production and E2E disable
auto-login and fall through to the credential path on their own.

### API route

The CLI calls the seed API endpoint, which handles all import logic:

```
GET  /api/seed/<script>                    # Get metadata (collections, batch sizes)
POST /api/seed/<script>?dryRun=true        # Bulk import (all at once)
POST /api/seed/<script>?collection=X&offset=0&limit=25  # Paginated import
```

Requires an admin session (a Manager with `admin: true`). The response is
Server-Sent Events (SSE) with progress updates.

## Available scripts

| Script           | Command                      | Prerequisites                  | Targets                                             |
| ---------------- | ---------------------------- | ------------------------------ | --------------------------------------------------- |
| translations     | `pnpm seed translations`     | None                           | the three translation globals (see below)           |
| wm-web-locales   | `pnpm seed wm-web-locales`   | None                           | `wm-web-translations`, nine non-English locales     |
| file-transcripts | `pnpm seed file-transcripts` | ⚠ Paid runs — run only by name | transcripts (one queued run per untranscribed file) |

`translations` is the only one in `SCRIPT_RUN_ORDER`, so a bare `pnpm seed`
runs it alone. `file-transcripts` is deliberately out of it: every run it
queues is a paid vendor call. `wm-web-locales` is out of it too: it publishes
nine languages, which is an operator's decision.

### `translations` — real copy everywhere, and the locales it publishes

One script, three globals, and no generated strings left in any of them.
`wm-app-translations` and `wm-web-translations` both get real English copy
from their own `data.en.json`. #706 and #707 replaced the last two callers
of `generateExampleData`, so that generator is gone.

`sy-atlas-translations` reads one file per widget locale from
`seeds/sy-atlas-translations/data.<locale>.json` — `cs de en es fr hu nl
pt-BR ru uk` — and **publishes each locale on its own**. That is the point
of the script, not a side effect: `sy-atlas-config.availableLocales` refuses
a locale whose translations are not published (#705), so nothing an operator
does in the admin can offer a language until this has run.

**`wm-web-translations` is published in English too** (#707), so the CMS's
own answer to "is English published?" matches the copy it holds. Its
`_status` is a per-locale column (`localizeStatus`, #705), so publishing
English leaves every other locale a draft.

Four properties to preserve when you touch it:

- **Publishing needs `_status: 'published'` in the data.**
  `publishSpecificLocale` selects Payload's single-locale branch but does not
  decide the status. Without it the write lands and the locale stays `draft`.
- **`publishAllLocales` is not an option here.** It scopes itself through
  `filterAvailableLocales`, which answers `['en']` for a request with no
  user — every seed request.
- **`emails` and `event.title` hold live production data.** No seed file
  carries them, and English alone fills a key that is blank today. See
  `src/globals/AGENTS.md`.
- **Do not copy the publish onto `wm-app-translations`.** One `_status`
  covers every locale there, so publishing it would claim 19 translated
  languages from an English-only file.

⚠ **Two things the wm-web publish does not do**, both easy to assume:

- It is not what lets `wm-web-config.availableLocales` offer `en`. English is
  **exempt** from that field's publish gate by design — gating the one locale
  nobody can deselect would deadlock the save (`src/fields/availableLocalesField.ts`).
  The gate gates every _other_ locale.
- It does not change what a read returns. A global read comes back identical
  whether `draft` is true, false, or unset. The publish sets state.

A `plural: true` key is stored as its CLDR family (`<key>_one`/`_few`/
`_many`/`_other`), and since #705 the column's JSON Schema declares exactly
those names — so seed data must write the expanded keys, never the declared
one. English populates `_one` and `_other`; it has no `few` or `many` form,
and `pluralize()` falls back to `other`.

A key a locale has no translation for is **omitted, never blank**: the
client-read English merge serves English for it, and a blank would defeat
that merge.

⚠ **Every seed file's `_meta` header is stripped on import.** It is read by
people, and by `tests/unit/translations-seed-meta.spec.ts`, which derives the
tab, group and key counts `schema_version` quotes. The prefix before those
counts names the SahajCloud issue or PR that last changed the shape —
`post-#<n>`, a number this repo resolves, even when the change was asked for in
another repo.

⚠ **`seeds/wm-app-translations/` holds data, not a script.** Its
`data.en.json` and its `lexicalConverter.ts` — the seed's own Markdown →
Lexical conversion — are what `translations` reads. A `wm-app-translations`
script of its own existed until #1169 and was retired as a strict subset of
this one.

### `wm-web-locales` — the website's nine other languages

`translations` seeds English only for `wm-web-translations`. This script loads
`seeds/wm-web-translations/data.<locale>.json` for `ru it es fr de pt-BR cs uk bg`
(`WM_WEB_TRANSLATION_LOCALES` in `lib/dataFiles.ts`) and **publishes each locale
on its own**, through the same `seedLocaleFiles` loop the atlas global is seeded
with (`lib/TranslationGlobalsImporter.ts`). It writes nothing else: no English,
no `wm-app-translations`, no atlas global. That is why it is a script of its
own — `translations` would also overwrite the live English copy of the app
global and every atlas locale.

Facts a maintainer needs:

- **The drafts are machine-assisted and unreviewed by speakers** (owner decision,
  2026-11-18, sydevs/WeMeditateWeb#163): old wemeditate.com wording where it
  exists, atlas seed wording next, then the model's own. A native speaker
  reviews after launch, and an editor's later change in the admin is
  overwritten by a re-run, so do not re-run it once editors own the wording.
- **The `video` tab is omitted** from every file (41 keys). The new player ships
  its own labels (sydevs/WeMeditateWeb#242); English alone holds the tab.
- **Plural keys carry the language's own CLDR forms**: `few`/`many` for
  `ru`/`uk`, `few` for `cs`. `pluralize()` in WeMeditateWeb selects with
  `Intl.PluralRules`, so these are read. Never write a key a locale does not
  have; omit it so the English merge serves English.
- **Publishing does not offer a language.** `wm-web-config.availableLocales`
  does, and refuses a locale whose translations are unpublished, so this run
  comes first and the widening second (`tests/int/wm-web-locales-seed.int.spec.ts`
  asserts that order).
- `tests/unit/wm-web-translations-locales-seed.spec.ts` holds every file to
  English's key set minus `video`, to every placeholder, and to the strict
  length limits.

### `file-transcripts` — the bulk re-request

An audio or video file is transcribed as it is saved since #1016, so this asks
for a transcript of every one that has none: the files uploaded before #1016,
and any since whose run never happened. Each is created the way an upload
creates one, so its run is queued and started on the **target's own server**
with the target's own vendor key — which is why it lives behind the seed route
rather than in `scripts/`.

**Every row it creates is a paid Lemonfox run**, which is why it is in no seed
order and runs only by name. A re-run finds nothing left to do; `--dry-run`
counts and stops:

```bash
pnpm tsx scripts/redeem-signin-link.ts '<sign-in link>' --seed file-transcripts --dry-run
pnpm tsx scripts/redeem-signin-link.ts '<sign-in link>' --seed file-transcripts
```

## Pagination support

Pagination splits a large import across multiple HTTP requests. The CLI
paginates every collection with `requiresPagination: true`.

1. The CLI fetches metadata (GET) to learn batch sizes.
2. It paginates when metadata says `requiresPagination: true`.
3. Collections import in dependency order.
4. Each request is stateless — ID maps rebuild from the database.

**Batch sizes**: 100 without file uploads, 10 with.

Each script's collection metadata lives in `seeds/lib/expectedCounts.ts`. No
surviving script declares a collection there, so nothing paginates today. The
mechanism stays because the request shape above is public — the route's and the
CLI's, not a per-script feature.

The completion event on a paginated request carries a `pagination` block
(`offset`, `limit`, `processedCount`, `hasMore`, `nextOffset`,
`collection`) beside the summary. The CLI reads it to drive the next batch
automatically — printing per-batch progress as it goes.

## Common flags

| Flag            | Description                                      |
| --------------- | ------------------------------------------------ |
| `--dry-run`     | Validate data without writing to the database    |
| `--clear-cache` | Clear downloaded files before import             |
| `--update`      | Update existing records (default: skip existing) |

## Skip mode vs. update mode

By default, a seed script runs in **skip mode**: it skips existing
documents entirely (no updates, no file re-uploads), which cuts DB queries
and speeds up imports of new content. Pass `--update` for **update mode**
(upsert behavior) when content has changed:

| Mode                | Behavior                            | DB queries                           | Use case                                    |
| ------------------- | ----------------------------------- | ------------------------------------ | ------------------------------------------- |
| Skip (default)      | Skip existing docs, only create new | Minimal (bulk preload + creates)     | Adding new content, resuming failed imports |
| Update (`--update`) | Update existing + create new        | Bulk preload + update/create per doc | Content has changed, fixing data issues     |

On startup, each importer preloads the relevant collections into memory
with only the fields needed to validate existence (id + natural key). In
skip mode, a cache hit skips the document entirely. In update mode, it
updates using the cached ID. Either way, a cache miss creates.

## Environment variables

For local development, add to `.env.local` (gitignored):

```bash
# CLI Authentication — only for seeding a REMOTE target; auto-login covers
# localhost, so this can be left blank for local development.
ADMIN_TOKEN=
PAYLOAD_SECRET=your-secret-key
```

For production, hand a sign-in link to the run. The target is the server the
link came from:

```bash
pnpm tsx scripts/redeem-signin-link.ts '<sign-in link>' --seed <script>
```

## Design principles

1. **Idempotent** — natural-key upsert: find existing records and update,
   or create new.
2. **Resilient** — continue on errors, report all issues at the end.
3. **Comprehensive reporting** — a summary with counts, warnings, errors.

## Maintenance: updating seed scripts when fields change

If you add a field to a collection a seed writes, update that script to
populate it. Otherwise seeded documents get that field empty or default.

**Checklist**:

1. Identify which seed script populates the collection.
2. Update the importer to extract/compute the new field from source data.
3. Add the field to the `upsert()` data object.
4. Test with `--dry-run` to validate the mapping.
5. Run a full seed with `--update` to update existing documents.

## Utility architecture

Import scripts share centralized utilities in `seeds/lib/`. For the preload,
upsert, error-handling and pagination patterns, see
[seeds/lib/AGENTS.md](lib/AGENTS.md).

A script's own data file is read with `loadJsonData` (`lib/dataLoader.ts`),
which takes the path from `lib/dataFiles.ts` and the uploaded copy from
`inlineData` — the "Creating a new seed script" checklist below covers it.

⚠ **`seeds/lib` still exports a media and retry surface nothing calls.**
`delays.ts`'s `rateLimitDelay` and `withRetry`, `dataLoader.ts`'s asset fetch
and disk cache, and `FileUtils`' download half were all reached only from the
importers #1169 retired. They are left in place rather than half-dismantled,
because `seeds/lib`'s own fate is settled by the seed CLI's: see §C of #1169.
Do not reach for one as though a run had exercised it.
`shortcut: an unexercised utility surface, to delete with the seed CLI or when
a new importer picks one of them up again.`

## Troubleshooting

**Script won't run** — check env vars (`echo $PAYLOAD_SECRET`) and run
`pnpm generate:types` if types look stale.

**Errors during import** — run with `--dry-run` first to validate data,
use `--clear-cache` to re-download files, and check console output for
details.

## Summary output format

```
============================================================
IMPORT SUMMARY
============================================================

Records Created:
  Lessons:             18
  Media Files:         45

Warnings (2):
  1. Missing image for lesson step-3...

No errors - import completed successfully!
============================================================
```

## Creating a new seed script

1. Create `seeds/<script-name>/import.ts`, extending `BaseImporter`.
2. Add collection metadata to `seeds/lib/expectedCounts.ts`. Each step names
   the `collection` its rows land in, and the seed route counts exactly those —
   a step that lands in no collection of its own names none.
3. Declare the floor. A script that can state none — it targets a global, or
   its floor depends on what the target already holds — declares
   `{ kind: 'not-applicable', reason }` rather than `{}`, so a run that
   verified nothing stops reporting like one that verified and passed. Where an
   invariant over the run's own totals still holds, override `verifyRun()`
   (`seeds/lib/BaseImporter.ts`).
4. Register it in `getImporter()` in
   `src/app/(payload)/api/seed/[script]/route.ts`, and in `VALID_SCRIPTS` and
   `SCRIPT_DESCRIPTIONS` in [run.ts](run.ts).
5. Add it to the "Available scripts" table above.
6. **Does it read a committed data file?** Export its path from
   `seeds/lib/dataFiles.ts` and register it under the script's key in
   `SCRIPT_DATA_FILES`. An unregistered file is never uploaded, so the
   importer falls back to a disk read that the production build trace
   excludes — the script works locally and fails on every deployed target.
   Import the exported constant; never spell the path twice.

```typescript
import path from 'path'
import { BaseImporter, type BaseImportOptions } from '../lib'
import { MY_SCRIPT_DATA_FILE } from '../lib/dataFiles'

export interface MyScriptOptions extends BaseImportOptions {
  // Add any script-specific options here
}

export class MyScriptImporter extends BaseImporter<MyScriptOptions> {
  protected readonly importName = 'My Script'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/my-script')

  protected async setup(): Promise<void> {
    // Preload for skip/update optimization — see lib/AGENTS.md's Preload Pattern
    await this.preloadCollection('target-collection', 'slug')
  }

  protected async import(): Promise<void> {
    const items = await this.loadData()

    for (const item of items) {
      try {
        await this.upsert(
          'target-collection',
          { slug: { equals: item.slug } },
          { title: item.title, slug: item.slug /* ...other fields */ },
          { identifier: item.slug }, // Always pass an explicit identifier
        )
      } catch (error) {
        this.addError(`Item ${item.id}`, error) // Resilient — keep processing
        continue
      }
    }
  }

  private async loadData(): Promise<MyDataType[]> {
    const { loadJsonData } = await import('../lib/dataLoader')
    return loadJsonData<MyDataType[]>({
      localPath: MY_SCRIPT_DATA_FILE,
      inlineContent: this.options.inlineData?.[MY_SCRIPT_DATA_FILE],
    })
  }
}

export default MyScriptImporter
```
