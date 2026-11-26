# Project Structure

How `src/` is organized, and where new code belongs. The rules come from #442 / PR #443
(per-collection colocation) and #444 (the `src/lib/` split into `plugins/`, `jobs/`, and shared
utilities).

## `src/` layout

| Directory          | Holds                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/plugins/`     | Modules registered in `payload.config.ts` (`plugins`, `email`, `db`)                                                                                                |
| `src/collections/` | One folder per collection — schema + colocated hooks, endpoints, helpers                                                                                            |
| `src/endpoints/`   | Root-level endpoints only — resources no collection owns (see below)                                                                                                |
| `src/globals/`     | One folder per global — same colocation shape as collections                                                                                                        |
| `src/jobs/`        | One folder per scheduled job. `index.ts` exports only the task definitions                                                                                          |
| `src/lib/`         | Cross-cutting shared code (not a plugin, not owned by one collection/job)                                                                                           |
| `src/fields/`      | Reusable field factories (`camelCase`)                                                                                                                              |
| `src/components/`  | Admin-panel React components (`PascalCase`)                                                                                                                         |
| `src/app/`         | Next.js routes (admin, REST API, frontend, webhooks). Shared UI for one route group goes in a `_components/` folder there — `_`-prefixed, so Next does not route it |
| `src/migrations/`  | Payload schema migrations (see `src/migrations/AGENTS.md`)                                                                                                          |
| `src/fixture/`     | The preview fixture: invented rows every non-production server loads at boot (see `src/fixture/AGENTS.md`)                                                          |

### `src/plugins/`

One self-contained folder per plugin or adapter, with its public API in an `index.ts` barrel.
Consumers (including `payload.config.ts`) import from `@/plugins/<name>`. Work with two callers
inside a plugin gets its own module beside them, not a home in one caller's wiring file (#1113).

⚠ **`login/` owns its endpoints** (`src/plugins/login/endpoints/`), unlike every other plugin
here, which wires definitions kept beside their collection. They are factories, built once per
collection the plugin's `collections` option names, so no single collection can hold them. What
stays with a collection is its `LoginCollectionConfig` (`src/collections/Managers/login.ts`). The
barrel deliberately stops short of the factories: `loginPlugin` is their only caller.

⚠ **`login/impersonation/` is a feature inside that plugin, not a plugin of its own.** Support
acting as a manager is a second way into the admin panel, over the one collection `login`
already wires, so `loginPlugin` wires both rather than a second per-collection plugin folding
over the same collection. See its `AGENTS.md`.

### `src/jobs/<JobName>/`

One folder per scheduled job. Job-specific supporting code lives inside the job folder, and
nothing outside it imports that code (tests may reach a folder's internals). `src/jobs/index.ts`
re-exports **only** the task definitions. The traps in a job's schedule and queue are in
`src/jobs/AGENTS.md`.

**A task's failure reaches Sentry once, on its final attempt**, at `error`. When the task cannot
do its work for a reason that is an answer rather than an incident — already shown to whoever
needs it, or needing no one — throw `ExpectedJobFailure` (`@/lib/jobs/expectedFailure`) with the
message the job row should carry. It is still reported, at `warning`. Leave an outage, such as a
vendor down or a query failing, a plain `Error` — and a missing key or bucket URL too, in
production, where it must alert.

`CleanupCollections/` holds no collection list at all: a collection joins retention by declaring
windows on its own config's `custom.retention`, beside the fields they age, and the job reads the
built config at run time (#987). A collection that declares none is not swept. Only the vocabulary
every declaring config needs is shared — `@/types/retention`. `payload-jobs` is Payload's own
collection and reaches `custom` through `jobs.jobsCollectionOverrides`, which is the whole of
`src/collections/PayloadJobs/`.

### `src/endpoints/`

Custom endpoints registered on the **config root** (`config.endpoints`), for a resource no
collection owns. One handler per file, plus a self-contained `responseTypes.ts` that client repos
sync by raw GitHub URL.

**The layout mirrors the URL**: a single-file endpoint is `src/endpoints/<name>.ts`. One with
supporting modules is a folder whose path _is_ the URL path, handler in `index.ts`
(`src/endpoints/atlas/seo/` → `GET /api/atlas/seo`, #645). Those supporting modules are
single-owner code and stay in the folder. A root endpoint whose resource comes to need storing
becomes a collection (#632).

This folder is the **exception, not a second home for endpoints** — anything a collection
plausibly owns stays under `src/collections/<Name>/endpoints/`. Leaving the collection seam costs
the usage plugin's `beforeOperation` hooks (origin enforcement, usage tracking), which a root
handler must then compensate for — see `docs/rules/endpoints.md`.

### `src/lib/`

No loose files at the root — every file lives in a named folder, and each folder holds code with
two or more owners (enforced — see "One consumer ⇒ it isn't shared" below). What a module is for
is in its own header comment; what follows is only what no single file can say.

- **`richEditor/`** — never re-export `plainTextToLexical` or `lexicalToPlainText` from the
  barrel: the barrel is the editor presets, so a caller reaching a conversion through it pulls the
  whole Lexical config. Nothing else may flatten Lexical (#961).
- **`antiSpam/`** — two owners by construction: the write guard refuses a link at create, and the
  screening job bins one it finds later. Both must read one derivation of which fields to check
  (#948).
- **`atomicWrites/`** — the writes a background worker owes a row it read before doing slow work
  (#1116). They know no stage, status or verdict. No barrel.
- **`stateMachine/`** — the machinery is here and each machine's table is with its owner. ⚠ **A
  table, its conditions, its openings, a lookup and a claim — nothing else.** No actions, no
  side-effect registry, no nested states, no timers: what a move _does_ stays in the owner's own
  hook, keyed on the move's name. A machine that needs more wants XState. No barrel.
- **`submissions/`** — `CLIENT_CONTEXT_KEYS` lives here because two collections read it
  (`user-submissions`' URL-scan exemption, `Forms`' field-name refusal), so it belongs to neither.
- **`migrations/`** — ⚠ **the one folder a file in `src/migrations/` may import from.** A
  migration is frozen the moment it merges, so a helper beside one is unreachable by the next,
  and `src/migrations/*.ts` is do-not-augment generated output besides
  (`.claude/workflow.json`). Keeping the shared SQL here, and nowhere else, means the import line
  of a hand-written data migration says whether it reaches code it may reach. Nothing outside
  `src/migrations/` imports from here — a runtime reader of the same data wants its owner's
  folder. Exempt from the one-consumer rule below, for the same reason the folder exists. No
  barrel.

**Barrels.** A folder gets an `index.ts` barrel only when it presents one cohesive public surface
imported as a unit. A grab-bag or per-owner helper folder whose modules are cherry-picked uses
deep imports and has **no** barrel. Don't add a barrel that re-exports unrelated modules for
symmetry — it can pull server-only code into client bundles, hurts tree-shaking, and invites
import cycles.

**That barrel hazard is not hypothetical, and CI cannot see it.** GitHub Actions does not build
this app — Railway does — so a client component that reaches server-only code type-checks, passes
every test, then fails the _deploy_ with `Module not found: Can't resolve 'dns'`. It happened in
#633: a client picker reached the `pg` pool through the `@/plugins/usage` barrel, and the fix was
a deep import. The guard is `tests/unit/client-bundle-safety.spec.ts`, which walks the real import
graph from every browser entry. Nothing to add when you write a client component — it is covered
on the first run.

⚠ **From client code, import `@/plugins/access/config`, `/adminOnly` or `/types` — never the
`@/plugins/access` barrel.** The barrel also pulls the plugin itself and, through it,
`@/lib/env/server`. Server code keeps using the barrel.

**That rule is enforced, and was not for four months.** The guard once read a hand-written list of
entries and matched the import **specifier** a caller wrote, but the edge into `@/lib/env/server`
is `@/lib/env`'s own `./server`, which no caller writes. It was green from #633 to #770 with 14
browser entries reaching it. #770 fixed both halves, and both matter: derived entries alone still
miss the edge, and file matching alone still misses the entry.

**A second guard walks the same graph for a different rule.**
`tests/unit/public-env-substitution.spec.ts` checks that browser code reads `process.env` only as
a literal `process.env.<KEY>` member expression — the one form Next substitutes. `clientEnv` did
not, so every `NEXT_PUBLIC_*` value was `undefined` in the browser and client Sentry never
initialized (#760). Both specs share their entry derivation (`tests/utils/importGraph.ts`).

**This is the one home for that story.** The code sites carry a one-line pointer here. Do not
restore a `clientEnv`-shaped accessor in another form: the enumerated `runtimeEnv` object t3-env
uses would work, but its enumeration can drift from `ClientEnvSchema` silently, and that drift
looks exactly like working config — the same failure, re-armed.

⚠ **Import Sentry from `@sentry/nextjs`, never `@sentry/react`.** Sentry keys its global client by
SDK version, and `@sentry/nextjs` carries its own pinned `@sentry/react`. A second top-level copy
resolves to a different version, so a capture through it is dropped without error. That is why
`@sentry/react` is not a direct dependency.

**Every server report goes through one body**, `capture` (`src/plugins/sentry/capture.ts`),
reached through its two seams (#1182). `src/plugins/sentry/AGENTS.md` has the seams.

⚠ **No server site reaches the SDK itself** — `tests/unit/sentry-capture.spec.ts` fails a second
spelling of either entry point, and lists the browser reporters that are its only exceptions.

## Organization rules

1. **`src/plugins/`** holds every module registered in `payload.config.ts`. One self-contained
   folder per plugin, public API via `index.ts`.
2. **`src/jobs/<JobName>/`** holds one folder per scheduled job. The `src/jobs/index.ts` barrel
   exports **only** task definitions. Job-specific supporting code lives inside the job folder,
   and nothing outside it imports that code (tests excepted).
3. **`src/lib/`** holds only code shared across 2+ consumers, that is neither a registered plugin
   nor owned by one collection/global/job. Group it into named folders — no loose files at the
   `src/lib/` root.
4. **Single-owner code goes in its owner's folder** (collection/global/job). **Cross-boundary code
   goes in `src/lib/`.** Never colocate shared code in one owner's folder — that forces a
   cross-owner internal import (the violation #442 criterion 8 prohibits).
5. **Exception path** (inherited from #442): raise it before merging if you believe a function
   must be exported from an owner folder or a plugin's internals — the likely resolution is
   generalizing it into `src/lib/`.

### One consumer ⇒ it isn't shared — enforced by a test

Rule 4 is checked by `tests/unit/lib-boundary.spec.ts`: a module under `src/lib/` whose only
consumer lives outside `src/lib` **fails the unit lane**. Such a module is not shared code — it is
one owner's private helper sitting in the commons, importable by anything and read by the next
person as though it were general-purpose. The **view layer is untouched** — email templates stay
in `src/emails/`, and a job's sender imports its template from there.

**Counting consumers has three traps**, each of which gave a wrong answer while this was written,
so let the test do it rather than grepping:

| Trap                     | Example                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Barrel re-exports        | `recipients.ts` looked single-consumer by direct import. It has three, two via `lib/notifications/index.ts`               |
| Sibling relative imports | `browserRendering.ts` is imported as `./browserRendering` by `verifyEmbed.ts` next door — invisible to a `@/lib/…` search |
| `scripts/`               | The email preview scripts import senders directly                                                                         |

Three exemptions are built in:

- **Consumed only from inside `src/lib`** — a shared module decomposed into parts (a barrel and
  its members, or an integration seam like `turnstile/` kept separate so it unit-tests without
  booting its caller). The folder is the unit. Whether it's shared is answered by its entry point.
- **Consumed only by `scripts/`** — operator scripts are thin CLI wrappers whose routine lives in
  lib precisely so it can be unit-tested without running the script (see `scripts/AGENTS.md`).
- **`src/lib/migrations/`, consumed only by `src/migrations/`** — "move it beside its consumer"
  has no answer here: that consumer is frozen generated output, and the second consumer is a
  migration nobody has written yet. The count only ever grows.

`KNOWN_SINGLE_CONSUMER` in that spec records what already had one consumer when the check landed.
It's a backlog, not an approval, and should only shrink — a new entry needs a reason that outlives
the next reader.
