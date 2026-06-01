# Test Coverage

Source-of-truth map of custom behavior to the integration test that covers it.

This file complements `.claude/rules/tests.md` (which describes _how_ to test) by recording what _is_ tested today. Update it when a hook, access function, virtual field, endpoint, or scheduled task is added, renamed, or removed.

Per `.claude/rules/tests.md`, only **custom logic** belongs in the integration lane (hooks, access control, virtual fields, custom validators, scheduled jobs, custom endpoints, locale-specific behavior, storage utilities, business-critical workflows). Built-in CRUD, slug generation, localization fallback, email/auth, file-upload mechanics, and `minRows`/`maxRows` validation are PayloadCMS concerns and are not tracked here. `collections-smoke.int.spec.ts` is the single reachability canary per content collection.

## Collections

| Slug                  | Custom logic                                                                                                                                              | Covered by                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `clients`             | `validateClientData` beforeChange, query-validation beforeOperation (security gate), usage stats lifecycle, document-level access                         | `client-hooks`, `client-query-validation`, `role-based-access` |
| `managers`            | `bypassPermissions`, locale-role inheritance, project-scoped visibility                                                                                   | `role-based-access`, `project-visibility`, `client-hooks`      |
| `albums`              | Cascade delete (album → songs); soft-delete does NOT cascade                                                                                              | `albums`                                                       |
| `app-cards`           | Audience targeting / OR-match / AND-gate / cache headers (in the endpoint)                                                                                | `app-cards-for-audience`, `collections-smoke` (reachability)   |
| `lessons`             | Lexical relationship cleanup (strip stale collection refs), locale-specific meditation assignments, subtitle JSON                                         | `lessons`                                                      |
| `meditations`         | `filterMeditationsByLocale` beforeOperation, `extractAudioDuration` beforeChange, `randomSongUrl` virtual, `durationMinutes` virtual, weight invalidation | `meditations`, `meditation-duration`, `meditation-lectures`    |
| `pages`               | `webUrl` virtual, Lexical block relationship depth, stale-content stripping                                                                               | `pages`                                                        |
| `songs`               | `autoSetIncludeForMeditationsOnCreate` beforeChange                                                                                                       | `meditations` (via `includeForMeditations` behavior)           |
| `videos`              | `previewUrl` virtual, `validateSubtitles` validator                                                                                                       | `videos`                                                       |
| `authors`             | Reachability only                                                                                                                                         | `collections-smoke`                                            |
| `images`              | `detectOrientationHook` beforeChange (auto-tags landscape/portrait/square)                                                                                | `image-orientation`                                            |
| `lectures`            | `populateFromNirmalaVidya` beforeChange, clip ↔ parent linking, subtitle language normalization, custom validators (stopTime > startTime)                 | `lectures`, `sync-lecture-metadata`, `meditation-lectures`     |
| `narrators`           | Reachability only                                                                                                                                         | `collections-smoke`                                            |
| `files`               | Reachability only                                                                                                                                         | `collections-smoke`                                            |
| `frames`              | `cascadeFrameNodeChange` afterChange; meditation-frame validation / rounding / sorting / enrichment hooks                                                 | `meditationFrames`                                             |
| `audiences`           | Range validator (max > min), reverse joins, audience-resolution helpers                                                                                   | `audiences`, `audiencesResolve`, `audiences-for-user`          |
| `song-tags`           | Reachability only                                                                                                                                         | `collections-smoke`                                            |
| `subtle-system-nodes` | Reachability only                                                                                                                                         | `collections-smoke`                                            |
| `user-choices`        | Parent-child nesting hooks, `isParent` maintenance, localized timing-based meditation joins                                                               | `user-choices`, `user-choices-by-timing`                       |

## Globals

| Global                        | Custom logic                                                | Covered by                                   |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| `wemeditate-app/config`       | Localized `vibeCheckTracks` array, virtual readiness fields | `wm-app-config`, `wemeditateAppStatus`       |
| `wemeditate-app/translations` | `buildTranslationTabs` factory, JSON validator              | `translations-field`, `translations-globals` |
| `wemeditate-web/*`            | Translation pattern (covered transitively)                  | `translations-globals`                       |
| `sahaj-atlas/*`               | Translation pattern (covered transitively)                  | `translations-globals`                       |

## Custom endpoints

| Path                                  | Subject                                                                                    | Covered by               |
| ------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| `/api/app-cards/for-audience`         | Audience OR-match, AND-gate semantics, cache headers, usage-tracking integration           | `app-cards-for-audience` |
| `/api/audiences/for-user`             | Progress-rule matching, country/location gating, condition audiences, range semantics      | `audiences-for-user`     |
| `/api/frames/by-narrator/:narratorId` | Param validation, narrator lookup (404), gender-based filtering, mimeType sort             | **gap — see below**      |
| `/api/lectures/for-audience`          | Priority sampling, audience filter, subtitle/thumbnail fallback, clip metadata inheritance | `lectures-for-audience`  |
| `/api/meditations/lectures`           | Weight-based ranking, audience validation, frame cascade, auth gate                        | `meditation-lectures`    |

