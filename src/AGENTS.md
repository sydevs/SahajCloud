# Project Structure

How `src/` is organized and where new code belongs. Established by #442 / PR
#443 (per-collection colocation) and #444 / this rule (the `src/lib/` split
into `plugins/`, `jobs/`, and shared utilities).

## `src/` layout

| Directory          | Holds                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| `src/plugins/`     | Modules registered in `payload.config.ts` (`plugins`, `email`, `db`)       |
| `src/collections/` | One folder per collection — schema + colocated hooks, endpoints, helpers   |
| `src/endpoints/`   | Root-level endpoints only — resources no collection owns (see below)      |
| `src/globals/`     | One folder per global — same colocation shape as collections               |
| `src/jobs/`        | One folder per scheduled job; `index.ts` exports only the task definitions |
| `src/lib/`         | Cross-cutting shared code (not a plugin, not owned by one collection/job)  |
| `src/fields/`      | Reusable field factories (`camelCase`)                                     |
| `src/components/`  | Admin-panel React components (`PascalCase`)                                |
| `src/app/`         | Next.js routes (admin, REST API, frontend, webhooks)                       |
| `src/migrations/`  | Payload schema migrations (see `src/migrations/AGENTS.md`)              |

### `src/plugins/`

One self-contained folder per plugin/adapter, public API via an `index.ts`
barrel: `access/`, `storage/`, `usage/`, `openapi/`, `email/`, `sentry/`.
Consumers (including `payload.config.ts`) import from `@/plugins/<name>`.

### `src/jobs/<JobName>/`

