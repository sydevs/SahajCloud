# Architecture Overview

Top-level architecture for sy-devs-cms. Subsystem details (storage,
RBAC, OpenAPI, individual collection schemas, admin components, etc.)
live in the matching path-scoped rules under `.claude/rules/`.

## Storage

Three Cloudflare-native services in production, with automatic
local-file fallback in development.

| Storage | Collections | URL format |
|---|---|---|
| **Cloudflare Images** | `images` (also referenced from albums, app-cards, meditations, lectures, authors, lessons, page blocks) | `https://imagedelivery.net/<hash>/<imageId>/public` |
| **Cloudflare Stream** | `videos`, `frames` (video MIME types) | thumbnails: `https://customer-<code>.cloudflarestream.com/<videoId>/thumbnails/thumbnail.jpg`<br>MP4: `.../downloads/default.mp4` (`mp4Url`)<br>HLS: `.../manifest/video.m3u8` (`hlsUrl`) |
| **R2 native binding** | `meditations`, `songs`, `lessons`, `files`, `user-choices`, `song-tags`, plus mixed-media fallthrough on `frames` and `files` | `<CLOUDFLARE_R2_DELIVERY_URL>/<collection>/<filename>` |

### Canonical URL field names (#319)

`videos`, `frames`, and `files` expose the canonical `hlsUrl` (HLS manifest) and `mp4Url` (MP4 download) virtual fields. The legacy `streamUrl` and — on Videos only — `url` (MP4 download) are kept as deprecated aliases until the mobile app cuts over. On `frames` and `files` the generic `url` field is *not* deprecated: it remains the mixed-media file URL (image / R2 / MP4 by MIME); read `mp4Url` when you specifically need the MP4. Lecture player-data responses (`/api/lectures/for-audience`, `/api/meditations/:id/related-lectures`) likewise expose both `hlsUrl` (canonical) and `videoUrl` (deprecated alias) holding the same HLS URL.

Adapter routing, the R2 filename preassignment hook, the
Cloudflare Stream webhook, and Zod-validated Cloudflare API responses
are all documented in `.claude/rules/storage.md` (auto-loads when
editing `src/lib/storage/`).

## Route Structure

- `src/app/(frontend)/` — public-facing Next.js pages
- `src/app/(payload)/` — Payload CMS admin interface and API routes
- `src/app/(payload)/api/` — Payload-generated API endpoints

## Custom Endpoints

Two places to add HTTP endpoints, chosen by scope:

| Use case | Where |
|---|---|
| URL belongs under a collection (e.g. `/api/frames/by-narrator/:narratorId`); single-collection ops; want automatic Payload auth/access integration | `src/endpoints/*.ts` — see `.claude/rules/endpoints.md` |
| Webhooks, health checks, OpenAPI spec generation, seed triggers, multi-collection operations; need raw request body or Next.js features (streaming, redirects) | `src/app/(payload)/api/**/route.ts` — see `.claude/rules/routes.md` |

| Custom Payload endpoints | Path | Purpose |
|---|---|---|
| `framesByNarrator` | `/api/frames/by-narrator/:narratorId` | frames filtered by narrator gender |
| `audiencesForUser` | `/api/audiences/for-user` | resolves the eligible audience IDs for a user from their progress data (`pathProgress`, `meditationsPerWeek`, `totalMeditationsViewed`, `totalLecturesViewed` — required integers) plus optional context (`country` ISO alpha-2, `timezone` IANA name). Progress audiences matched via SQL WHERE; condition audiences matched via JS filter (country gate, schedule gate, daytime gate — require `timezone` when schedule/eventTime is set). Returns combined deduplicated sorted IDs. Mobile clients call once per state change and pass the result as `audiences` to the data endpoints below. `Cache-Control: public, max-age=300, s-maxage=300`. |
| `lecturesForAudience` | `/api/lectures/for-audience` | uniform-random lecture feed filtered to lectures whose `audiences` overlap the supplied `audiences` ID list (OR semantics). `Cache-Control: public, max-age=600, s-maxage=600`. |
| `appCardsForAudience` | `/api/app-cards/for-audience` | published app cards for a `targetSection`, filtered to cards whose `audiences` overlap the supplied `audiences` list (OR semantics) and weighted-random sampled. `Cache-Control: public, max-age=600, s-maxage=600`. |
| `meditationLectures` | `/api/meditations/:id/related-lectures` | lectures ranked by topical overlap between the meditation's frames and each lecture's own `subtleSystemNodes` (zero-overlap lectures dropped). Optional `userChoice` query expands candidates to lectures that either carry that user-choice tag **or** have positive subtle-system-node overlap (OR semantics). userChoice-tagged lectures are returned as a group first (weight DESC, including zero-overlap ones), followed by non-userChoice lectures with positive overlap (also weight DESC). Node IDs are resolved via a single bounded lookup (max 12 rows). Audience filtering uses the same `audiences` ID list contract as the other data endpoints. `Cache-Control: public, max-age=600, s-maxage=600`. |

