# Architecture Overview

Top-level architecture for sy-devs-cms. Subsystem details (storage,
RBAC, OpenAPI, individual collection schemas, admin components, etc.)
live in the nested `AGENTS.md` guide inside each subsystem's directory,
or — where the subsystem is not one directory — in `docs/rules/`, which
`.claude/rules/` symlinks so the rule loads by path glob.

## Storage

Hybrid approach: Cloudflare Images & Stream for media processing + CDN, R2 (S3 API) for object storage, with automatic local-file fallback in development.

| Storage               | Collections                                                                                                                   | URL format                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Images** | `images` (also referenced from albums, app-cards, meditations, lectures, authors, lessons, page blocks)                       | `https://imagedelivery.net/<hash>/<imageId>/public`                                                                                                                                       |
| **Cloudflare Stream** | `videos`, `frames` (video MIME types)                                                                                         | thumbnails: `https://customer-<code>.cloudflarestream.com/<videoId>/thumbnails/thumbnail.jpg`<br>MP4: `.../downloads/default.mp4` (`mp4Url`)<br>HLS: `.../manifest/video.m3u8` (`hlsUrl`) |
| **R2 (S3 API)**       | `meditations`, `songs`, `lessons`, `files`, `user-choices`, `song-tags`, plus mixed-media fallthrough on `frames` and `files` | `<CLOUDFLARE_R2_DELIVERY_URL>/<collection>/<filename>`                                                                                                                                    |

### Canonical URL field names

`videos`, `frames`, and `files` expose `hlsUrl` (HLS manifest) and `mp4Url` (MP4 download) virtual fields. On `frames` and `files` the generic `url` field is the mixed-media file URL (image / R2 / MP4 by MIME); read `mp4Url` when you specifically need the MP4. Lecture player-data responses (`/api/lectures/for-audience`, `/api/meditations/:id/related-lectures`) expose `hlsUrl`.

Adapter routing, the R2 filename preassignment hook, the
Cloudflare Stream webhook, and Zod-validated Cloudflare API responses
are all documented in `docs/rules/storage.md` (auto-loads when
editing `src/plugins/storage/`).

## Route Structure

- `src/app/(frontend)/` — public-facing Next.js pages
- `src/app/(payload)/` — Payload CMS admin interface and API routes
- `src/app/(payload)/api/` — Payload-generated API endpoints

## Custom Endpoints

Three places to add HTTP endpoints, chosen by scope:

| Use case                                                                                                                                                       | Where                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| URL belongs under a collection (e.g. `/api/frames/by-narrator/:narratorId`); single-collection ops; want automatic Payload auth/access integration             | `src/collections/<Name>/endpoints/*.ts` — see `docs/rules/endpoints.md` |
| A Payload endpoint for a resource **no** collection owns (`/api/atlas/seo`, `/api/atlas/sitemap`); registered on `config.endpoints`. Rare — it forgoes the usage plugin's beforeOperation hooks, so origin enforcement must be called by hand. "Unpersisted" is not the same as "ownerless": #632 deleted a third once its resource needed storing | `src/endpoints/*.ts` — see `docs/rules/endpoints.md`                    |
| Webhooks, health checks, OpenAPI spec generation, seed triggers, multi-collection operations; need raw request body or Next.js features (streaming, redirects) | `src/app/(payload)/api/**/route.ts` — see `docs/rules/routes.md`        |

