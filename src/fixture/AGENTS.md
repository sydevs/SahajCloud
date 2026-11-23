# The preview fixture

Invented content every non-production server loads into its own database at boot, so a reviewer
opens a change's pages on data (#1168). A Railway preview forks configuration, never volume
data, so without this every preview is empty but for its admin account.

## Where it runs

`onInit` (`src/payload.config.ts`) starts `startFixtureLoad`, unawaited. `fixtureGate`
(`gate.ts`) decides where, and each condition excludes a place it must never run:

- **Never production**, read from Railway's environment name, never `NODE_ENV` — previews run
  `NODE_ENV=production`.
- **Only inside the Next server** (`NEXT_RUNTIME=nodejs`). A script boots Payload too and may hold
  production's `DATABASE_URL` off-Railway, where nothing else tells it from a laptop.
- **Never the build, the test lanes or an E2E run.**

So it loads on every Railway preview and every local `pnpm dev`. `/api/health` reports
`fixture: loading | loaded | failed | off`, and boots Payload itself when nothing has yet, since
Payload otherwise boots on first use. CI's `Wait for the preview's fixture` step polls the Railway
host until `loaded` and fails on anything else, naming which (`scripts/wait-preview-fixture.ts`).
A failed row is logged in full as `[fixture] <collection> <id> failed to load`, a failed global as
`[fixture] <global> failed to load`.

## Adding or changing an entry

One file per collection, `<collection-slug>.ts`, exporting `fixture('<slug>', [...])` from
`types.ts`. `data` is typed against `src/payload-types.ts`, so a schema change the fixture no
longer fits fails `pnpm typecheck`; a required value left out is refused by Payload at load.

**Every entry has an explicit `id` ≥ 1,000,000**, written in the entry, so a link can be built
without opening the preview: `https://pr-<n>.cloud-preview.sydevelopers.com/admin/collections/<slug>/<id>`,
and the same path on `localhost`. Each collection owns a block of a thousand:

| Block       | Collection | Block       | Collection          | Block       | Collection       |
| ----------- | ---------- | ----------- | ------------------- | ----------- | ---------------- |
| `1_001_xxx` | managers   | `1_010_xxx` | user-choices        | `1_019_xxx` | lectures         |
| `1_002_xxx` | regions    | `1_011_xxx` | subtle-system-nodes | `1_020_xxx` | lessons          |
| `1_003_xxx` | users      | `1_012_xxx` | frames              | `1_021_xxx` | app-cards        |
| `1_004_xxx` | images     | `1_013_xxx` | videos              | `1_022_xxx` | clients          |
| `1_005_xxx` | files      | `1_014_xxx` | pages               | `1_023_xxx` | forms            |
| `1_006_xxx` | narrators  | `1_015_xxx` | meditations         | `1_024_xxx` | imports          |
| `1_007_xxx` | authors    | `1_016_xxx` | transcripts         | `1_025_xxx` | events           |
| `1_008_xxx` | audiences  | `1_017_xxx` | albums              | `1_026_xxx` | user-submissions |
| `1_009_xxx` | song-tags  | `1_018_xxx` | songs               | `1_027_xxx` | payload-jobs     |

An id another file points at is named in `ids.ts`. Never reuse an id for a different row: a link
in an old pull request still names it.

**A global's fixture is `<global-slug>.ts`**, exporting `globalFixture('<slug>', {...})`, and
`GLOBAL_FIXTURES` in `index.ts` lists them. A global has no id and no row to prune, so it is
written after every collection — `wm-web-config` and `wm-app-config` name pages, and a page the
configuration names must exist first. Both are seeded because **a configuration is the one thing
that places a page in a service**: with neither filled, every preview shows the Pages sidebar
notice refusing every page, and `webUrl` and `appUrl` null for all of them.

- Every email ends in `.invalid`, every name is invented, and a unique value carries `fixture-`.
- A date that means something relative to now is `at({ days, hour })` (`at.ts`), resolved at boot
  to the minute.