One folder per scheduled job (`CleanupOrphanedMedia/`, `SyncLectureMetadata/`).
Job-specific supporting code lives inside the job folder (e.g.
`CleanupOrphanedMedia/schemaUtils.ts`) and is imported by nothing outside it
(tests may reach a folder's internals). `src/jobs/index.ts` re-exports **only**
the task definitions for `payload.config.ts`'s `jobs.tasks`.

### `src/endpoints/`

Custom endpoints registered on the **config root** (`config.endpoints`) rather
than on a collection — for a resource no collection owns. One handler per file,
plus a self-contained `responseTypes.ts` that client repos sync by raw GitHub URL
(same shape as `Events/endpoints/responseTypes.ts`).

**The layout mirrors the URL**: a single-file endpoint is
`src/endpoints/<name>.ts`; one with supporting modules is a folder whose path
*is* the URL path, handler in `index.ts` (`src/endpoints/atlas/seo/` →
`GET /api/atlas/seo`, #645; `src/endpoints/atlas/sitemap/` →
`GET /api/atlas/sitemap`, #650). #632 turned another into the `user-messages`
collection once its resource needed storing. Those supporting modules are
single-owner code and stay in the folder — putting them in `src/lib/` fails the
one-consumer check below.

This folder is the **exception, not a second home for endpoints** — anything a
collection plausibly owns stays colocated under `src/collections/<Name>/endpoints/`.
Leaving the collection seam costs you the usage plugin's beforeOperation hooks
(origin enforcement, usage tracking), which a root handler has to compensate for
by hand; see `src/endpoints/AGENTS.md`.

### `src/lib/`

No loose files at the root — every file lives in a named folder:

- `env/` — environment-variable validation (broadly imported config)
- `logger/` — `clientLogger`, `workerSafeLogger`
- `utilities/` — purposeful cross-boundary helpers (`serverUrl`, `previewSecret`,
  `gender`, `subtitles`, `weightedSample`, `isRecord`, `requestMemo` — collapse a
  per-request load to one in-flight promise, `localeIsolatedReq` — hand a nested
  cross-locale read a copy so it can't repoint the caller's request)
- `locales/` — locale config (`@/lib/locales` resolves to `locales/index.ts`)
- `richEditor/` — Lexical editor presets + `blocks/` (the editor's block set) +
  `lexicalHooks`
- `endpoints/` — shared client-endpoint helpers (`requireActiveClient`,
  `parseQuery`, `emptyPaginatedResponse`). `antiSpamGuard` used to live here for
  the `contactAdmin` endpoint; once that became a collection (#632) its consumers
  were the write-guard plugin and two jobs — no endpoint at all — so it moved to
  `antiSpam/` rather than leaving the folder name lying
- `antiSpam/` — the transport-agnostic public-write checks (`checkNoUrls`,
  `checkEmailAllowed`, `verifyTurnstileOrFail`), shared by the write-guard plugin
  and both screening jobs
- external-service clients, alongside `mapbox/`: `turnstile/` (Cloudflare
  captcha siteverify). Single-consumer today, but an integration seam rather
  than one endpoint's private helper — and unit-testable without booting it.
- domain folders shared across 2+ owners (**2+ is enforced** — see "One consumer
  ⇒ it isn't shared" below): `audiences/`, `meditations/`,
  `branding/`, `status/`, `lectures/`, `schedule/`, `subtleSystem/`,
  `pageTags/`, `cascadeDeletion/`, `eventTitle/` (the auto-title composition,
  split by purity: `compose.ts` is pure and re-composed by the quality checks;
  `autoTitle.ts` resolves a title against the database — the templates global
  and the region name — and is shared by the Events title hook and
  EventSubmissions, which names a submission with the title its event would be
  created with),
  `eventQuality/` (the listing-quality check registry + report builder, consumed
  by the Events collection, the admin panel and the ExpireEvents reminder emails.
  A check's `dependsOn` is read in **both** directions — the dependent is skipped
  while its prerequisite fails, and supersedes the prerequisite once it passes,
  so no consumer renders "Has a description" beside "Has a good quality
  description". Only ever drops checks that *passed*, so `qualityOpenCount` and
  `QUALITY_CHECK_VERSION` are untouched;
  barrelled — all user-facing wording lives in its `copy.ts`, which is the only
  file to edit to change what a manager reads. `titleTemplates.ts` is the one
  impure member: it reads the auto-title templates off the translations global,
  memoized per request, so the report can tell an auto-filled title from a
  hand-written one. Each **consumer** owns its own projection of a report —
  `EventQualityPanel/model.ts` for the panel, `notifications/listingProgress.ts`
  for the email — because those resolve display wording and would otherwise make
  this folder import a React template's types),
  `registrations/` (the
  `EVENT_REGISTRATION_QUESTIONS` contract + `questions` validation/shaping,
  shared by Events, Registrations, and the notification email; plus the
  `unsubscribeToken` / `unsubscribeUrl` helpers for the reminder unsubscribe link)

**Barrels.** A folder gets an `index.ts` barrel when it presents one cohesive
public surface imported as a unit (`@/lib/locales`, `@/lib/status`,
`@/lib/endpoints`, `@/lib/subtleSystem`, `@/lib/pageTags`,
`@/lib/cascadeDeletion`). Grab-bag and per-owner helper folders whose modules are
cherry-picked individually use deep imports and have **no** barrel: `utilities/`
(unrelated single-purpose helpers), `logger/`, `lectures/`, `meditations/`,
`audiences/`, `mapbox/`, `turnstile/`, and `schedule/`
(`@/lib/schedule/scheduleHooks`). Don't
add a barrel that re-exports unrelated modules just for symmetry — it can pull
server-only code into client bundles, hurts tree-shaking, and invites import
cycles.

**That barrel hazard is not hypothetical, and CI cannot see it.** GitHub Actions
does not build this app — Railway does — so a client component that reaches
server-only code type-checks, passes every test, and then fails the *deploy* with
`Module not found: Can't resolve 'dns'`. It happened in #633: the canonical
picker imported `@/lib/clients/canonical`, which imported the `@/plugins/usage`
barrel, which re-exports the pg-pool seam, which pulls `pg` into the browser
bundle. The fix is a deep import (`@/plugins/usage/originEnforcement`); the guard
is `tests/unit/client-bundle-safety.spec.ts`, which walks the real import graph
from each admin client component. Add new client entry points to its list.

## Organization rules

1. **`src/plugins/`** holds every module registered in `payload.config.ts`.
   One self-contained folder per plugin, public API via `index.ts`.
2. **`src/jobs/<JobName>/`** holds one folder per scheduled job; the
   `src/jobs/index.ts` barrel exports **only** task definitions. Job-specific
   supporting code lives inside the job folder and is imported by nothing
   outside it (tests excepted).
3. **`src/lib/`** holds only code shared across 2+ consumers that is neither a
   registered plugin nor owned by a single collection/global/job. Grouped into
   named folders — no loose files at the `src/lib/` root.
4. **Single-owner code → its owner's folder** (collection/global/job).
   **Cross-boundary code → `src/lib/`.** Never colocate shared code in one
   owner's folder — that forces a cross-owner internal import (the violation
   #442 criterion 8 prohibits).
5. **Exception path** (inherited from #442): if you believe a function must be
   exported from an owner folder or a plugin's internals, raise it before
   merging; the likely resolution is generalizing it into `src/lib/`.

### One consumer ⇒ it isn't shared — enforced by a test

Rule 4 is checked by `tests/unit/lib-boundary.spec.ts`: a module under
`src/lib/` whose only consumer lives outside `src/lib` **fails the unit lane**.
Such a module isn't shared code — it's one owner's private helper sitting in the
commons, importable by anything and read by the next person as though it were
general-purpose.

This is why a job's supporting code lives in the job folder. `SendSessionReminders`
owns `sendSessionReminder.ts` and `unsubscribeUrl.ts`; `ScreenEventSubmissions`
owns `findOrCreateCity.ts`, `recipients` stays in `src/lib/notifications` because
`ExpireEvents` and `registrationRecipient` also use it. The **view layer is
untouched** — email templates stay in `src/emails/`, and a job's sender imports
its template from there.

**Counting consumers has three traps**, each of which gave a wrong answer while
this was written, so let the test do it rather than grepping:

| Trap | Example |
| --- | --- |
| Barrel re-exports | `recipients.ts` looked single-consumer by direct import; it has three, two via `lib/notifications/index.ts` |
| Sibling relative imports | `browserRendering.ts` is imported as `./browserRendering` by `verifyEmbed.ts` next door — invisible to a `@/lib/…` search |
| `scripts/` | The email preview scripts import senders directly |

Two exemptions are built in:

- **Consumed only from inside `src/lib`** — a shared module decomposed into
  parts (a barrel and its members; an integration seam like `turnstile/` kept
  separate so it unit-tests without booting its caller). The folder is the unit;
  whether it's shared is answered by its entry point.
- **Consumed only by `scripts/`** — operator scripts are thin CLI wrappers whose
  routine lives in lib precisely so it can be unit-tested without running the
  script (see `scripts/AGENTS.md`).

`KNOWN_SINGLE_CONSUMER` in that spec records what already had one consumer when
the check landed. It's a backlog, not an approval, and should only shrink — a
new entry needs a reason that outlives the next reader.
