---
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# Project Structure

How `src/` is organized and where new code belongs. Established by #442 / PR
#443 (per-collection colocation) and #444 / this rule (the `src/lib/` split
into `plugins/`, `jobs/`, and shared utilities).

## `src/` layout

| Directory          | Holds                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| `src/plugins/`     | Modules registered in `payload.config.ts` (`plugins`, `email`, `db`)       |
| `src/collections/` | One folder per collection — schema + colocated hooks, endpoints, helpers   |
| `src/globals/`     | One folder per global — same colocation shape as collections               |
| `src/jobs/`        | One folder per scheduled job; `index.ts` exports only the task definitions |
| `src/lib/`         | Cross-cutting shared code (not a plugin, not owned by one collection/job)  |
| `src/fields/`      | Reusable field factories (`camelCase`)                                     |
| `src/components/`  | Admin-panel React components (`PascalCase`)                                |
| `src/app/`         | Next.js routes (admin, REST API, frontend, webhooks)                       |
| `src/migrations/`  | Payload schema migrations (see `.claude/rules/migrations.md`)              |

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
  `parseQuery`, `emptyPaginatedResponse`)
- domain folders shared across 2+ owners: `audiences/`, `meditations/`,
  `branding/`, `status/`, `lectures/`, `schedule/`, `subtleSystem/`,
  `pageTags/`, `cascadeDeletion/`, `eventTitle/` (the pure auto-title
  composition — the Events title hook and the quality checks both recompose it),
  `eventQuality/` (the listing-quality check registry + report builder, consumed
  by the Events collection, the admin panel and the backfill script; barrelled),
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
`audiences/`, `mapbox/`, and `schedule/` (`@/lib/schedule/scheduleHooks`). Don't
add a barrel that re-exports unrelated modules just for symmetry — it can pull
server-only code into client bundles, hurts tree-shaking, and invites import
cycles.

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