- An upload names a file under `files/` (a few KB). `next.config.ts` traces that folder into the
  standalone build.
- Rich text is `plainTextToLexical`, or a hand-built Lexical value where blocks are the point.
- **`payload-jobs` rows are terminal only.** A queued one would run, and a `processing` one is
  recovered by the hourly sweep.

## How a load reconciles

Each entry's hash — its content, its file's bytes, and for an upload the ISO week — is kept in
`payload.kv` as `fixture:<slug>:<id>`. A load creates a missing row at its id, updates a row whose
hash moved, leaves the rest, and deletes a row at or above the floor that no entry names. **A row
below 1,000,000 is never read or written**, and a reviewer's edit to a fixture row survives until
that entry changes. A Postgres advisory lock serialises loads.

- **The week is in an upload's hash** because `cleanup-preview-assets` reaps a preview's upload
  after seven days whatever row points at it, so an upload is re-sent once a week.
- **A relative date moves its row's hash** on the first boot of a new day, and on no other.
- ⚠ **`allowIDOnCreate` is adapter-wide**, so it is on everywhere but production
  (`src/payload.config.ts`, pinned by `tests/unit/fixture-ids-production.spec.ts`). On production
  a REST create naming an `id` would plant a row ahead of the serial.
- ⚠ **The nightly `ExpireEvents` run moves fixture events** along the reminder ladder on a
  preview, as it would any event; the next change to that entry, or the next day for a dated one,
  writes it back.

## What a load must never do

Every write carries `FIXTURE_CONTEXT`: `context.fixture` plus the `import` actor for both state
machines, so a row may stand at any lifecycle state. **A hook with an outside effect returns early
on `req.context.fixture`** — mail, a queued job, a vendor call:

| Hook                                                                     | Would otherwise                         |
| ------------------------------------------------------------------------ | --------------------------------------- |
| `UserSubmissions/hooks/queueScreening.ts`                                | screen a pending row, then deliver it   |
| `UserSubmissions/hooks/spawnSubscribeFromRegistration.ts`                | spawn a subscription and screen it      |
| `src/lib/transcripts/sync.ts`, `Transcripts/hooks/queueTranscription.ts` | pay for a transcription run             |
| `src/plugins/eventImport/importCollection.ts`                            | run the import job: geocode and mail    |
| `src/plugins/login/invitations.ts`                                       | queue a manager's invitation mail       |
| `src/plugins/cache/index.ts`                                             | purge production's CDN cache            |
| `Clients/hooks/validateMailingList.ts`                                   | ask a mailing-list provider about a key |
| `Lectures/hooks/populateFromNirmalaVidya.ts`                             | fetch the lecture from Nirmala Vidya    |

**A new hook with an outside effect owes the same early return.** An image still uploads through
the app, with the `preview-` prefix, so the nightly sweep can reap it.

**`direct`** writes a row beneath every hook with `payload.db`, for a state only a paid or external
path reaches — a Cloudflare Stream clip (`stream.ts`), a vendor's verdict. Say which in its
`direct` string. Everything else goes through the ordinary create, so hooks and validation run.

## The guard

`tests/unit/fixture-coverage.spec.ts` fails, naming each gap, when:

1. a collection has fewer than 3 entries;
2. a state of the event verification or submission machine has no entry;
3. a `select` or `radio` option of any field has no entry using it — except an open vocabulary
   (timezones, locales, languages, countries, job task slugs; `coverage.ts` says which);
4. a custom component in `src/app/(payload)/admin/importMap.js` is missing from `views.ts`, which
   maps it to the fixture pages that render it, or says why it has none;
5. a fixture email does not end in `.invalid`, or an `ids.ts` anchor has no row.

So a change that adds a collection, a state, an option or an admin view adds the entries that show
it in the same pull request. `tests/int/fixture-load.int.spec.ts` loads the committed fixture into
a fresh database and fails on any row Payload refuses.
