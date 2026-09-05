# Architecture Overview

Top-level architecture for sy-devs-cms. Subsystem detail (storage, RBAC, OpenAPI, collection schemas, admin components) lives in each subsystem's nested `AGENTS.md`, or in `docs/rules/` when the subsystem is not one directory.

## Storage

Cloudflare Images and Stream handle media processing and CDN. R2 (S3 API) handles object storage, with an automatic local-file fallback in development.

| Storage | Collections | URL format |
| --- | --- | --- |
| **Cloudflare Images** | `images` (also referenced from albums, app-cards, meditations, lectures, authors, lessons, page blocks) | `https://imagedelivery.net/<hash>/<imageId>/public` |
| **Cloudflare Stream** | `videos`, `frames` (video MIME types) | thumbnail `.../thumbnails/thumbnail.jpg`, MP4 `.../downloads/default.mp4` (`mp4Url`), HLS `.../manifest/video.m3u8` (`hlsUrl`) |
| **R2 (S3 API)** | `meditations`, `songs`, `lessons`, `files`, `user-choices`, `song-tags`, plus mixed-media fallthrough on `frames`/`files` | `<CLOUDFLARE_R2_DELIVERY_URL>/<collection>/<filename>` |

On `frames` and `files`, `url` is the mixed-media file URL (image / R2 / MP4, by MIME). Read `mp4Url` when you need the MP4 specifically.

Adapter routing, the R2 filename hook, the Stream webhook, and Cloudflare response validation are documented in `docs/rules/storage.md` (auto-loads for `src/plugins/storage/`).

## Route Structure

- `src/app/(frontend)/` — public Next.js pages.
- `src/app/(payload)/` — Payload admin and API routes.
- `src/app/(payload)/api/` — Payload-generated API endpoints.

## Custom Endpoints

Three places to add an HTTP endpoint. Both Payload endpoint kinds are documented in `docs/rules/endpoints.md`. A collection-owned URL goes in `src/collections/<Name>/endpoints/*.ts` (gets Payload's own auth and access). A resource no collection owns (e.g. `/api/atlas/seo`) goes in `src/endpoints/*.ts` on `config.endpoints` (forgoes the usage plugin's hooks, so it must call origin enforcement by hand). Webhooks, health checks, OpenAPI generation, seed triggers, and anything needing the raw request body go in `src/app/(payload)/api/**/route.ts` (`docs/rules/routes.md`).

| Custom Payload endpoint | Path | Purpose |
| --- | --- | --- |
| `framesByNarrator` | `/api/frames/by-narrator/:narratorId` | frames filtered by narrator gender |
| `audiencesForUser` | `/api/audiences/for-user` | resolves eligible audience IDs from a user's progress data (4 required integers) and country. Returns sorted IDs. `max-age=300`. |
| `lecturesForAudience` | `/api/lectures/for-audience` | random lecture feed, filtered to an `audiences` overlap (OR). `max-age=600`. |
| `appCardsForAudience` | `/api/app-cards/for-audience` | published app cards for a `targetSection`, filtered by `audiences` overlap and weighted-random sampled. `max-age=600`. |
| `meditationLectures` | `/api/meditations/:id/related-lectures` | lectures ranked by topical overlap with the meditation's frames. Optional `userChoice` adds tagged lectures first. Falls back to the audience feed when nothing matches. `max-age=600`. |
| `atlasSeo` | `/api/atlas/seo?route=…&locale=…` | root-level. Everything a host page needs for one atlas route (title, description, canonical, hreflang, Open Graph, JSON-LD, body content) in one call. Keyed by the route's terminal segment, so stale ancestry still resolves. A region with no description returns `null`, never invented text. No HTML crosses the wire. `max-age=300`. |
| `atlasSitemap` | `/api/atlas/sitemap` | root-level. Every canonical URL this client owns, `loc` matching `atlasSeo`'s `canonical`. Nearest-owner wins. An unowned client gets `{ urls: [] }`. Relies on `Vary: Authorization`. `max-age=300`. |

| Next.js app-router route | Path | Purpose |
| --- | --- | --- |
| `health/route.ts` | `/api/health` | liveness check |
| `openapi.json/route.ts` | `/api/openapi.json` | filtered OpenAPI spec |
| `seed/[script]/route.ts` | `/api/seed/:script` | seed trigger, SSE |
| `webhooks/cloudflare-stream/route.ts` | `/api/webhooks/cloudflare-stream` | Cloudflare Stream webhook |

### Atlas event read + registration contract