| Custom Payload endpoints | Path                                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `framesByNarrator`       | `/api/frames/by-narrator/:narratorId`   | frames filtered by narrator gender                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `audiencesForUser`       | `/api/audiences/for-user`               | resolves the eligible audience IDs for a user from their progress data (`pathProgress`, `meditationsPerWeek`, `totalMeditationsViewed`, `totalLecturesViewed` — required integers) and required context (`country` ISO alpha-2). All five params are required. Single query: progress-range WHERE clause applied to all audiences (unset bounds always pass); country gate applied in JS post-query (empty list passes). Returns sorted IDs. Mobile clients call once per state change and pass the result as `audiences` to the data endpoints below. `Cache-Control: public, max-age=300, s-maxage=300`.                                                                                                          |
| `lecturesForAudience`    | `/api/lectures/for-audience`            | uniform-random lecture feed filtered to lectures whose `audiences` overlap the supplied `audiences` ID list (OR semantics). `Cache-Control: public, max-age=600, s-maxage=600`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `appCardsForAudience`    | `/api/app-cards/for-audience`           | published app cards for a `targetSection`, filtered to cards whose `audiences` overlap the supplied `audiences` list (OR semantics) and weighted-random sampled. `Cache-Control: public, max-age=600, s-maxage=600`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `meditationLectures`     | `/api/meditations/:id/related-lectures` | lectures ranked by topical overlap between the meditation's frames and each lecture's own `subtleSystemNodes` (zero-overlap lectures dropped). Optional `userChoice` query expands candidates to lectures that either carry that user-choice tag **or** have positive subtle-system-node overlap (OR semantics). userChoice-tagged lectures are returned as a group first (weight DESC, including zero-overlap ones), followed by non-userChoice lectures with positive overlap (also weight DESC). Node IDs are resolved via a single bounded lookup (max 12 rows). Audience filtering uses the same `audiences` ID list contract as the other data endpoints. When relevance matches nothing, the response falls back to the generic audience feed (same selection as `/api/lectures/for-audience`); the `{ docs, source, relevanceCount }` envelope reports `source: 'relevance'` vs `'audience-fallback'`, and `excludedLectureIds` are relaxed only if they would otherwise empty the feed. `Cache-Control: public, max-age=600, s-maxage=600`. |
| `atlasSeo`               | `/api/atlas/seo?route=…&locale=…`       | **Root-level** (`config.endpoints`, not a collection — the route may name a region *or* an event): everything a host page needs to render one atlas route, in one call (#645, stage C3 of the white-label & SEO programme). Title, meta description, canonical, hreflang, Open Graph, escaped JSON-LD, plus the body content the host renders as children of `<sahaj-atlas>`. Keyed by the route's **terminal segment** — a region slug is globally unique, an event id needs no ancestry — so view segments, legacy prefixes and stale ancestry all still resolve, and the answer's `route`/`canonical` name the URL to redirect to. `canonical` is the document's own `webUrl`, **read not recomputed**, and locale-free. `jsonLd` is pre-escaped for a `<script type="application/ld+json">`; **no HTML crosses the wire** (a description arrives as plain-text paragraphs), because C5's WordPress plugin echoes it into a template that never passes through `wp_kses`. A region gets `description: null` — it has none in the CMS, and an invented English sentence would land in a national site's `<head>`. Runs no usage-plugin hook for the handler itself, so it calls `assertClientOriginAllowed` directly. `Cache-Control: public, max-age=300, s-maxage=300`. |
| `atlasSitemap`           | `/api/atlas/sitemap`                    | **Root-level** (`config.endpoints`, not a collection — the answer spans regions *and* events, and its unit is the caller's own ownership): every canonical URL **this client owns**, so a consumer can build a sitemap (#650, stage C6). Each `loc` is the document's own `webUrl` — the identical value `atlasSeo` returns as `canonical`, read from the identical place — because a sitemap is the one artefact whose whole job is to publish URLs a crawler will fetch, so a second implementation of the URL rule (in a WordPress plugin, in PHP) would be a set of 404s submitted to Google on purpose. Ownership is per-subtree with the **nearest** declaring client winning, so a country-level client's answer excludes a city another client owns. A client owning no subtree gets `{ urls: [] }` and a `200`, not a 404; a document with no publishable canonical is omitted rather than sent as `null`; finished classes are excluded, as they are from the map feed. Unpaginated. Unlike `atlasSeo` the answer is **per-client**, so it leans on `Vary: Authorization` to keep the edge from serving one client's routes to another. Runs no usage-plugin hook for the handler itself, so it calls `assertClientOriginAllowed` directly. `Cache-Control: public, max-age=300, s-maxage=300`. |

| Next.js app-router routes             | Path                              | Purpose                           |
| ------------------------------------- | --------------------------------- | --------------------------------- |
| `health/route.ts`                     | `/api/health`                     | liveness check                    |
| `openapi.json/route.ts`               | `/api/openapi.json`               | filtered OpenAPI spec             |
| `seed/[script]/route.ts`              | `/api/seed/:script`               | seed trigger with SSE             |
| `webhooks/cloudflare-stream/route.ts` | `/api/webhooks/cloudflare-stream` | Cloudflare Stream webhook handler |

### Atlas event read + registration contract

`GET /api/events/geojson` + `POST /api/events/:id/register` back the Sahaj Atlas
widget. Two behaviours it depends on:

- **Finished events stay published but drop off the feeds (#603/#604).** When an
  event's schedule runs out, the ExpireEvents job marks it `finished` but leaves
  it **published** — so `GET /api/events/:id` stays readable and the widget
  renders an "Ended" panel, while the public feeds (`GET /api/events` for clients
  and `GET /api/events/geojson`) exclude it via `excludeFinishedEvents` /
  `notFinishedWhere`. Finished-ness keys off the stored `schedule.lastDate`
  (`shouldFinish` and its SQL counterpart), not the virtual `upcomingDates`.
- **Registration is gated server-side (#599).** The register endpoint refuses
  external-mode / ended / started-course / full events with a `409` and a stable
  machine-readable `code` (`src/collections/Events/endpoints/responseTypes.ts`),
  and a denormalized `registrationsFull` boolean on the event lets the widget
  render the "Full" state at read time (O(1), no raw counts). The gate + fullness
  logic live in `src/lib/registrations/`.

### Atlas SEO contract (`GET /api/atlas/seo`)

`GET /api/atlas/seo?route=/gb/london` serves one atlas route's metadata **and**
body content as data, so a host page can render it server-side and emit the
`<head>` itself (#645). Consumers: WeMeditateWeb's SSR `/map` routes, and the
WordPress plugin that covers 13 of the 29 known client domains. Three things
that are easy to get wrong from outside:

- **A route is keyed by its terminal segment, not by its whole path.** A region
  slug is globally unique and an event id needs no ancestry, which is also the
  widget's own rule (`resolvePath` in SahajAtlasWeb). So stale ancestry still
  resolves and the answer names the URL to redirect to — a restructured subtree
  doesn't 404 every inbound link.
- **`where['breadcrumbs.url'][equals]` is not a unique key**, despite reading
  like a path match. `breadcrumbs` is an array and Payload's `equals` matches on
  *any* element, so `/gb/london` matches every descendant of London too. #640
  shipped `generateURL` to enable that lookup; use the `slug` column instead
  when you need exactly one region.
- **Nothing in the atlas is localized.** Event titles, region names and
  descriptions are single values the widget translates client-side. So the
  canonical is locale-free and shared by every locale, `alternates` differ only
  by the widget's `?locale=` UI language, and this endpoint composes no prose —
  a sentence written here would be English in a national site's `<head>`.
- **The `alternates` language set is operator-owned**, on `sy-atlas-config`'s
  `languages` field — not a constant, and not the CMS's full locale list. It is
  read per request (memoized), so turning a language off stops us advertising it
  to crawlers without a deploy. The OpenAPI enum stays the CMS superset, because
  the spec is built statically and this is runtime data. See
  `src/globals/AGENTS.md` for the field, **including why it must not be named
  `locales`**.

`GET /api/atlas/sitemap` is the enumeration half of the same contract (#650):
`/seo` answers one route at a time, and nothing listed the routes, so no consumer
could build a sitemap. It answers the routes **this client owns**, as the
canonical URLs it would publish for them — and each `loc` is the same `webUrl`
`/seo` returns as `canonical`, read rather than recomposed, for the reason the
whole design exists. A consumer composing routes from `/api/regions` +
`/api/events/geojson` would be a second implementation of the URL rule, free to
disagree about mount joining and query-vs-path routing; a sitemap that disagrees
is a set of 404s handed to a crawler deliberately.
`tests/int/atlas-sitemap.int.spec.ts` asserts the two agree rather than trusting
that they do.

**The one thing it does not cover**: the We Meditate fallback surface is not a
*client*, so a region nothing declares belongs to no client's sitemap. That is
the rule #650 specifies (a client with no owned subtree gets `{ urls: [] }`), and
it means WeMeditateWeb needs a canonical-ownership record of its own before this
endpoint can feed its sitemap.

## OpenAPI / Scalar API Docs

REST API documentation built on `payload-oapi` + a custom Scalar plugin
with We Meditate branding. Endpoints, project filtering, custom-endpoint
shim, and the known-limitations list are in `docs/rules/openapi.md`
(auto-loads when editing `src/plugins/openapi/` or the OpenAPI route handlers).

## Collections

### Access & user management

- **Managers** (`src/collections/Managers/Managers.ts`) — auth-enabled admin users with email/password, admin toggle, granular collection/locale-based permissions.
- **Clients** (`src/collections/Clients/Clients.ts`) — API client management with API keys, usage tracking, granular permissions, high-usage alerts.

### Content

- **Pages** — Lexical rich text with embedded blocks; drafts (60 s autosave), version history, scheduled publishing, per-locale publishing.
- **Meditations** — guided audio with `type` select (quick / daily / lesson), `timings` multi-select, `duration` (auto-extracted via `music-metadata`), frame relationships with timestamps, locale-specific filtering, drafts. A denormalized `subtleSystemNodeWeights` JSON field (`{ slug → on-screen seconds }`) caches per-meditation topical fingerprints; recomputed by an `afterChange` hook when `frames`/`duration` change, and cascaded by Frames' `afterChange` when a frame's `subtleSystemNode` is repointed. Drives the topical-overlap ranking in `/api/meditations/:id/related-lectures`.
- **Albums** — music album groupings with `artwork` relationship to Images and a join field for related songs.
- **Songs** — background music tracks with audio upload, required album relationship, hidden from sidebar (managed via Albums).
- **Lessons** ("Path Steps") — audio + panels array, unit selection (1–4), step number, optional meditation relationship, localized rich text article.
- **Videos** — Cloudflare Stream uploads with HLS streaming, virtual `url` (HLS, live immediately) and `previewUrl` (thumbnail) fields; `mp4Url` exposes the MP4 download separately (404s until the Stream webhook enables it).
- **AppCards** — mobile cards with `type` discriminator (`standard` / `event`). Three named view tabs under Appearance: `default` (always shown), `startingSoon` and `liveNow` (event-only, each gated by `enabled` + `threshold` HH:MM). Every view tab has `header`, `image`, `overlay`, `title`, `subtitle`, `button`, and a `destination` row (appPage / lecture / album / meditation / url). Event cards carry a `scheduleField` in the Rules tab. `audiences` hasMany (OR semantics — shown if any overlap), `conditions` hasMany (AND semantics — all context audience IDs must be in the caller's resolved list), weight (1–5). A `AppCardViewSchedule` admin component shows the active time window for each view when schedule + threshold are configured.

### Resources

- **Images** — Cloudflare Images uploads with virtual `url`.
- **Narrators** — meditation guide profiles (name, gender, slug).
- **Authors** — article author profiles.
- **Lectures** — full-talk lecture content integrated with Nirmala Vidya API. No drafts. Optional `startTime`/`endTime` excerpt fields, `audiences` hasMany, `subtleSystemNodes` hasMany (drives the topical-overlap ranking on `/api/meditations/:id/related-lectures`), and optional `userChoices` (drives the user-choice gate on the same endpoint, where setting a `userChoice` query also relaxes the chakra filter so zero-overlap matches are kept).

### System

- **Frames** — mixed-media uploads (images/videos) with virtual `url` and `previewUrl`, `tags` enum filtering, `imageSet` selection, and a `subtleSystemNode` relationship classifying each frame by chakra/nadi.
- **Files** — mixed-media storage with intelligent routing (Cloudflare Images / Stream / R2 by MIME type), trash, automatic orphan cleanup.

### Tags / Audiences

- **UserChoices** (formerly MeditationTags) — upload collection with SVG icons, color picker, single-level parent/child nesting, required `type` (`mood` | `goal`), `timings`, per-timing localized meditation relationships, `isParent` auto-maintained by hooks. Mood-only fields hide via `admin.condition` on goal-type rows. Reverse joins expose attached `lectures`.
- **SubtleSystemNodes** — closed enum of 12 chakras + nadis. Each row has a unique `slug` and a required relationship to a `pages` doc that describes it. Reverse joins expose attached `lectures` and `frames`. Referenced by Lectures (`subtleSystemNodes` hasMany — drives the meditationLectures ranking) and Frames (`subtleSystemNode` single relationship — replaces the old enum `category` field).
- **SongTags** — upload collection with SVG icons (no color field). Admin labels say "Music Category".
- **Audiences** — reusable visibility/targeting rules referenced by AppCards and Lectures. Each audience is a unified rule set: four optional progress ranges (`pathProgress`, `meditationsPerWeek`, `totalMeditationsViewed`, `totalLecturesViewed` — unset = always passes) plus an optional country gate (empty list = all countries). All rules must pass for the audience to match. Three bidirectional joins: `lectures`, `appCards`, `appCardConditions`. Rule eval lives on `/api/audiences/for-user`; data endpoints take pre-resolved IDs.

Page, Video, and Image tags are inline enum select fields on their
respective collections (not separate tag collections).

Detailed field descriptions, hooks, validators, and per-collection test
coverage live in `src/collections/AGENTS.md` (auto-loads when editing
`src/collections/` or `src/fields/`).

### Plugin-generated collections

- **Forms** — auto-generated by Form Builder plugin (form definitions).
- **Form Submissions** — auto-generated submission storage.

## Component Architecture

- `src/components/AdminProvider.tsx` — admin UI provider (wraps with ProjectProvider).
- `src/components/ErrorBoundary.tsx` — React error boundary.
- `src/app/(payload)/` — Payload CMS admin interface and API routes.
- `src/app/(frontend)/` — public-facing Next.js pages.

Custom admin components, the project-aware dashboard, branding system,
and the audio-synchronized frame editor are documented in
`docs/rules/admin-ui.md` (auto-loads when editing
`src/components/admin/`, `src/components/branding/`, or `src/globals/`).

## Logging & Error Tracking

Server-side logging uses a **custom console-backed Payload logger** (`src/lib/logger/workerSafeLogger.ts`); error tracking uses **Sentry** via `@sentry/nextjs`.

### Logging

The custom logger:

- Implements the subset of the Pino interface that Payload uses.
- Respects `NEXT_PUBLIC_LOG_LEVEL` (`silent` | `error` | `warn` | `info` | `debug`).
- Supports `child()` bindings (preserves contextual fields).
- Normalizes `Error` objects into plain serializable objects.
- Runs consistently in local dev, Railway, and tests.

### A caller's mistake is not an incident (issue #670)

A value Postgres cannot cast to a column's type raises SQLSTATE `22P02` and used
to surface as an unhandled **500** — telling the caller nothing, and filling a
channel where a 500 means *wake someone*. `@/plugins/databaseErrors` maps it in
Payload's root `afterError` hook to a **400 naming the offending value**, logs it
at WARN through `payload.logger`, and `@/plugins/sentry` asks the same predicate
(`mapPostgresCastError`) before reporting, so these no longer reach Sentry at all.
Every other error is untouched: a genuine 500 stays a 500 and is still reported.

Generic over the SQLSTATE rather than over enums, so it covers every enum, id and
date cast, present and future. The driver's `code` is read off the `cause` chain,
because drizzle wraps each failed query in a `Failed query: …` error;
`tests/int/database-cast-errors.int.spec.ts` pins that shape against a real
Postgres rather than a fixture.

### Sentry integration

- `src/instrumentation.ts` — Server-side initialization (`@sentry/nextjs`)
- `src/sentry.server.config.ts` — Sentry config for server
- `src/instrumentation-client.ts` — Client-side initialization (`@sentry/nextjs`)
- `next.config.mjs` — wrapped with `withSentryConfig` from `@sentry/nextjs`
- `src/app/global-error.tsx` — React error boundary with Sentry reporting

Source maps are uploaded to Sentry when `SENTRY_AUTH_TOKEN` is set during build.

### Performance tracing (issue #529)

- Enabled via `SENTRY_TRACES_SAMPLE_RATE` (server env, default `0.1`; `0`
  disables). Read directly from `process.env` in `src/sentry.server.config.ts`
  so it survives early `instrumentation.register()` boot without the full
  server-env parse.
- `@sentry/node`'s HTTP + `pg` auto-instrumentation turns each admin request —
  bulk edits and the `/api/{collection}` reads the list/edit views fire — into a
  transaction with a **DB-span breakdown**, no manual spans required.
- Manual spans wrap the two expensive write-path hooks so their query clusters
  read as a single named node in a trace: `meditations.recomputeNodeWeights`
  (`src/collections/Meditations/hooks/recomputeMeditationNodeWeights.ts`) and
  `frames.cascadeNodeChange` (`src/collections/Frames/hooks/cascadeFrameNodeChange.ts`).

### Slow-query logging (dev/staging)

- `DB_QUERY_LOGGING=true` turns on Drizzle's query logger (SQL + params to the
  console) via `postgresAdapter({ logger })`. Opt-in and **force-disabled in
  production** (`!isProduction && serverEnv.DB_QUERY_LOGGING`). The guard is
  `NODE_ENV !== 'production'`, and Railway builds (staging previews included) run
  `NODE_ENV=production`, so in practice this only fires in **local dev**. Use it
  to see the query trail (and any N+1 growth) behind a slow admin operation.
- **Caution**: it logs bound query params — which can include emails, auth /
  reset tokens, and API keys. Never enable it in any environment holding **real
  or cloned production data**; keep it to local/synthetic data only.
- For server-side **timings** in staging/prod, set Railway Postgres
  `log_min_duration_statement` (e.g. `200ms`) on the database service — it logs
  every statement slower than the threshold with its duration. Prefer this over
  the Drizzle logger wherever real data is present.

## Database connection pool & depth caps

`src/payload.config.ts` configures the Postgres adapter pool and global query depth:

- **Pool** — `pool.max` (via `DATABASE_POOL_MAX`, default `20`) plus
  `idleTimeoutMillis` / `connectionTimeoutMillis`. Size `max` to the **Railway
  Postgres connection limit divided across running instances**, and cap it so
  bursts of parallel admin work (a bulk publish runs its per-doc queries
  concurrently — see #542) can't exhaust connections.

  **Measured production infrastructure (2026-07, verified via Railway CLI + prod
  `pg_settings`):**

  | Fact | Value |
  |---|---|
  | Postgres `max_connections` | **100** (`superuser_reserved_connections=3` → **97 usable**) |
  | Production app replicas | **1** (`numReplicas` unset, hobby plan, no multi-region / no `railway.toml` scaling) |
  | DB isolation | Prod Postgres serves **only** the prod app — each PR preview env has its own Postgres |
  | `DATABASE_POOL_MAX` in prod | **unset** → the code default in `src/lib/env/server.ts` is authoritative |

  **Sizing formula.** Peak connections ≈ `pool.max × replicas` **+ deploy overlap**
  (Railway boots the new container — which runs in-process migrations on boot —
  while the old one drains, ≈ up to a second pool for a few seconds) **+ ~5–10**
  Postgres internals/admin (`psql`, autovacuum, walwriter…). Keep that peak under
  the 97 usable. At `max=20`, 1 replica → steady 20, deploy-overlap ~40, +internal
  ~10 ≈ **~50 peak** — comfortable. **Before adding a 2nd replica** revisit: `2 ×
  20` steady = 40 and deploy-overlap can approach 80, so drop `max` (≈ 30–35 for 2
  replicas) or raise the server's `max_connections`. Future bulk-write
  optimizations (batched endpoint, serialized writes) should re-measure with the
  Drizzle logger / Sentry `pg`-span capture rather than simply raising `max`.
- **Depth caps** — `defaultDepth: 2` (Payload's own default, set explicitly) and
  `maxDepth: 3` (down from Payload's default 10). `maxDepth` clamps any explicit
  `depth` a caller asks for, guarding against runaway edit-view / API
  over-fetching; the app's own queries never request beyond depth 2. The cap is
  surfaced to REST clients as the `depth` query param's `maximum` in the OpenAPI
  spec (`@/plugins/openapi/clientReadParametersDocs.ts`).

## Scheduled Jobs

PayloadCMS's built-in autoRun job system handles background task processing on Railway's long-lived Node.js process.

**How it works**:

- `payload.autoRun` initializes the job queue on server start
- Jobs run asynchronously in the same Node process (no separate workers needed)
- Drizzle Postgres pool handles concurrent queries across jobs (Railway Postgres 18)

### `CleanupOrphanedMedia` (`src/jobs/CleanupOrphanedMedia/CleanupOrphanedMedia.ts`)

Monthly task that cleans up orphaned files and images. Two-phase:

1. **Permanent deletion** — purges items already in trash (`deletedAt` set) past the grace period (30+ days).
2. **Orphan detection** — identifies unreferenced media and moves them to trash.

Uses **schema introspection** (`src/jobs/CleanupOrphanedMedia/schemaUtils.ts`) to auto-discover
all `files` / `images` references across collections instead of
hardcoding the list. Scans Lexical rich-text content for embedded block
references. Tag-based preservation: images with non-orientation tags
(e.g. "featured") are kept.

| File                                                    | Purpose                        |
| ------------------------------------------------------- | ------------------------------ |
| `src/jobs/CleanupOrphanedMedia/CleanupOrphanedMedia.ts` | Implementation                 |
| `src/jobs/CleanupOrphanedMedia/schemaUtils.ts`          | Schema introspection utilities |
| `tests/int/cleanup-orphaned-media.int.spec.ts`          | Integration tests              |
| `tests/int/schema-utils.int.spec.ts`                    | Schema-utils tests             |

### `ExpireEvents` (`src/jobs/ExpireEvents/ExpireEvents.ts`)

Daily 02:00 UTC sweep on the `nightly` queue (single-threaded via an exclusive
concurrency key, so the read-then-advance is race-free). Picks up every event
whose `nextCheckAt` has passed and does one of two things:

1. **Finished** — its schedule has run out (`shouldFinish`, from
   `src/lib/schedule/scheduleStatus.ts`). Sets `verificationStage: 'finished'`
   and clears `nextCheckAt`. **Does not unpublish** (#603): a finished event's
   Atlas page must keep resolving for a seeker following an old link, and
   `webPath` / `webUrl` are publish-gated. It leaves the public *feeds* instead —
   they filter on `schedule.lastDate` on every read, so unlike the stage, that
   never lags behind this job. Dormant `inactive` events never finish.
2. **The unverified ladder** — `verified → reminded → escalated → urgent →
   expired`, then trash. Escalating reminders go to the event manager, then
   ancestor-region managers from `escalated` on. **`urgent → expired` is the only
   transition that unpublishes**; `expired → trash` soft-deletes after the grace
   period. A stage advances only once every recipient's email is logged, so an
   undelivered reminder retries next run rather than ageing the event.

| File                                    | Purpose                                             |
| --------------------------------------- | --------------------------------------------------- |
| `src/jobs/ExpireEvents/ExpireEvents.ts` | Sweep + per-event processing                        |
| `src/jobs/ExpireEvents/stageMachine.ts` | Stage transitions, offsets, unpublish/trash decisions |
| `src/lib/schedule/scheduleStatus.ts`    | `shouldFinish` — shared with the feeds + registration |
| `tests/int/expire-events.int.spec.ts`   | Integration tests (incl. publish side effects)       |
| `tests/unit/expire-events-stage-machine.spec.ts` | Stage-machine unit tests                    |

Manual trigger: `pnpm payload jobs:run --queue nightly`.

### `RegistrationNotifications` (`src/jobs/RegistrationNotifications/`)

Two scheduled tasks serving event-registration notifications (#589), both on the
hourly `nightly` queue with exclusive concurrency:

- **`SendSessionReminders`** — hourly (`0 * * * *`). Reminds each subscribed
  registrant ~24h before a session. Enumerates occurrences from the schedule via
  `buildRRuleTemporal` (exclusions applied), sends the client-branded
  `SessionReminderEmail`, and dedupes exactly-once via the registration's
  `activityLog` (`hasLogEntry(log, 'session-reminder', occurrence)`), which
  doubles as the manager-readable record of what was sent. Hourly cadence keeps the notice within 23–24h of the
  session (< 1h deviation). Skips unsubscribed (`remindersUnsubscribedAt`),
  unpublished/trashed, and non-registration events.
- **`SendRegistrationDigests`** — daily 07:00 UTC (`0 7 * * *`); the Monday run
  also sends weekly digests. Batches new registrations per manager (grouped by
  event) into one `RegistrationDigestEmail`, using a per-manager
  `lastRegistrationDigestSentAt` watermark for exactly-once and deterministic
  daily/weekly anchors.

Registrants who unsubscribe do so via the logged-out, token-gated page at
`src/app/(frontend)/registrations/unsubscribe/` (signed token in
`src/lib/registrations/unsubscribeToken.ts`, over the shared `jose` helper in
`src/lib/utilities/signedToken.ts`).

| File | Purpose |
| --- | --- |
| `src/jobs/RegistrationNotifications/SendSessionReminders.ts` | Reminder task |
| `src/jobs/RegistrationNotifications/SendRegistrationDigests.ts` | Digest task |
| `src/jobs/RegistrationNotifications/SendPostEventFollowUps.ts` | Post-event follow-up task |
| `src/fields/logField.ts` | The shared `activityLog` field + its dedup/append helpers |
| `tests/int/session-reminders.int.spec.ts` / `registration-digests.int.spec.ts` | Integration tests |

### User-message screening + retention (`src/jobs/ScreenUserMessages/`, `src/jobs/PurgeUserMessages/`)

The `user-messages` intake (#632) is asynchronous: `POST /api/user-messages`
persists and returns, and two tasks do the rest.

- **`screenUserMessage`** — per-message, queued by the collection's `afterChange`
  hook onto the **`screening`** queue (shared with event submissions; 15-minute
  autoRun is the safety net for a kick lost to a crash). Runs the checks the
  request path can't afford — an MX lookup on the sender's address (fail-open), a
  disposable-list re-check, how many messages that person sent in the last 24h,
  and whether the identical body arrived before — then either files the message
  as `spam` or emails it out and marks it `delivered`.

  A failed send marks the row **`failed` before rethrowing**. The job runner
  gives each task an isolated `transactionID`, so that write commits even though
  the throw follows, which is what makes an undelivered message visible to an
  admin immediately while the throw still earns a retry.

- **`purgeUserMessages`** — daily 04:00 UTC on the `nightly` queue. Deletes
  delivered messages after 7 days and spam after 90; `failed` is never swept.
  The 7-day floor is load-bearing: shorten it below the 24-hour screening windows
  and the repeat-sender and duplicate-body checks would have no history left to
  count against, and would silently pass everything.

| File | Purpose |
| --- | --- |
| `src/jobs/ScreenUserMessages/ScreenUserMessages.ts` | Screening + delivery |
| `src/jobs/ScreenUserMessages/senderHistory.ts` | The two window counts + their thresholds |
| `src/jobs/ScreenUserMessages/emailChecks.ts` | `hasMxRecords` — a deliberate copy of the event-submission one; see the file |
| `src/jobs/PurgeUserMessages/PurgeUserMessages.ts` | Retention sweep |
| `tests/int/user-message-screening.int.spec.ts` / `user-message-retention.int.spec.ts` | Integration tests |

### Usage tracking (`src/plugins/usage/tasks.ts`)

The usage plugin auto-registers two tasks:

- **`trackUsage`** — increments `dailyRequests`, updates `lastRequestAt`,
  triggers high-usage alerts. Queued asynchronously via `afterRead` hook.
  Uses atomic Postgres `UPDATE` via the Drizzle pool.
- **`resetUsage`** — runs daily at midnight UTC. Updates
  `peakDailyRequests` if current is higher, then resets `dailyRequests`
  to 0.

Uses a single atomic **Postgres path** in development and production (Railway Postgres 18).

Configuration and rate-limiting details are in
`docs/rules/api-clients.md` (auto-loads when editing `src/plugins/usage/`
or `src/collections/Clients/Clients.ts`).

## Key Configuration Files

- `src/payload.config.ts` — main Payload CMS configuration (Postgres adapter, `prodMigrations` for in-process migration on boot)
- `next.config.mjs` — Next.js configuration (wrapped with `withSentryConfig`)
- `src/payload-types.ts` — auto-generated types (do not edit)
- `tsconfig.json` — TypeScript path aliases
- `eslint.config.mjs` — ESLint configuration
- `vitest.config.mts` — Vitest (integration test) configuration
- `playwright.config.ts` — Playwright (E2E) configuration
- `railway.toml` — Railway deployment configuration (Railpack builder)
- `src/lib/richEditor/index.ts` — Lexical editor presets