## Scheduled jobs

| Task                             | Subject                                                                   | Covered by                                                              |
| -------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `CleanupOrphanedMedia`           | Reference tracing across collections, grace period, 3-month date rotation | `cleanup-orphaned-media`                                                |
| `SyncLectureMetadata`            | Batch sync, NV API error isolation, filtering                             | `sync-lecture-metadata`                                                 |
| `resetUsage` (cron)              | Usage-counter reset, `peakDailyRequests` preservation                     | `api`                                                                   |
| `recomputeMeditationNodeWeights` | Weight recomputation on meditation change                                 | `meditation-lectures` + unit: `compute-meditation-node-weights.spec.ts` |

## Cross-cutting subjects (helpers / utilities / RBAC)

| Subject                                                                                                        | Covered by                  |
| -------------------------------------------------------------------------------------------------------------- | --------------------------- |
| URL field factories (`virtualUrlField`, `previewUrlField`, `mixedMediaUrlField`, `hlsUrlField`, `mp4UrlField`) | `storage-utils`             |
| R2 filename sanitization (`generateR2Key`, `generateCloudflareImageId`); R2 preassign hook                     | `storage-utils`             |
| Cloudflare Stream webhook signature verification + MP4-download handler                                        | `cloudflare-stream-webhook` |
| Schema introspection (`discoverReferencesForCollection`, `extractIdsFromLexicalContent`)                       | `schema-utils`              |
| Content-Index block API endpoint generation (`computeApiEndpoint` virtual)                                     | `content-index-block`       |
| Project-based admin visibility (`createHidden` from accessPlugin)                                              | `project-visibility`        |
| RBAC (`hasPermission`, `hasAnyPermission`, `customResourceAccess`, locale roles, translator scopes)            | `role-based-access`         |
| Seed importer phase (`importLectures` upsert, NV API error isolation, idempotency)                             | `seeds-lectures`            |

## Gaps

- **`/api/frames/by-narrator/:narratorId`** — no integration test. The endpoint validates params (zod), looks up the narrator (404 on missing), filters frames by `imageSet === narrator.gender`, and sorts by mimeType. Small surface; one new `tests/int/frames-by-narrator.int.spec.ts` would close it. **Recommended**: follow-up ticket.

- **`access-performance.int.spec.ts`** — see P4 of #434; handled in a separate commit.

## Borderline keeps (documented intentionally)

- **`seeds-lectures.int.spec.ts`** — covers the WeMeditate seed importer (`importLectures` upsert, NV API error isolation, re-run idempotency). Not a collection hook, but real custom code with real bugs to catch. Kept rather than moved to a new lane (which would expand scope and provide no win, since CI still wants to run it).

## Smoke specs (`tests/e2e/`) and dedup analysis

Tier 3 smoke specs run against a Cloudflare PR preview environment with cloned production data. They cover REST API + auth + deployment as one cohesive flow.

| Spec                      | REST paths exercised                                          |
| ------------------------- | ------------------------------------------------------------- |
| `auth.e2e.spec.ts`        | `POST /api/managers/login`, `GET /api/managers/me`            |
| `meditations.e2e.spec.ts` | `POST/PATCH/DELETE /api/meditations`, plus `GET` of resources |
| `songs.e2e.spec.ts`       | `POST/PATCH/DELETE /api/songs`                                |
| `lectures.e2e.spec.ts`    | `POST/PATCH/DELETE /api/lectures` (clip variant)              |

**Dedup pass (P5 of #434).** Searched `tests/int/` for files hitting the same REST paths. Three matches: `content-index-block` (builds `/api/meditations` URLs via `computeApiEndpoint` virtual), `meditation-lectures` (hits the custom `/api/meditations/lectures` endpoint, not `/api/meditations`), and `storage-utils` (URL field factory references `/api/songs/...`). None duplicates smoke's CRUD coverage — each exercises a hook, virtual field, or custom endpoint. No integration test was removed by P5.

## Removed by the #434 audit

These files were dropped because they only covered Payload-CMS built-ins; reachability is already covered by `collections-smoke.int.spec.ts`.

- `api-explorer.int.spec.ts` — built-in OpenAPI plugin / Scalar UI.
- `app-cards.int.spec.ts` — schema-only CRUD across `app-cards` fields.
- `frameFiltering.int.spec.ts` — built-in where-clause filtering and depth populate.
- `subtle-system-nodes.int.spec.ts` — built-in unique-slug + reverse-join exposure.
- `tableOfContents.int.spec.ts` — Lexical block round-trip storage.
