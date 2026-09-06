# Test Coverage

Source-of-truth map of custom behavior to the integration test that covers
it.

This file complements `tests/AGENTS.md` (how to test) and `tests/PERF.md`
(the integration-lane runtime baseline) by recording what _is_ tested
today. Update it when a hook, access function, virtual field, endpoint, or
scheduled task is added, renamed, or removed.

Per `tests/AGENTS.md`, only **custom logic** belongs in the integration
lane (hooks, access control, virtual fields, custom validators, scheduled
jobs, custom endpoints, locale-specific behavior, storage utilities,
business-critical workflows). Built-in CRUD, slug generation, localization
fallback, email/auth, file-upload mechanics, and `minRows`/`maxRows`
validation are PayloadCMS concerns and are not tracked here.
`collections-smoke.int.spec.ts` is the single reachability canary per
content collection.

## Collections

| Slug                  | Custom logic                                                                                                                              | Covered by                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `clients`             | `validateClientData` beforeChange, query-validation beforeOperation (security gate), usage stats lifecycle, document-level access. `validateCanonicalOwnership` (region + domain required when enabled, one enabled client per region, including a region *change*). `POST /api/clients/report` (both origin gates, query/fragment refusal, keyed merge, no-write on a repeat, and the mount cap). Also `embedMetadata` JSON-Schema validation, and the `legacyData` → `canonical.*` backfill | `client-hooks`, `client-query-validation`, `role-based-access`, `client-canonical` |
| `managers`            | `bypassPermissions`, locale-role inheritance, project-scoped visibility                                                                   | `role-based-access`, `project-visibility`, `client-hooks`      |
| `albums`              | Cascade delete (album → songs). Soft-delete does NOT cascade                                                                              | `albums`                                                       |
| `app-cards`           | Audience targeting / OR-match / AND-gate / cache headers (in the endpoint)                                                                | `app-cards-for-audience`, `collections-smoke` (reachability)   |
| `events`              | `website` non-localization + URL validator wiring. Verification lifecycle, registration flow (incl. the Turnstile gate), GeoJSON endpoint, expiry state machine. `excludeFinishedEvents` beforeOperation, finished events off the geojson feed, `schedule.lastDate` backfill. `verifyOnSave` reviving a finished event when its schedule extends. Listing-quality report + stored `qualityOpenCount`, and the reminder email carrying that progress | `events`, `event-verification`, `event-registration`, `events-geojson`, `expire-events`, `event-quality`, `schedule-last-date-backfill` |
| `lessons`             | Lexical relationship cleanup, locale-specific meditation assignments, subtitle JSON                                                       | `lessons`                                                      |
| `meditations`         | `filterMeditationsByLocale` beforeOperation, `extractAudioDuration` beforeChange, `durationMinutes` virtual, weight invalidation          | `meditations`, `meditation-duration`, `meditation-lectures`    |
| `pages`               | `webUrl` virtual, Lexical block relationship depth, stale-content stripping                                                               | `pages`                                                        |
| `songs`               | `autoSetIncludeForMeditationsOnCreate` beforeChange                                                                                       | `meditations` (via `includeForMeditations` behavior)           |
| `videos`              | `previewUrl` virtual, `validateSubtitles` validator                                                                                       | `videos`                                                       |
| `authors`             | Reachability only                                                                                                                         | `collections-smoke`                                            |
| `images`              | `detectOrientationHook` beforeChange (auto-tags landscape/portrait/square)                                                                | `image-orientation`                                            |
| `lectures`            | `populateFromNirmalaVidya` beforeChange, clip ↔ parent linking, subtitle language normalization, custom validators                        | `lectures`, `sync-lecture-metadata`, `meditation-lectures`     |
| `narrators`           | Reachability only                                                                                                                         | `collections-smoke`                                            |
| `files`               | Reachability only                                                                                                                         | `collections-smoke`                                            |
| `frames`              | `cascadeFrameNodeChange` afterChange. Meditation-frame validation / rounding / sorting / enrichment hooks                                 | `meditationFrames`                                             |
| `audiences`           | Range validator (max > min), reverse joins, audience-resolution helpers                                                                   | `audiences`, `audiencesResolve`, `audiences-for-user`          |
| `regions`             | Recursive child joins on `breadcrumbs.doc`, canonical `webPath`, and per-region `webUrl` ownership resolution. Also `breadcrumbs.url` path lookup (⚠ matches *any* trail element — see `atlas-seo`), subtree containment, and the non-empty-slug invariant | `regions`, `region-canonical-url`, `atlas-collections`, `atlas-seo`, unit: `region-non-empty-slug.spec.ts`, `atlas-region-owners.spec.ts` |
| `song-tags`           | Reachability only                                                                                                                         | `collections-smoke`                                            |
| `subtle-system-nodes` | Reachability only                                                                                                                         | `collections-smoke`                                            |
| `user-choices`        | Parent-child nesting hooks, `isParent` maintenance, localized timing-based meditation joins                                               | `user-choices`, `user-choices-by-timing`                       |

