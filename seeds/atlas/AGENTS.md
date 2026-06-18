# Sahaj Atlas — backend surface

Sahaj Atlas (`sydevs/AtlasReact`, the embeddable `<syatlas-map>` widget) uses
SahajCloud as its backend, reading collections/globals as raw Payload REST and
calling the two custom endpoints below. The `sahaj-atlas-client` role +
`sahaj-atlas` project grant read access to `regions`, `events`, `registrations`,
`images`, `files`, and the `sy-atlas-config` / `sy-atlas-translations` globals
(see `src/plugins/access/config/`). The full migration design lives in
[MIGRATION_PLAN.md](MIGRATION_PLAN.md); the importer is [import.ts](import.ts).

## Region `slug`

`regions` carry a unique, indexed `slug` (`slugField` in
[`src/collections/Regions/Regions.ts`](../../src/collections/Regions/Regions.ts))
for stable Atlas identity/routing.

- **`generateSlug` defaults OFF.** Region names are frequently non-Latin
  (Москва, 東京, …), which the ASCII-only `slugify` collapses to `"-"`. With the
  auto-generate checkbox on, Payload would rewrite `slug → slugify(name)` on
  every save — including the nested-docs breadcrumb cascade that re-saves
  descendants — clobbering explicit slugs and colliding. Off, the
  seeded/entered slug sticks. The column is nullable, so the production backfill
  adds it without a `NOT NULL` constraint the cascade can't satisfy.
- **The importer assigns collision-free slugs.** `buildRegionSlugs()` in
  `import.ts` walks every region/center in a fixed `(level, legacyId)` order and
  assigns `slugify(name)`, falling back to `name-parentName` then `name-legacyId`
  for the handful of names that repeat across the tree (Georgia the country vs.
  the US state, São Paulo the state vs. the city, …) and `region-<legacyId>` for
  names `slugify` empties. It uses Payload's own `slugify`, so a manager
  re-generating a slug in the admin reproduces the same value.
- **Reseed (update mode) to backfill:** `pnpm seed atlas --update`. The upserts
  pin `generateSlug: false` so the explicit slug is never rewritten.

## `GET /api/events/geojson`

A thin GeoJSON wrapper over a standard published-events read
([`src/collections/Events/endpoints/geojson.ts`](../../src/collections/Events/endpoints/geojson.ts)).

- Forwards the caller's `where` / `select` / `populate` / `depth` / `sort` /
  pagination (and `locale`, via `req`) into `payload.find('events')`. The client
  `req` is passed through **unwrapped**, so the usage plugin's
  `validateClientQueryParamsHook` enforces the same rules as `GET /api/events`:
  `select` required (400 if missing), `populate` required when `depth > 1`.
  Access is published-only + project-visible.
- Each feature's `geometry` is a `Point` at `[address.longitude,
  address.latitude]` — **select those fields** to populate it; events without
  coordinates (online events, or coords not selected) return `geometry: null`
  and are still included. `properties` is the selected/populated event document
  verbatim (internal field names). Payload pagination metadata rides along as
  foreign members beside `features`.

## `POST /api/events/register`

The widget write path
([`src/collections/Events/endpoints/registerForEvent.ts`](../../src/collections/Events/endpoints/registerForEvent.ts)).
The `sahaj-atlas-client` role is read-only and `users` is admin-only, so a
frontend-only write is impossible — this endpoint owns it.

- Gated by a **published** client key (`requireActiveClient`). Confirms the
  event is one the client may read, upserts the registrant `user` by normalized
  email (elevated, since `users` is admin-only), then creates the `registration`
  (event + user + `startingAt` + `questions` + a fresh `uuid`).
- Rate-limit/abuse: the event-existence read counts toward usage tracking and is
  rate-limited at the Cloudflare edge like every other client request. Per-origin
  `allowedDomains` enforcement is deferred to **#509**.

## Response types & docs

- Response shapes are committed in
  [`src/collections/Events/endpoints/responseTypes.ts`](../../src/collections/Events/endpoints/responseTypes.ts)
  (self-contained) so AtlasReact can sync them by raw GitHub URL.
- Both endpoints appear in the Scalar docs (`/docs?project=sahaj-atlas`); their
  OpenAPI paths + schemas live in `src/plugins/openapi/customEndpoints.ts`.
