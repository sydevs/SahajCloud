# Test Coverage

Source-of-truth map of custom behavior to the integration test that covers it.

This file complements `.claude/rules/tests.md` (which describes _how_ to test) and `tests/PERF.md` (the integration-lane runtime baseline) by recording what _is_ tested today. Update it when a hook, access function, virtual field, endpoint, or scheduled task is added, renamed, or removed.

Per `.claude/rules/tests.md`, only **custom logic** belongs in the integration lane (hooks, access control, virtual fields, custom validators, scheduled jobs, custom endpoints, locale-specific behavior, storage utilities, business-critical workflows). Built-in CRUD, slug generation, localization fallback, email/auth, file-upload mechanics, and `minRows`/`maxRows` validation are PayloadCMS concerns and are not tracked here. `collections-smoke.int.spec.ts` is the single reachability canary per content collection.

## Collections

| Slug                  | Custom logic                                                                                                                              | Covered by                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `clients`             | `validateClientData` beforeChange, query-validation beforeOperation (security gate), usage stats lifecycle, document-level access         | `client-hooks`, `client-query-validation`, `role-based-access` |
| `managers`            | `bypassPermissions`, locale-role inheritance, project-scoped visibility                                                                   | `role-based-access`, `project-visibility`, `client-hooks`      |
| `albums`              | Cascade delete (album → songs); soft-delete does NOT cascade                                                                              | `albums`                                                       |
| `app-cards`           | Audience targeting / OR-match / AND-gate / cache headers (in the endpoint)                                                                | `app-cards-for-audience`, `collections-smoke` (reachability)   |
| `events`              | `website` non-localization + URL validator wiring; verification lifecycle, registration flow, GeoJSON endpoint, expiry state machine; `excludeFinishedEvents` beforeOperation (client list default + `schedule.lastDate` opt-out, `findByID` unaffected), finished events off the geojson feed, `schedule.lastDate` backfill; `verifyOnSave` reviving a finished event when its schedule is extended; listing-quality report + stored `qualityOpenCount`, and the reminder email carrying its open recommendations (dedup unchanged) | `events`, `event-verification`, `event-registration`, `events-geojson`, `expire-events`, `event-quality`, `schedule-last-date-backfill` |
| `lessons`             | Lexical relationship cleanup (strip stale collection refs), locale-specific meditation assignments, subtitle JSON                         | `lessons`                                                      |
| `meditations`         | `filterMeditationsByLocale` beforeOperation, `extractAudioDuration` beforeChange, `durationMinutes` virtual, weight invalidation          | `meditations`, `meditation-duration`, `meditation-lectures`    |
| `pages`               | `webUrl` virtual, Lexical block relationship depth, stale-content stripping                                                               | `pages`                                                        |
| `songs`               | `autoSetIncludeForMeditationsOnCreate` beforeChange                                                                                       | `meditations` (via `includeForMeditations` behavior)           |
| `videos`              | `previewUrl` virtual, `validateSubtitles` validator                                                                                       | `videos`                                                       |
| `authors`             | Reachability only                                                                                                                         | `collections-smoke`                                            |
| `images`              | `detectOrientationHook` beforeChange (auto-tags landscape/portrait/square)                                                                | `image-orientation`                                            |
| `lectures`            | `populateFromNirmalaVidya` beforeChange, clip ↔ parent linking, subtitle language normalization, custom validators (stopTime > startTime) | `lectures`, `sync-lecture-metadata`, `meditation-lectures`     |
| `narrators`           | Reachability only                                                                                                                         | `collections-smoke`                                            |
| `files`               | Reachability only                                                                                                                         | `collections-smoke`                                            |
| `frames`              | `cascadeFrameNodeChange` afterChange; meditation-frame validation / rounding / sorting / enrichment hooks                                 | `meditationFrames`                                             |
| `audiences`           | Range validator (max > min), reverse joins, audience-resolution helpers                                                                   | `audiences`, `audiencesResolve`, `audiences-for-user`          |
| `song-tags`           | Reachability only                                                                                                                         | `collections-smoke`                                            |
| `subtle-system-nodes` | Reachability only                                                                                                                         | `collections-smoke`                                            |
| `user-choices`        | Parent-child nesting hooks, `isParent` maintenance, localized timing-based meditation joins                                               | `user-choices`, `user-choices-by-timing`                       |

