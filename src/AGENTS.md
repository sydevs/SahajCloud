# Project Structure

How `src/` is organized, and where new code belongs. Established by #442 /
PR #443 (per-collection colocation) and #444 / this rule (the `src/lib/`
split into `plugins/`, `jobs/`, and shared utilities).

## `src/` layout

| Directory          | Holds                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| `src/plugins/`     | Modules registered in `payload.config.ts` (`plugins`, `email`, `db`)         |
| `src/collections/` | One folder per collection — schema + colocated hooks, endpoints, helpers    |
| `src/endpoints/`   | Root-level endpoints only — resources no collection owns (see below)        |
| `src/globals/`     | One folder per global — same colocation shape as collections                |
| `src/jobs/`        | One folder per scheduled job. `index.ts` exports only the task definitions  |
| `src/lib/`         | Cross-cutting shared code (not a plugin, not owned by one collection/job)   |
| `src/fields/`      | Reusable field factories (`camelCase`)                                      |
| `src/components/`  | Admin-panel React components (`PascalCase`)                                 |
| `src/app/`         | Next.js routes (admin, REST API, frontend, webhooks)                        |
| `src/migrations/`  | Payload schema migrations (see `src/migrations/AGENTS.md`)                  |

### `src/plugins/`

One self-contained folder per plugin/adapter, with a public API via an
`index.ts` barrel: `access/`, `storage/`, `usage/`, `openapi/`, `email/`,
`sentry/`. Consumers (including `payload.config.ts`) import from
`@/plugins/<name>`.

### `src/jobs/<JobName>/`