## Globals

| Global                        | Custom logic                                                | Covered by                                   |
| ------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `wemeditate-app/config`       | Localized `vibeCheckTracks` array, virtual readiness fields | `wm-app-config`, `wemeditateAppStatus`       |
| `wemeditate-app/translations` | `buildTranslationTabs` factory (incl. per-key `maxLength` threading + `plural` expansion), JSON validator | `translations-field`, `translations-globals` |
| `wemeditate-web/*`            | Translation pattern (covered transitively)                  | `translations-globals`                       |
| `sahaj-atlas/*`               | Translation pattern (covered transitively)                  | `translations-globals`                       |

## Custom endpoints

| Path                                  | Subject                                                                                                            | Covered by               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `/api/app-cards/for-audience`         | Audience OR-match, AND-gate semantics, cache headers, usage-tracking integration                                   | `app-cards-for-audience` |
| `/api/atlas/seo` (root endpoint)      | Route → region/event resolution. Canonical read from each document's own `webUrl` and each breadcrumb rung's own ancestor's. Descendant-inclusive class listing. 404 matrix. Locale-free canonical across locales. Ordered image list driving `og:image`. The operator-owned hreflang set changing live with `sy-atlas-config`. JSON-LD script-breakout safety end to end | `atlas-seo` + unit: `atlas-seo-route.spec.ts`, `atlas-seo-document.spec.ts`, `atlas-locales.spec.ts` |
| `POST /api/user-messages` (built-in)  | The public intake as a client: write-guard refusals carry their machine code. System fields stripped from a forged body. `client` stamped from the key. `user` linked or null. `bodyHash` stamped. Screening queued. Then the job: spam / valid-MX / repeat-sender / duplicate-body checks, `delivered` on clean, `failed` + retry on a send failure. Then retention: delivered purged, spam kept, `failed` never | `user-messages`, `user-message-screening`, `user-message-retention` + unit: `send-user-message.spec.ts`, `user-message-screening.spec.ts`, `turnstile.spec.ts`, `email-templates.spec.ts` |
| `/api/audiences/for-user`             | Progress-rule matching, country/location gating, condition audiences, range semantics                              | `audiences-for-user`     |
| `/api/frames/by-narrator/:narratorId` | Param validation, narrator lookup (404), gender-based filtering, mimeType sort, depth:1 subtleSystemNode hydration. **The locale gate over the real REST pipeline**: a French-only manager is denied with no `?locale=`, allowed at `?locale=fr`, denied at `?locale=en` (#701) | `frames-by-narrator`     |
| `POST /api/event-submissions/:id/review` | The locale gate over the real REST pipeline: an `atlas-manager` holding roles only in French is denied with no `?locale=`, allowed at `?locale=fr`, denied at `?locale=en` (#701). `applyReview`'s own transitions are covered by `event-submissions` | `event-submissions-review` |
| `/api/lectures/for-audience`          | Priority sampling, audience filter, subtitle/thumbnail fallback, clip metadata inheritance                         | `lectures-for-audience`  |
| `/api/meditations/lectures`           | Weight-based ranking, audience validation, frame cascade, auth gate, audience-feed fallback                        | `meditation-lectures`    |

## Scheduled jobs

| Task                             | Subject                                                                   | Covered by                                                              |
| ----------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `CleanupOrphanedMedia`           | Reference tracing across collections, grace period, 3-month date rotation | `cleanup-orphaned-media`                                                |
| `ExpireEvents`                   | Finished-check + reminder ladder. Publish side effects. Per-event failure isolation | `expire-events` + unit: `expire-events-stage-machine.spec.ts`, `schedule-status.spec.ts` |
| `SyncLectureMetadata`            | Batch sync, NV API error isolation, filtering                             | `sync-lecture-metadata`                                                 |
| `resetUsage` (cron)              | Usage-counter reset, `peakDailyRequests` preservation                     | `api`                                                                   |
| `recomputeMeditationNodeWeights` | Weight recomputation on meditation change                                 | `meditation-lectures` + unit: `compute-meditation-node-weights.spec.ts` |

## Cross-cutting subjects (helpers / utilities / RBAC)

| Subject                                                                                                        | Covered by                  |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| URL field factories (`virtualUrlField`, `previewUrlField`, `mixedMediaUrlField`, `hlsUrlField`, `mp4UrlField`) | `storage-utils`             |
| R2 filename sanitization (`generateR2Key`, `generateCloudflareImageId`). R2 preassign hook                     | `storage-utils`             |
| Cloudflare Stream webhook signature verification + MP4-download handler                                        | `cloudflare-stream-webhook` |
| Schema introspection (`discoverReferencesForCollection`, `extractIdsFromLexicalContent`)                       | `schema-utils`              |
| Seed importer existence cache is trash-aware                                                                   | `seed-importer-preload`     |
| Finished-event definition — `shouldFinish` (in-memory) pinned to agree with `notFinishedWhere` (SQL)           | unit: `schedule-status.spec.ts` |
| Content-Index block API endpoint generation (`computeApiEndpoint` virtual)                                     | `content-index-block`       |
| Project-based admin visibility (`createHidden` from accessPlugin)                                              | `project-visibility`        |
| Canonical Atlas URL shapes, pinned to the cross-repo `atlas-url-contract.json` fixture                         | unit: `atlas-canonical-url.spec.ts` |
| Canonical ownership precedence (nearest owning ancestor wins. Disabled/draft client owns nothing. We Meditate fallback) | unit: `atlas-region-owners.spec.ts`, `region-canonical-url` |
| Canonical resolution cost — a `webUrl` read costs exactly two extra queries regardless of N                    | `region-canonical-url` |
| `breadcrumbs[].url` backfill — roots-only resave repopulates the whole tree via the nested-docs cascade        | `region-breadcrumb-url-backfill` |
| A pre-existing blank region slug survives the nested-docs cascade. A deliberate blank is still refused         | `region-blank-slug-cascade` |
| RBAC (`hasPermission`, `hasAnyPermission`, document-level manager access, locale roles, translator scopes)     | `role-based-access`         |
| What a REST error body discloses under `config.debug` on/off, and `databaseErrorPlugin`'s 400 surviving both   | `error-disclosure`, `error-disclosure-debug` |
| The URL and SWR key each hand-rolled admin fetch builds from the active locale, and its refusal to build one without it (#701) | `admin-locale-urls` |

## Gaps

None known. The previous gap on `/api/frames/by-narrator/:narratorId` was
closed by `tests/int/frames-by-narrator.int.spec.ts`. The previous gap on
`access-performance.int.spec.ts` was resolved by removal (P4 of #434).

## Smoke specs (`tests/e2e/`) and dedup analysis

Tier 3 smoke specs run against the per-PR Railway preview environment with
cloned production data. They cover REST API, auth, and deployment as one
cohesive flow.

| Spec                            | REST paths exercised                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `auth.e2e.spec.ts`              | `POST /api/managers/login`, `GET /api/managers/me`                                |
| `meditations.e2e.spec.ts`       | `POST/PATCH/DELETE /api/meditations`, plus `GET` of resources                     |
| `songs.e2e.spec.ts`             | `POST/PATCH/DELETE /api/songs`                                                    |
| `lectures.e2e.spec.ts`          | `POST/PATCH/DELETE /api/lectures` (clip variant)                                  |
| `error-disclosure.e2e.spec.ts`  | `GET /api/meditations` with a failing `limit` and a failing `where` — the only gate reading the DEPLOYED `config.debug` (#684) |

**Dedup pass (P5 of #434).** Searched `tests/int/` for files hitting the
same REST paths. Three matches: `content-index-block` (builds
`/api/meditations` URLs via the `computeApiEndpoint` virtual),
`meditation-lectures` (hits the custom `/api/meditations/lectures`
endpoint, not `/api/meditations`), and `storage-utils` (a URL field
factory references `/api/songs/...`). None duplicates smoke's CRUD
coverage — each exercises a hook, virtual field, or custom endpoint. No
integration test was removed by P5.

## Removed by the #434 audit

Dropped because they only covered Payload-CMS built-ins. Reachability is
already covered by `collections-smoke.int.spec.ts`:

- `api-explorer.int.spec.ts` — built-in OpenAPI plugin / Scalar UI.
- `app-cards.int.spec.ts` — schema-only CRUD across `app-cards` fields.
- `frameFiltering.int.spec.ts` — built-in where-clause filtering and depth populate.
- `subtle-system-nodes.int.spec.ts` — built-in unique-slug + reverse-join exposure.
- `tableOfContents.int.spec.ts` — Lexical block round-trip storage.
- `access-performance.int.spec.ts` — mis-located (no `createTestEnvironment()`). Flaky wall-clock thresholds. Functional coverage in `role-based-access`.
- `seeds-lectures.int.spec.ts` — covered a seed importer, not a collection hook. Out of scope for the integration lane.