`GET /api/events/geojson` and `POST /api/events/:id/register` back the Sahaj Atlas widget. A finished event stays published but drops off the feeds (#603/#604). `ExpireEvents` marks it `finished` without unpublishing, so `GET /api/events/:id` still renders an "Ended" panel. The public feeds exclude it via `excludeFinishedEvents`, keyed on `schedule.lastDate`. Registration is gated server-side (#599). The register endpoint refuses external-mode, ended, started-course, or full events with a `409` and a stable `code`. A denormalized `registrationsFull` boolean lets the widget show "Full" without a live count.

### Atlas SEO contract (`GET /api/atlas/seo`)

Serves one atlas route's metadata and body content as data (#645), so a host page can render its own `<head>` server-side. Consumers: WeMeditateWeb's `/map` routes, and the WordPress plugin (13 of 29 known domains).

- **Keyed by the route's terminal segment, not the whole path.** A region slug is unique, and an event id needs no ancestry. Both match the widget's own `resolvePath` rule — a restructured subtree does not 404 every inbound link.
- **`where['breadcrumbs.url'][equals]` is not a unique key.** `breadcrumbs` is an array, so `equals` also matches every descendant (`/gb/london` matches London's whole subtree). Use `slug` instead for exactly one region.
- **Nothing in the atlas is localized.** Titles and descriptions are single values the widget translates client-side. The canonical is locale-free, and `alternates` differ only by the widget's `?locale=`.
- **The `alternates` language set is operator-owned**, on `sy-atlas-config.languages` — not the CMS's full locale list. See `src/globals/AGENTS.md` for why the field must not be named `locales`.

`GET /api/atlas/sitemap` is the enumeration half (#650). `/sitemap` answers every route this client owns, as the same `webUrl` `/seo` returns as `canonical`. The two can't drift and 404 a crawler (`tests/int/atlas-sitemap.int.spec.ts`).

**Unowned regions (#652).** We Meditate is not a client, just two env vars, so unclaimed regions had no sitemap at all. `sy-atlas-config.canonicalFallbackClient` names the client that owns the remainder, and that client's own sitemap then covers it. It is an override: an unset, unpublished, or unverified fallback client leaves the env-var fallback in place. The owners map stays sparse on purpose, so a nearer client's subtree still drops out of an ancestor's sitemap.

## OpenAPI / Scalar API Docs

REST docs run on `payload-oapi` plus a custom Scalar plugin with We Meditate branding. See `docs/rules/openapi.md` (auto-loads for `src/plugins/openapi/` or the OpenAPI route handlers).

## Collections

- **Managers** / **Clients** — admin users (email/password, granular permissions) and API clients (keys, usage tracking, alerts).
- **Pages** — Lexical rich text with embedded blocks, drafts, version history, scheduled and per-locale publishing.
- **Meditations** — guided audio with `type`, `timings`, auto-extracted `duration`, timestamped frame relationships, and a denormalized `subtleSystemNodeWeights` field that drives the ranking in `/api/meditations/:id/related-lectures`.
- **Albums** / **Songs**, **Lessons** ("Path Steps") — music groupings with artwork, and audio + panel Path Steps with an optional meditation link.
- **Videos** — Cloudflare Stream uploads, HLS. `mp4Url` 404s until the Stream webhook enables it.
- **AppCards** — mobile cards with `type` (`standard`/`event`), three view tabs, `audiences` (OR), `conditions` (AND), and a `weight`.
- **Images**, **Narrators**, **Authors** — media and profile collections.
- **Lectures** — full-talk content via the Nirmala Vidya API, no drafts. `subtleSystemNodes` drives the related-lectures ranking. Optional `userChoices` drives that endpoint's user-choice gate.
- **Frames** / **Files** — mixed-media uploads and storage, routed by MIME type, with trash and automatic orphan cleanup.
- **UserChoices**, **SubtleSystemNodes** (12 chakras/nadis), **SongTags** — the tag collections referenced by Lectures and Frames.
- **Audiences** — reusable targeting rules for AppCards and Lectures: progress ranges plus a country gate, evaluated on `/api/audiences/for-user`.
- **Forms** / **Form Submissions** — auto-generated by the Form Builder plugin.

Page, Video, and Image tags are inline enum fields, not separate collections. Field, hook, and validator detail lives in `src/collections/AGENTS.md` (auto-loads for `src/collections/` or `src/fields/`).

## Component Architecture

`src/components/AdminProvider.tsx` is the admin UI provider, and `src/components/ErrorBoundary.tsx` is the React error boundary. Custom admin components, the project-aware dashboard, branding, and the audio-synced frame editor live in `docs/rules/admin-ui.md` (auto-loads for `src/components/admin/`, `src/components/branding/`, or `src/globals/`).

## Logging & Error Tracking

Server logging uses a custom console-backed logger (`src/lib/logger/workerSafeLogger.ts`). It implements the Pino subset Payload uses, respects `NEXT_PUBLIC_LOG_LEVEL`, and normalizes `Error` objects into plain serializable ones. Error tracking uses Sentry (`@sentry/nextjs`): `src/instrumentation.ts` / `src/instrumentation-client.ts` initialize it, `next.config.mjs` wraps with `withSentryConfig`, and `src/app/global-error.tsx` reports React errors. Source maps upload when `SENTRY_AUTH_TOKEN` is set at build time. `SENTRY_TRACES_SAMPLE_RATE` (default `0.1`) enables a DB-span breakdown on every admin request. `meditations.recomputeNodeWeights` and `frames.cascadeNodeChange` also carry manual spans (#529).

### A caller's mistake is not an incident (#670)

A value Postgres cannot cast (SQLSTATE `22P02`) used to surface as an unhandled 500. `@/plugins/databaseErrors` now maps it, in Payload's root `afterError` hook, to a 400 naming the bad value, and stops it reaching Sentry. Every other error class is untouched. This covers Payload's own REST routes only. A custom endpoint that catches its own errors — `src/collections/Events/endpoints/geojson.ts` is the one that does — must call `mapPostgresCastError` itself.

### What an error body discloses (#684)

`config.debug` (`!isProduction`) controls the response body, not logging: with it on, `routeError` attaches `response.stack` and the real error message. It was `true` everywhere until #684, so production once returned a database error's full statement and bound parameters. Server logs and Sentry are unaffected either way.

It checks `NODE_ENV`, deliberately, so a Railway preview (which also runs `NODE_ENV=production`) redacts too. Debug a red preview from Railway's logs, not the response body. The 400 above is the one path still returning Postgres text, and only because `routeError` redacts before `afterError` hooks run (`tests/int/error-disclosure.int.spec.ts` pins the order).

### Slow-query logging (dev only)

`DB_QUERY_LOGGING=true` turns on Drizzle's query logger. It is force-disabled in production. Railway (including previews) always runs `NODE_ENV=production`, so this only ever fires in local dev. **It logs bound params — emails, tokens, keys — so never enable it against real or cloned production data**. For staging/prod timings, set Railway Postgres `log_min_duration_statement` instead.

## Database connection pool & depth caps

`src/payload.config.ts` configures the pool and query depth.

- **Pool** — `pool.max` (`DATABASE_POOL_MAX`, default `20`). Measured 2026-07: `max_connections` is 100 (97 usable), with 1 production replica. Peak load is `pool.max × replicas`, plus deploy overlap (the new container runs migrations while the old one drains), plus ~5-10 Postgres internals. That is about 50 at `max=20`, comfortable under 97. **Before adding a 2nd replica**, drop `max` to ~30-35 or raise `max_connections`: steady load alone would then reach 40, and overlap can approach 80.
- **Depth caps** — `defaultDepth: 2`, `maxDepth: 3` (Payload's default is 10). `maxDepth` clamps any caller-requested `depth`, and is surfaced as the OpenAPI `depth` parameter's `maximum`.

## Scheduled Jobs

Payload's `autoRun` job system runs background tasks in the same long-lived Node process on Railway — no separate workers.

- **`CleanupOrphanedMedia`** — monthly. Purges trashed items past the 30-day grace period, then trashes newly-orphaned files/images, found via schema introspection (`schemaUtils.ts`) rather than a hardcoded list. Tagged images (e.g. "featured") are preserved.
- **`ExpireEvents`** — daily 02:00 UTC, single-threaded. A schedule that ran out gets `verificationStage: 'finished'` without unpublishing (#603, so an old link keeps resolving) — the public feeds filter it via `schedule.lastDate` instead. Otherwise it advances the ladder `verified → reminded → escalated → urgent → expired → trash`. Only `urgent → expired` unpublishes. A stage advances only once every recipient's email is logged, so a failed send retries. Manual trigger: `pnpm payload jobs:run --queue nightly`.
- **`RegistrationNotifications`** — hourly. `SendSessionReminders` reminds a registrant ~24h before their session, deduped via `activityLog`. `SendRegistrationDigests` runs daily 07:00 UTC (plus weekly on Monday), batching new registrations per manager into one email.
- **User-message screening + retention** — `POST /api/user-messages` (#632) persists and returns immediately. `screenUserMessage` runs an MX lookup, a disposable-address check, and 24h repeat-sender/duplicate-body checks, then files the message as `spam` or delivers it. `purgeUserMessages` deletes `delivered` after 7 days and `spam` after 90 (`failed` is never swept) — 7 days matters, since less would delete the history the screening checks need.
- **Usage tracking** — `trackUsage` increments `dailyRequests` atomically off `afterRead`. `resetUsage` resets it daily, tracking `peakDailyRequests`. See `docs/rules/api-clients.md`.

## Key Configuration Files

- `src/payload.config.ts` — Payload configuration (Postgres adapter, `prodMigrations`).
- `next.config.mjs` — Next.js configuration (wrapped with `withSentryConfig`).
- `src/payload-types.ts` — generated types. Do not edit.
- `tsconfig.json` — TypeScript path aliases.
- `eslint.config.mjs` — ESLint configuration.
- `vitest.config.mts` — Vitest configuration.
- `playwright.config.ts` — Playwright configuration.
- `railway.toml` — Railway deployment configuration.
- `src/lib/richEditor/index.ts` — Lexical editor presets.