One folder per scheduled job (`CleanupOrphanedMedia/`,
`SyncLectureMetadata/`). Job-specific supporting code lives inside the job
folder (e.g. `CleanupOrphanedMedia/schemaUtils.ts`) and nothing outside it
imports that code (tests may reach a folder's internals). `src/jobs/index.ts`
re-exports **only** the task definitions for `payload.config.ts`'s
`jobs.tasks`.

### `src/endpoints/`

Custom endpoints registered on the **config root** (`config.endpoints`)
rather than on a collection, for a resource no collection owns. One handler
per file, plus a self-contained `responseTypes.ts` that client repos sync by
raw GitHub URL (same shape as `Events/endpoints/responseTypes.ts`).

**The layout mirrors the URL**: a single-file endpoint is
`src/endpoints/<name>.ts`. One with supporting modules is a folder whose
path *is* the URL path, handler in `index.ts` (`src/endpoints/atlas/seo/` →
`GET /api/atlas/seo`, #645. `src/endpoints/atlas/sitemap/` → `GET
/api/atlas/sitemap`, #650). #632 turned another into the `user-messages`
collection once its resource needed storing. Those supporting modules are
single-owner code and stay in the folder — putting them in `src/lib/` fails
the one-consumer check below.

This folder is the **exception, not a second home for endpoints** — anything
a collection plausibly owns stays colocated under
`src/collections/<Name>/endpoints/`. Leaving the collection seam costs you
the usage plugin's beforeOperation hooks (origin enforcement, usage
tracking), which a root handler must then compensate for by hand — see
`docs/rules/endpoints.md`.

### `src/lib/`

No loose files at the root — every file lives in a named folder:

- `env/` — environment-variable validation (broadly imported config), plus
  `deploymentEnvironment.ts`, which names the deployment (Railway environment
  name, falling back to `NODE_ENV`. Its `clientDeploymentEnvironment()` twin
  reads the name `next.config.mjs` inlines for the browser, which reads no
  environment at runtime). That one is deliberately **outside** the
  `@/lib/env` barrel and imported by its deep path: the barrel pulls in the
  validated `serverEnv` parse, and Sentry reads it during
  `instrumentation.register()`, before that parse is safe to depend on.
  `logLevels.ts` sits outside the barrel for that reason and one more: it is
  zod-free, so `clientLogger` takes the `NEXT_PUBLIC_LOG_LEVEL` vocabulary
  without pulling the schema module into every browser chunk that carries it
- `logger/` — `clientLogger`, `workerSafeLogger`
- `utilities/` — purposeful cross-boundary helpers (`serverUrl`,
  `previewSecret`, `gender`, `subtitles`, `weightedSample`, `isRecord`,
  `requestMemo` — collapses a per-request load to one in-flight promise,
  `localeIsolatedReq` — gives a nested cross-locale read a copy so it can't
  repoint the caller's request, `versionsRead` — tells a `beforeOperation`
  hook whether its `read` is a versions read, which cannot carry a document
  `where`)
- `locales/` — locale config (`@/lib/locales` resolves to `locales/index.ts`)
- `richEditor/` — Lexical editor presets + `blocks/` (the editor's block
  set) + `lexicalHooks`
- `endpoints/` — shared client-endpoint helpers (`requireActiveClient`,
  `parseQuery`, `emptyPaginatedResponse`). `antiSpamGuard` lived here for
  the `contactAdmin` endpoint. Once that became a collection (#632), its
  consumers were the write-guard plugin and two jobs — no endpoint at all —
  so it moved to `antiSpam/`
- `antiSpam/` — the transport-agnostic public-write checks (`checkNoUrls`,
  `checkEmailAllowed`, `verifyTurnstileOrFail`), shared by the write-guard
  plugin and both screening jobs
- external-service clients, alongside `mapbox/`: `turnstile/` (Cloudflare
  captcha siteverify) — single-consumer today, but an integration seam
  rather than one endpoint's private helper, and unit-testable without
  booting it
- domain folders shared across 2+ owners (**2+ is enforced** — see "One
  consumer ⇒ it isn't shared" below): `audiences/`, `meditations/`,
  `branding/`, `status/`, `lectures/`, `schedule/`, `subtleSystem/`,
  `pageTags/`, `cascadeDeletion/`, `eventTitle/` (the auto-title
  composition, split by purity: `compose.ts` is pure. `autoTitle.ts`
  resolves a title against the database and is shared by the Events title
  hook and EventSubmissions), `eventQuality/` (the listing-quality check
  registry + report builder, consumed by Events, the admin panel, and the
  ExpireEvents reminder emails — barrelled, with all user-facing wording in
  its `copy.ts`), `registrations/` (the `EVENT_REGISTRATION_QUESTIONS`
  contract + `questions` validation, shared by Events, Registrations, and
  the notification email, plus the `unsubscribeToken`/`unsubscribeUrl`
  helpers)

**Barrels.** A folder gets an `index.ts` barrel only when it presents one
cohesive public surface imported as a unit (`@/lib/locales`,
`@/lib/status`, `@/lib/endpoints`, `@/lib/subtleSystem`,
`@/lib/pageTags`, `@/lib/cascadeDeletion`). Grab-bag and per-owner helper
folders whose modules are cherry-picked individually use deep imports and
have **no** barrel: `utilities/`, `logger/`, `lectures/`, `meditations/`,
`audiences/`, `mapbox/`, `turnstile/`, `schedule/`
(`@/lib/schedule/scheduleHooks`). Don't add a barrel that re-exports
unrelated modules just for symmetry — it can pull server-only code into
client bundles, hurts tree-shaking, and invites import cycles.

**That barrel hazard is not hypothetical, and CI cannot see it.** GitHub
Actions does not build this app — Railway does — so a client component that
reaches server-only code type-checks, passes every test, then fails the
*deploy* with `Module not found: Can't resolve 'dns'`. It happened in #633:
the canonical picker imported `@/lib/clients/canonical`, which imported the
`@/plugins/usage` barrel, which re-exports the pg-pool seam, which pulls
`pg` into the browser bundle. The fix was a deep import
(`@/plugins/usage/originEnforcement`). The guard is
`tests/unit/client-bundle-safety.spec.ts`, which walks the real import
graph from every browser entry. Nothing to add when you write a client
component — it is covered on the first run.

⚠ **From client code, import `@/plugins/access/config`, `/adminOnly` or
`/types` — never the `@/plugins/access` barrel.** The barrel re-exports those
pure leaves, but it also pulls `accessPlugin`, `fieldAccess`, `accessConfigs`
and `permissions`, and through them `@/lib/env/server`. Server code keeps
using the barrel.

**That rule is enforced, and was not for four months.** The guard's entries
were a hand-written list of four, and it matched the import **specifier** a
caller wrote — but the edge into `@/lib/env/server` is `@/lib/env`'s own
`./server`, which no caller ever writes. So it was green from #633 to #770
with 14 browser entries reaching it, 12 through that barrel. #770 fixed both
halves, and both matter: derived entries alone still miss the edge, and file
matching alone still misses the entry. The barrel is also a `SERVER_ONLY` row
in its own right, so the rule above holds even if the barrel stops reaching
`@/lib/env/server` — the weight is the cost, not just the Node dependency. The
walk also stops at a `'use server'` module, because Next compiles one to a
client reference and never bundles its body. `@/lib/status` is the same barrel
shape, not yet cut — `ReadinessGroup` pulls nine modules through it for one
function.

**A second guard walks the same graph for a different rule.**
`tests/unit/public-env-substitution.spec.ts` checks that browser code reads
`process.env` only as a literal `process.env.<KEY>` member expression — the
one form Next substitutes. `clientEnv` did not, so every `NEXT_PUBLIC_*`
value was `undefined` in the browser and client Sentry never initialized
(#760). It derives its entries the same way, from `clientEntries()` in
`tests/utils/importGraph.ts`, which both specs share.

**This is the one home for that story.** The code sites carry a one-line
pointer here, so there is nothing to update in six places when it changes.
And do not restore a `clientEnv`-shaped accessor in another form: the
enumerated `runtimeEnv` object t3-env uses would work, but its enumeration
can drift from `ClientEnvSchema` silently, and that drift looks exactly like
working config — the same failure, re-armed. `ServerEnvSchema` extends the
client schema, so the server still validates all four variables and reads
them as `serverEnv.NEXT_PUBLIC_*`.

⚠ **Import Sentry from `@sentry/nextjs`, never `@sentry/react`.** Sentry
keys its global client by SDK version (`__SENTRY__[SDK_VERSION]`), and
`@sentry/nextjs` carries its own pinned `@sentry/react`. A second top-level
copy resolves to a different version, so a capture through it reads an empty
carrier and is dropped without error. That is why `@sentry/react` is not a
direct dependency.

## Organization rules

1. **`src/plugins/`** holds every module registered in `payload.config.ts`.
   One self-contained folder per plugin, public API via `index.ts`.
2. **`src/jobs/<JobName>/`** holds one folder per scheduled job. The
   `src/jobs/index.ts` barrel exports **only** task definitions.
   Job-specific supporting code lives inside the job folder, and nothing
   outside it imports that code (tests excepted).
3. **`src/lib/`** holds only code shared across 2+ consumers, that is
   neither a registered plugin nor owned by one collection/global/job.
   Group it into named folders — no loose files at the `src/lib/` root.
4. **Single-owner code goes in its owner's folder** (collection/global/job).
   **Cross-boundary code goes in `src/lib/`.** Never colocate shared code
   in one owner's folder — that forces a cross-owner internal import
   (the violation #442 criterion 8 prohibits).
5. **Exception path** (inherited from #442): raise it before merging if you
   believe a function must be exported from an owner folder or a plugin's
   internals — the likely resolution is generalizing it into `src/lib/`.

### One consumer ⇒ it isn't shared — enforced by a test

Rule 4 is checked by `tests/unit/lib-boundary.spec.ts`: a module under
`src/lib/` whose only consumer lives outside `src/lib` **fails the unit
lane**. Such a module is not shared code — it is one owner's private helper
sitting in the commons, importable by anything and read by the next person
as though it were general-purpose.

This is why a job's supporting code lives in the job folder.
`SendSessionReminders` owns `sendSessionReminder.ts` and
`unsubscribeUrl.ts`. `ScreenEventSubmissions` owns `findOrCreateCity.ts`.
`recipients` stays in `src/lib/notifications` because both `ExpireEvents`
and `registrationRecipient` also use it. The **view layer is untouched** —
email templates stay in `src/emails/`, and a job's sender imports its
template from there.

**Counting consumers has three traps**, each of which gave a wrong answer
while this was written, so let the test do it rather than grepping:

| Trap | Example |
| --- | --- |
| Barrel re-exports | `recipients.ts` looked single-consumer by direct import. It has three, two via `lib/notifications/index.ts` |
| Sibling relative imports | `browserRendering.ts` is imported as `./browserRendering` by `verifyEmbed.ts` next door — invisible to a `@/lib/…` search |
| `scripts/` | The email preview scripts import senders directly |

Two exemptions are built in:

- **Consumed only from inside `src/lib`** — a shared module decomposed into
  parts (a barrel and its members. An integration seam like `turnstile/`
  kept separate so it unit-tests without booting its caller). The folder is
  the unit. Whether it's shared is answered by its entry point.
- **Consumed only by `scripts/`** — operator scripts are thin CLI wrappers
  whose routine lives in lib precisely so it can be unit-tested without
  running the script (see `scripts/AGENTS.md`).

`KNOWN_SINGLE_CONSUMER` in that spec records what already had one consumer
when the check landed. It's a backlog, not an approval, and should only
shrink — a new entry needs a reason that outlives the next reader.
