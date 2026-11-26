# Architecture Overview

The whole-app view of SahajCloud, read on demand. Each subsystem's detail lives beside its code and loads when you work there:

| Subsystem                                        | Guide                                                  |
| ------------------------------------------------ | ------------------------------------------------------ |
| Storage adapters, the Stream webhook             | `docs/rules/storage.md`                                |
| Custom endpoints, and the list of them           | `docs/rules/endpoints.md`, `docs/rules/routes.md`      |
| Atlas SEO, sitemap and Wix contracts             | `src/endpoints/atlas/AGENTS.md`                        |
| Atlas event feed and registration gate           | `src/collections/Events/AGENTS.md`                     |
| OpenAPI / Scalar docs                            | `docs/rules/openapi.md`                                |
| Collection fields, hooks, validators             | `src/collections/AGENTS.md`                            |
| Admin components, and admin settings on a config | `docs/rules/admin-ui.md`, `docs/rules/admin-config.md` |
| Admin navigation and the dashboards              | `docs/rules/admin-navigation.md`                       |
| Logging and Sentry                               | `src/plugins/sentry/AGENTS.md`                         |
| Scheduled jobs                                   | `src/jobs/AGENTS.md`                                   |
| The preview fixture every preview loads at boot  | `src/fixture/AGENTS.md`                                |

## Storage

Cloudflare Images and Stream handle media processing and CDN. R2 (S3 API) handles object storage, with an automatic local-file fallback in development.

| Storage               | Collections                                                                                                               | URL format                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Cloudflare Images** | `images` (also referenced from albums, app-cards, meditations, lectures, authors, lessons, page blocks)                   | `https://imagedelivery.net/<hash>/<imageId>/public`                                                                            |
| **Cloudflare Stream** | `videos`, `frames` (video MIME types)                                                                                     | thumbnail `.../thumbnails/thumbnail.jpg`, MP4 `.../downloads/default.mp4` (`mp4Url`), HLS `.../manifest/video.m3u8` (`hlsUrl`) |
| **R2 (S3 API)**       | `meditations`, `songs`, `lessons`, `files`, `user-choices`, `song-tags`, plus mixed-media fallthrough on `frames`/`files` | `<CLOUDFLARE_R2_DELIVERY_URL>/<collection>/<filename>`                                                                         |

On `frames` and `files`, `url` is the mixed-media file URL (image / R2 / MP4, by MIME). Read `mp4Url` when you need the MP4 specifically.

Adapter routing, the R2 filename hook, the Stream webhook, and Cloudflare response validation are documented in `docs/rules/storage.md` (auto-loads for `src/plugins/storage/`).

## Collections