## Globals

| Global                        | Custom logic                                                | Covered by                                   |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| `wemeditate-app/config`       | Localized `vibeCheckTracks` array, virtual readiness fields | `wm-app-config`, `wemeditateAppStatus`       |
| `wemeditate-app/translations` | `buildTranslationTabs` factory (incl. per-key `maxLength` threading + `plural` expansion), JSON validator | `translations-field`, `translations-globals` |
| `wemeditate-web/*`            | Translation pattern (covered transitively)                  | `translations-globals`                       |
| `sahaj-atlas/*`               | Translation pattern (covered transitively)                  | `translations-globals`                       |

## Custom endpoints

| Path                                  | Subject                                                                                                            | Covered by               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `/api/app-cards/for-audience`         | Audience OR-match, AND-gate semantics, cache headers, usage-tracking integration                                   | `app-cards-for-audience` |
| `/api/contact-admin` (root endpoint)  | Status matrix — 200 / 400 bounds / 403 auth / 403 origin (called by hand, no usage-plugin hook) / 403 `captcha_failed` / 500 unverifiable / 502 undelivered; captcha runs before any email work | `contact-admin` + unit: `send-contact-admin.spec.ts` (envelope + `Reply-To`, which the int lane's mailer can't see), `turnstile.spec.ts` (fail-closed), `email-templates.spec.ts` (context-row omission) |
| `/api/audiences/for-user`             | Progress-rule matching, country/location gating, condition audiences, range semantics                              | `audiences-for-user`     |
| `/api/frames/by-narrator/:narratorId` | Param validation, narrator lookup (404), gender-based filtering, mimeType sort, depth:1 subtleSystemNode hydration | `frames-by-narrator`     |
| `/api/lectures/for-audience`          | Priority sampling, audience filter, subtitle/thumbnail fallback, clip metadata inheritance                         | `lectures-for-audience`  |
| `/api/meditations/lectures`           | Weight-based ranking, audience validation, frame cascade, auth gate, audience-feed fallback (`source`/`relevanceCount`) | `meditation-lectures`    |

## Scheduled jobs

| Task                             | Subject                                                                   | Covered by                                                              |
| -------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `CleanupOrphanedMedia`           | Reference tracing across collections, grace period, 3-month date rotation | `cleanup-orphaned-media`                                                |
| `ExpireEvents`                   | Finished-check + reminder ladder; publish side effects (finishing leaves `_status: 'published'`, only `urgent → expired` unpublishes, `expired` trashes); per-event failure isolation | `expire-events` + unit: `expire-events-stage-machine.spec.ts`, `schedule-status.spec.ts` |
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
| Seed importer existence cache is trash-aware (a trashed row must not be duplicated on re-seed)                 | `seed-importer-preload`     |
| Finished-event definition — `shouldFinish` (in-memory) pinned to agree with `notFinishedWhere` (SQL)           | unit: `schedule-status.spec.ts` |
| Content-Index block API endpoint generation (`computeApiEndpoint` virtual)                                     | `content-index-block`       |
| Project-based admin visibility (`createHidden` from accessPlugin)                                              | `project-visibility`        |
| RBAC (`hasPermission`, `hasAnyPermission`, document-level manager access, locale roles, translator scopes)     | `role-based-access`         |

## Gaps

None known. The previous gap on `/api/frames/by-narrator/:narratorId` was closed by `tests/int/frames-by-narrator.int.spec.ts` (param validation, 404, gender filter, mimeType sort, subtleSystemNode depth-1 hydration). The previous gap on `access-performance.int.spec.ts` was resolved by removal (see P4 of #434).

## Smoke specs (`tests/e2e/`) and dedup analysis

Tier 3 smoke specs run against the per-PR Railway preview environment with cloned production data. They cover REST API + auth + deployment as one cohesive flow.

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
- `access-performance.int.spec.ts` — mis-located (no `createTestEnvironment()`); flaky wall-clock thresholds; functional coverage in `role-based-access`.
- `seeds-lectures.int.spec.ts` — covered a seed importer, not a collection hook; out of scope for the integration lane.