| Next.js app-router routes | Path | Purpose |
|---|---|---|
| `health/route.ts` | `/api/health` | liveness check |
| `openapi.json/route.ts` | `/api/openapi.json` | filtered OpenAPI spec |
| `seed/[script]/route.ts` | `/api/seed/:script` | seed trigger with SSE |
| `webhooks/cloudflare-stream/route.ts` | `/api/webhooks/cloudflare-stream` | Cloudflare Stream webhook handler |

## OpenAPI / Scalar API Docs

REST API documentation built on `payload-oapi` + a custom Scalar plugin
with We Meditate branding. Endpoints, project filtering, custom-endpoint
shim, and the known-limitations list are in `.claude/rules/openapi.md`
(auto-loads when editing `src/lib/openapi/` or the OpenAPI route handlers).

## Collections

### Access & user management
- **Managers** (`src/collections/access/Managers.ts`) — auth-enabled admin users with email/password, admin toggle, granular collection/locale-based permissions.
- **Clients** (`src/collections/access/Clients.ts`) — API client management with API keys, usage tracking, granular permissions, high-usage alerts.

### Content
- **Pages** — Lexical rich text with embedded blocks; drafts (60 s autosave), version history, scheduled publishing, per-locale publishing.
- **Meditations** — guided audio with `type` select (quick / daily / lesson), `timings` multi-select, `duration` (auto-extracted via `music-metadata`), frame relationships with timestamps, locale-specific filtering, drafts. A denormalized `subtleSystemNodeWeights` JSON field (`{ slug → on-screen seconds }`) caches per-meditation topical fingerprints; recomputed by an `afterChange` hook when `frames`/`duration` change, and cascaded by Frames' `afterChange` when a frame's `subtleSystemNode` is repointed. Drives the topical-overlap ranking in `/api/meditations/:id/related-lectures`.
- **Albums** — music album groupings with `artwork` relationship to Images and a join field for related songs.
- **Songs** — background music tracks with audio upload, required album relationship, hidden from sidebar (managed via Albums).
- **Lessons** ("Path Steps") — audio + panels array, unit selection (1–4), step number, optional meditation relationship, localized rich text article.
- **Videos** — Cloudflare Stream uploads with HLS streaming, virtual `url` (MP4) and `previewUrl` (thumbnail) fields.
- **AppCards** — mobile cards with `image` relationship, type (app-page / content / external), countdown checkbox, `audiences` hasMany (OR semantics — shown if any overlap), `conditions` hasMany (AND semantics — all condition audience IDs must be in the caller's resolved list), weight (1–5).

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
- **Audiences** — reusable visibility/targeting rules referenced by AppCards and Lectures. `type` discriminator: `progress` (SQL WHERE on native range fields — `pathProgress`, `meditationsPerWeek`, `totalMeditationsViewed`, `totalLecturesViewed`) or `condition` (JS filter on `country` hasMany select, `eventTime` time-of-day gate, `schedule` recurrence gate). Three bidirectional joins: `lectures`, `appCards` (progress audiences), `appCardConditions` (condition audiences). Rule eval lives on `/api/audiences/for-user`; data endpoints take pre-resolved IDs. `isEventInUserDaytime` and `isScheduleActiveNow` helpers in `src/lib/audiences/`.

Page, Video, and Image tags are inline enum select fields on their
respective collections (not separate tag collections).

Detailed field descriptions, hooks, validators, and per-collection test
coverage live in `.claude/rules/collections.md` (auto-loads when editing
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
`.claude/rules/admin-ui.md` (auto-loads when editing
`src/components/admin/`, `src/components/branding/`, or `src/globals/`).

## Logging & Error Tracking

Server-side logging uses a **custom console-backed Payload logger**
(`src/lib/workerSafeLogger.ts`); error tracking uses **Sentry** via
`@sentry/cloudflare`.

### Why not Payload's default logger?

Payload's default Pino logger uses transports that ultimately write
through Node-style `fs` destinations. In Cloudflare Workers, those write
paths can fail under Node-compat shims, so this project routes through
`console` directly instead. The custom logger:

- Implements the subset of the Pino interface that Payload uses here.
- Respects `NEXT_PUBLIC_LOG_LEVEL` (`silent` | `error` | `warn` | `info` | `debug`).
- Supports `child()` bindings (preserves contextual fields).
- Normalizes `Error` objects into plain serializable objects.

The same logger runs in local dev, CLI usage, and Workers — consistent
behavior across environments.

### Logging patterns

```typescript
// Server-side (hooks, collections, adapters with req)
req.payload.logger.info({ msg: 'Operation completed', documentId: doc.id })
req.payload.logger.warn({ msg: 'Warning message', context: 'details' })
req.payload.logger.error({ msg: 'Error occurred', error: error.message })

// Adapters with payload directly
payload.logger.info({ msg: 'Adapter initialized' })
```

```typescript
// Client-side (React)
import { clientLogger } from '@/lib/clientLogger'
clientLogger.error('Failed to load data', error, { componentId: '123' })
clientLogger.warn('Unexpected state', { details: 'info' })
```

```typescript
// Routes without Payload access — use sparingly
// eslint-disable-next-line no-console
console.error('[Route Name] Error message:', { error: error.message })
```

### Sentry integration

- `src/lib/sentryPlugin.ts` — Cloudflare Workers-compatible Sentry plugin (`@sentry/cloudflare`).
- `src/instrumentation-client.ts` — browser-side Sentry via `@sentry/react` (Next.js instrumentation hook).
- `src/app/global-error.tsx` — React error boundary with Sentry reporting.

The official `@payloadcms/plugin-sentry` is **not** used because it
depends on `@sentry/nextjs`, which is incompatible with Cloudflare Workers.

## Scheduled Jobs

PayloadCMS's built-in jobs system handles background task processing.

### `CleanupOrphanedMedia` (`src/jobs/tasks/CleanupOrphanedMedia.ts`)

Monthly task that cleans up orphaned files and images. Two-phase:

1. **Permanent deletion** — purges items already in trash (`deletedAt` set) past the grace period (30+ days).
2. **Orphan detection** — identifies unreferenced media and moves them to trash.

Uses **schema introspection** (`src/lib/schemaUtils.ts`) to auto-discover
all `files` / `images` references across collections instead of
hardcoding the list. Scans Lexical rich-text content for embedded block
references. Tag-based preservation: images with non-orientation tags
(e.g. "featured") are kept.

| File | Purpose |
|---|---|
| `src/jobs/tasks/CleanupOrphanedMedia.ts` | Implementation |
| `src/lib/schemaUtils.ts` | Schema introspection utilities |
| `tests/int/cleanup-orphaned-media.int.spec.ts` | Integration tests |
| `tests/int/schema-utils.int.spec.ts` | Schema-utils tests |

### Usage tracking (`src/lib/usage/tasks.ts`)

The usage plugin auto-registers two tasks:

- **`trackUsage`** — increments `dailyRequests`, updates `lastRequestAt`,
  triggers high-usage alerts. Queued asynchronously via `afterRead` hook.
- **`resetUsage`** — runs daily at midnight UTC. Updates
  `peakDailyRequests` if current is higher, then resets `dailyRequests`
  to 0.

Configuration and rate-limiting details are in
`.claude/rules/api-clients.md` (auto-loads when editing `src/lib/usage/`
or `src/collections/access/Clients.ts`).

## Key Configuration Files

- `src/payload.config.ts` — main Payload CMS configuration
- `next.config.mjs` — Next.js configuration
- `src/payload-types.ts` — auto-generated types (do not edit)
- `tsconfig.json` — TypeScript path aliases
- `eslint.config.mjs` — ESLint configuration
- `vitest.config.mts` — Vitest (integration test) configuration
- `playwright.config.ts` — Playwright (E2E) configuration
- `wrangler.toml` — Cloudflare Workers + bindings (D1, R2, Rate Limiter)
- `src/lib/richEditor.ts` — Lexical editor presets