- **Managers** / **Clients** — admin users (email/password, granular permissions) and API clients (keys, usage tracking, alerts).
- **Pages** — Lexical rich text with embedded blocks, drafts, version history, scheduled and per-locale publishing.
- **Meditations** — guided audio with `type`, `timings`, auto-extracted `duration`, timestamped frame relationships, and a denormalized `subtleSystemNodeWeights` field that drives the ranking in `/api/meditations/:id/related-lectures`.
- **Transcripts** — one row per source, holding that recording's timed cues, in the same cue shape `subtitles` uses (`src/lib/utilities/subtitles.ts`), closed rather than open. `source` is a polymorphic relationship to `meditations` or `files`, `required` and `unique`, so a row names exactly one recording and a recording carries at most one row — read it as `{ source: { equals: { relationTo, value } } }` and never as a bare path. A row's lifetime is its source's, through `deleteChildren` on both parents, so the collection declares no retention. Hidden from the sidebar, and read by whoever reads the recording: the clause that used to narrow a client's read to a published meditation cannot be written against a polymorphic parent, and the exposure was accepted rather than replaced (#1043, #1075). A `beforeChange` hook rewrites every phrase through `glossary.json`, the one word list that decides Sahaja Yoga spellings — each entry naming the base languages it holds for (`en` covers `en-AU`), since a Latin spelling is wrong for the six languages written in another script. The same list is sent ahead of transcription as the vendor's `prompt` (`glossaryPrompt`), so the spelling is asked for as well as corrected (#1084).
- **Albums** / **Songs**, **Lessons** ("Path Steps") — music groupings with artwork, and audio + panel Path Steps with an optional meditation link. A song carries the same auto-extracted `duration` a meditation does, uncapped (`src/lib/audio/duration.ts`). A step's `title`, `panels`, `article`, `meditation` and intro recording are per locale (#977, #1016). Its subtitles are stored nowhere on the step: they are the transcript of the file it uses — the intro recording's, and each panel video's — read through the file's virtual `subtitles`. The step's own `introSubtitles` is a read-only copy of that for app releases that read it, and goes once none does.
- **Videos** — Cloudflare Stream uploads, HLS. `mp4Url` 404s until the Stream webhook enables it.
- **AppCards** — mobile cards with `type` (`standard`/`event`), three view tabs, `audiences` (OR), `conditions` (AND), and a `weight`.
- **Images**, **Narrators**, **Authors** — media and profile collections.
- **Lectures** — full-talk content via the Nirmala Vidya API, no drafts. `subtleSystemNodes` drives the related-lectures ranking. Optional `userChoices` drives that endpoint's user-choice gate. `date` — when the talk was given — is read out of the API's own title, which is the only place it states one, so nobody may type it (#1236).
- **Frames** / **Files** — mixed-media uploads and storage, routed by MIME type, with trash and automatic orphan cleanup.
- **UserChoices**, **SubtleSystemNodes** (12 chakras/nadis), **SongTags** — the tag collections referenced by Lectures and Frames.
- **Audiences** — reusable targeting rules for AppCards and Lectures: progress ranges plus a country gate, evaluated on `/api/audiences/for-user`.
- **Forms** / **Form Submissions** — auto-generated by the Form Builder plugin.

Page, Video, and Image tags are inline enum fields, not separate collections. Field, hook, and validator detail lives in `src/collections/AGENTS.md` (auto-loads for `src/collections/` or `src/fields/`).

## What an error body discloses (#684)

`config.debug` (`!isProduction`) controls the response body, not logging: with it on, `routeError` attaches `response.stack` and the real error message. It was `true` everywhere until #684, so production once returned a database error's full statement and bound parameters. Server logs and Sentry are unaffected either way.

It checks `NODE_ENV`, deliberately, so a Railway preview (which also runs `NODE_ENV=production`) redacts too. Debug a red preview from Railway's logs, not the response body. The 400 for a cast error (`src/plugins/sentry/AGENTS.md`) is the one path still returning Postgres text, and only because `routeError` redacts before `afterError` hooks run (`tests/int/error-disclosure.int.spec.ts` pins the order).

## Slow-query logging (dev only)

`DB_QUERY_LOGGING=true` turns on Drizzle's query logger. It is force-disabled in production. Railway (including previews) always runs `NODE_ENV=production`, so this only ever fires in local dev. **It logs bound params — emails, tokens, keys — so never enable it against real or cloned production data**. For staging/prod timings, set Railway Postgres `log_min_duration_statement` instead.

## Database connection pool & depth caps

`src/payload.config.ts` configures the pool and query depth.

- **Pool** — `pool.max` (`DATABASE_POOL_MAX`, default `20`). Measured 2026-07: `max_connections` is 100 (97 usable), with 1 production replica. Peak load is `pool.max × replicas`, plus deploy overlap (the new container runs migrations while the old one drains), plus ~5-10 Postgres internals. That is about 50 at `max=20`, comfortable under 97. **Before adding a 2nd replica**, drop `max` to ~30-35 or raise `max_connections`: steady load alone would then reach 40, and overlap can approach 80.
- **Depth caps** — `defaultDepth: 2`, `maxDepth: 3` (Payload's default is 10). `maxDepth` clamps any caller-requested `depth`, and is surfaced as the OpenAPI `depth` parameter's `maximum`.

## `next.config.ts`

TypeScript, so it reads the preview address shape and the deployment name from `src/` rather than restating them: Next transpiles the config with swc, which resolves its imports and tsconfig paths.
