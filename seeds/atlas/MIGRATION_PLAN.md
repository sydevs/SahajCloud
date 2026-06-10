# Sahaj Atlas → CMS Migration Plan

End-to-end plan for migrating the legacy **Sahaj Atlas** Rails app into this Payload CMS. This is the **living source of truth** for the migration — each phase reads it and updates the relevant sections (status markers, resolved open items) so all phases stay aligned.

Source: `atlas.dump` (PostgreSQL custom-format, PG 16.4) at the repo root. Legacy Rails codebase: `/Users/devindra/Documents/Projects/Atlas`.

**Target platform:** the CMS now runs on **Railway + Postgres 18** (infra migration #466 / PR #468 — **deployed; DNS cutover complete**: `cloud.sydevelopers.com` serves from Railway behind the Cloudflare edge, and the old Cloudflare Workers + D1 stack is being decommissioned). Atlas Phases 2–4 run against this Postgres stack: Phase 2's schema migration uses `pnpm db:migrations:create` (Postgres), and the Phase 3 importer seeds the Railway environment via the seed API.

## Overview & status

| Phase                        | Scope                                                                          | Status      |
| ---------------------------- | ------------------------------------------------------------------------------ | ----------- |
| **1 — Data export**          | Decide keep/discard; extract `seeds/atlas/data/*.json` in target-shaped format | **done** ✅ |
| **2 — Collections & schema** | Create collections + nested-docs plugin + Payload migration                    | implemented (PR for #457) |
| **3 — Seed importer**        | `seeds/atlas/import.ts` reads the JSON into Payload                            | planned     |
| **4 — Verification**         | Counts, referential integrity, spot-checks against a seeded env                | planned     |

## Phases

### Phase 1 — Data export (this ticket)

Restore the dump into a scratch local Postgres, run a one-shot `tsx` extractor (`seeds/atlas/extract.ts`) that applies the transforms below, and write **one JSON file per imported table** to `seeds/atlas/data/`. No collections, plugins, or migrations are touched here. To regenerate: `createdb atlas_scratch && pg_restore --no-owner --no-privileges -d atlas_scratch atlas.dump && ATLAS_DB_URL=postgres://localhost/atlas_scratch pnpm tsx seeds/atlas/extract.ts`.

8 output files: `events.json`, `registrations.json`, `regions.json`, `venues.json`, `users.json`, `managers.json`, `clients.json`, `pictures.json`. (`managed_records` is folded into `managers.json`; it is not its own file.)

### Phase 2 — Collections & schema (#457)

Implemented as **schema only** — no edits to existing collections, and **no Venues collection**.

- New collections: **Events**, **Registrations**, **Users** (registrants), and the nested **Regions** tree — via `@payloadcms/plugin-nested-docs` (installed + configured for `regions`, providing `parent` + `breadcrumbs` for Country → Region → Area → Center). All under the **Sahaj Atlas** admin group.
- **Venues eliminated**: a venue referenced by >1 event becomes a Regions `center`; a single-use venue's address is lifted onto its Event (`address` group). Street addresses live on Events, not on geo nodes. At import, a venue's Google `place_id` resolves to an OSM id.
- Fields remapped to Payload-native shapes: drafts (Events) replace Atlas's `published`; ToggleGroup for every Rails enum/bitmask; the project `scheduleFields` (Atlas `finishDate` maps into the schedule's ending, not a standalone field); ISO-639-1 language selects; timezone selects sourced from Payload's bundled `defaultTimezones` (deterministic across hosts — `Intl.supportedValuesOf` is ICU-version-dependent and would bake a host-specific enum into the migration).
- **`legacyId`** (hidden, indexed) + **`legacyData`** (hidden json — full raw source record) on all four, populated by the Phase 3 importer and dropped in a future cleanup once the import is verified.
- Project visibility: `events`, `registrations`, `regions` added to `sahaj-atlas`; **`users` is admin-only** (in no project).
- One Payload migration (`pnpm db:migrations:create` — **maintainer runs it**; interactive, hangs when piped — see `.claude/rules/migrations.md`), then `pnpm generate:types`.

**Implementation notes / deviations from the original sketch:**

- **Event title**: Payload forbids a virtual field as `useAsTitle`, so Atlas `customName` becomes a stored, **localized** `title`. A `beforeChange` hook auto-fills an empty title with `"<prefix> <first comma-segment of street>"`; the prefix ("Meditation at") is a per-locale, admin-editable string in the `sy-atlas-translations` global (with an English code default). A live placeholder mirroring the typed address needs a custom field component — **follow-up**.
- **Events `status`** (active/expired/inactive) sets an explicit `enumName` so its Postgres enum doesn't collide with the drafts `_status` enum (`enum_events_status`).
- **Schedule is optional** on Events — Atlas has scheduleless events (inactive ones with no recurrence).
- **Address geocoding**: the Event `address` group (a reusable `addressFields` builder) leads with a Mapbox Search Box — the `mapboxId` field's component. Selecting a result stores the Mapbox feature id and auto-fills street/city/region/country/postCode/latitude/longitude; the remaining fields stay hidden until an address is chosen (an "Enter manually" link reveals them for hand entry, and is the fallback when no `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is set). `country`/`region` are searchable dropdowns backed by plain `text` (ISO codes from `country-region-data` — no Postgres enum), `region` cascading from `country`. The Events required set is street/city/country/latitude/longitude.
- **Registration**: `registrationMode` is `sahaj-atlas` (native, default) or `external` (every third-party link — Atlas meetup/eventbrite/facebook collapse here). `registrationQuestions` is a **group of checkbox fields**, each label being the question shown to the registrant (a placeholder set, to be finalised against the real flow); enabling one includes that question on the registration form.
- **Regions location**: each geo node's identity is a **`mapboxId`** (Mapbox feature id) set via the same `AddressSearchField` — configured (`admin.custom`) to search `country,region,place,poi` and to skip address-field population (id-only mode). This replaces the former `osmId`. The search's "Enter manually" stores a `manual` sentinel that reveals explicit `latitude`/`longitude`/`radius`.

**Deferred to a follow-up ticket** (out of #457's scope): Managers `customResourceAccess` `relationTo += regions`; a `location`/`region` relationship on Clients/Services; Images reuse confirmation for event pictures; `legacyId`/`legacyData` removal.

### Phase 3 — Seed importer

`seeds/atlas/import.ts` extends `BaseImporter`, consuming the JSON with idempotent `upsert` keyed on `legacyId`. Responsibilities: rewire relationships via `legacyId`; parse the structured `schedule` into the project `scheduleFields`; resolve `customResourceAccess` / client `location` geo refs to `regions` docs; download each picture from GCS and re-upload to **Images**, then link to its event. Register the seed in `seeds/run.ts` (`VALID_SCRIPTS`), the `getImporter()` switch in `src/app/(payload)/api/seed/[script]/route.ts`, and `seeds/lib/expectedCounts.ts`.

### Phase 4 — Verification

Run the checks in **Verification** below against a seeded dev/preview environment.

## Keep / discard decisions (18 source tables)

| Table                   | Rows          | Decision          | Target                                                      |
| ----------------------- | ------------- | ----------------- | ----------------------------------------------------------- |
| `events`                | 511           | **KEEP**          | `events.json` → new Events                                  |
| `registrations`         | 886           | **KEEP**          | `registrations.json` → new Registrations                    |
| `countries`             | 29            | **KEEP**          | `regions.json` (level=country)                              |
| `regions`               | 100           | **KEEP**          | `regions.json` (level=region)                               |
| `areas`                 | 353           | **KEEP**          | `regions.json` (level=area)                                 |
| `venues`                | 507 → **407** | **KEEP (pruned)** | `venues.json` → new Venues (only event-referenced)          |
| `users`                 | 910           | **KEEP**          | `users.json` → new Users                                    |
| `managers`              | 327           | **KEEP**          | `managers.json` → existing Managers                         |
| `managed_records`       | 202           | **KEEP (folded)** | merged into `managers.json` as `customResourceAccess`       |
| `pictures`              | 142 → **134** | **KEEP (pruned)** | `pictures.json` → re-upload to Images (8 orphans dropped)   |
| `clients`               | 25            | **KEEP**          | `clients.json` → existing Clients/Services (secret dropped) |
| `conversations`         | 30            | **DISCARD**       | user-specified                                              |
| `audits`                | 144           | **DISCARD**       | user-specified                                              |
| `area_venues`           | 722           | **DISCARD**       | derived geo-containment join, regenerable                   |
| `passwordless_sessions` | 144           | **DISCARD**       | ephemeral auth tokens                                       |
| `stashes`               | 1             | **DISCARD**       | cron bookkeeping                                            |
| `ar_internal_metadata`  | 1             | **DISCARD**       | Rails internal                                              |
| `schema_migrations`     | 22            | **DISCARD**       | Rails internal                                              |

## Field mappings & transforms

**Universal:** every file preserves the legacy integer `id` as `legacyId` (natural key for relationship rewiring). Rails enums → strings. Ruby `flag` bitmasks → arrays of the enabled flag names. Every retained `jsonb`/`json` column is emitted as a parsed JSON object, never a stringified blob. Fields that are null/empty across **every** record are dropped (none remain).

### regions.json — nested Country → Region → Area

Single array of geo nodes. Each: `legacyId`, `level` (`country`|`region`|`area`), `parent` (`{level, legacyId}` or null), `name`, `countryCode`.

- **Country** (parent null): + `defaultLanguageCode`, `enableRegions`, `mailingService`.
- **Region** (parent = country by `country_code`): standard.
- **Area** (parent = region via `region_id`; **null region_id → parent = country** by `country_code`): + `latitude`, `longitude`, `radius`, `timeZone`, `subtitle`.
- `mailingService`: from the country `mailing_list` Ruby-YAML (only GB populated) → just the service name (`"brevo"`). The `api_key` (live Brevo secret), `list_id`, and opt-in copy are all dropped.
- `translations`: **dropped** — names will be derived from a package downstream instead of carried in the data.
- Drop: `summary_*`, `last_activity_on`, `bounds`, `geojson`, `translations`. `osm_id` is kept in the raw record (→ hidden `legacyData`) but is **no longer a first-class field** — see the Payload mapping below.
- **Payload mapping (Phase 2/3):** legacy `defaultLanguageCode` (country) → `eventDefaults.language`; `timeZone` (area, multi) → `eventDefaults.timeZone`. Both sit in the Regions **`eventDefaults`** group and **inherit down the tree** — a collection-level afterRead hook fills a blank `language`/`timeZone` from the nearest ancestor that sets it (Country → Region → Area → Center), each independently. `countryCode` is used only for area→country parent resolution at import and is **not stored** on the node. The geo identity is now the required **`mapboxId`** field (a Mapbox Search Box feature id, set via the shared `AddressSearchField` searching `country,region,place,poi`) — **not** the legacy `osm_id`. **Phase-3 implication:** OSM ids don't map to Mapbox ids, so the importer must resolve each node's `mapboxId` via a Mapbox lookup (by name/coords) **or** fall back to the `manual` sentinel + the legacy `latitude`/`longitude`/`radius` (countries/regions have no legacy coords → they need the lookup). `legacyData.osm_id` is preserved for that resolution.

### venues.json — folded into Regions + Event addresses

> **Phase 2 update:** there is **no Venues collection**. Venues referenced by >1 event become Regions `center` nodes; single-use venues' addresses are lifted onto their Event's `address` group. This `venues.json` extract still feeds the Phase 3 importer, which routes each venue to a center or an event address.

Pruned to the 407 venues referenced by an event. Deduped by unique `place_id`. Fields: `legacyId`, `placeId`, `name`, `street`, `city`, `countryCode`, `postCode`, `regionCode`, `latitude`, `longitude`, `timeZone`.

### events.json — new Events collection

`legacyId`, `eventType` (STI `OfflineEvent`/`OnlineEvent` → `offline`/`online`), `category` (`{1:dropin, 2:single, 3:course, 4:festival, 5:concert, 6:inactive}`), `customName`, `room`, `description`, `published`, `languageCode`, `onlineUrl`, `registrationMode` (`{0:native,1:external,2:meetup,3:eventbrite,4:facebook}` → **collapsed in Payload to `sahaj-atlas`** (native) **/ `external`** (all third-party modes)), `registrationUrl`, `registrationLimit`, `registrationNotification` (`{0:digest,1:immediate,2:disabled}` — **dropped**, not modelled in Payload), `registrationQuestions` (`flag` bitmask → the matching booleans in the Event's `registrationQuestions` **checkbox group**; the legacy `questions`/`experience`/`aspirations`/`referral` flags map onto that group's placeholder checkboxes, which will be finalised against the real registration flow), `contactInfo` (object, holds `phone_name`/`phone_number`), `verificationStreak`, `status` (`{0:active, 6:expired}`), `managerId`, `venueId`, `areaId`, `finishDate`, `createdAt`, and `schedule` (below). The top-level `phoneName`/`phoneNumber` are **dropped** as duplicates of `contactInfo`.

- **`schedule`**: parsed from `recurrence_data` (two Ruby-YAML dialects: old `:symbol:` keys + ISO dates; new string keys + human dates like `August 19, 2023`). Shape: `{frequency: 'daily'|'weekly'|'monthly', interval, weekNumber, weekday, startDate (ISO), startTime (HH:MM), endDate (ISO|null), endTime}`. Types seen: `daily`, `weekly_1`, `weekly_2` (interval 2), `monthly_1st` (weekNumber 1). `null` for the 18 inactive events with no recurrence. Phase 3 maps this to the project `scheduleFields` (rrule-based).
- Drop operational: `images` (superseded by `pictures`), `latest_registration_at`, all `*_email_sent_at`, `should_update_status_at`, `verified_at`, `expired_at`, `archived_at`, `finished_at`, `expiration_period`.

### registrations.json — new Registrations collection

`legacyId`, `eventId`, `userId`, `createdAt`, `startingAt`, `timeZone`, `questions` (object), `uuid`, `mailingListSubscribedAt`. Drop: `reminder_sent_at`, `followup_sent_at`, `next_reminder_at`.

### users.json — new Users collection (event registrants, distinct from Managers)

`legacyId`, `email`, `name`, `createdAt`. (All 910 have name + email.)

### managers.json — existing Managers collection

`legacyId`, `name`, `email`, `type` (`administrator=true` → `admin`, else `manager`), `languageCode`, `phone`, `phoneVerified`, `emailVerified`, `contactMethod` (`{0:email,1:whatsapp,2:telegram,3:wechat}`), `notifications` (`flag` bitmask → array of `new_managed_record`/`event_verification`/`event_registrations`/`place_summary`/`country_summary`/`application_summary`/`client_summary`; `2147483647` = all), `lastLoginAt`. (`contactSettings` dropped — null in all 327 records.)

- **`customResourceAccess`**: from `managed_records` — array of `{level, legacyId}` geo refs. `record_type` `Area`/`LocalArea` → `area`, `Region` → `region`, `Country` → `country`. Orphan refs (1 `LocalArea` → missing area 59) dropped; duplicates deduped. Phase 3 resolves to `regions` docs.

### clients.json — existing Clients/Services collection

`legacyId`, `label`, `config` (object: domain/embed_type/default_view/routing_type/locale), `managerId`, `clientId` (← Atlas `public_key`), `enabled`, `createdAt`, and `location` — Atlas geo scope (`location_type` + `location_id`) → `{level, legacyId}` geo ref (or null; 4 clients have none). The Atlas `secret_key` is **dropped** (not migrated); `lastAccessedAt` dropped (null in all 25). **Impedance notes for Phase 2/3:** Payload uses `useAPIKey` (one encrypted key it generates) — the Atlas `clientId` is reference-only; `managers` + `primaryContact` + `roles` are required on target (map `managerId` → both; default role `sahaj-atlas-client`); Phase 2 adds a `location` relationship field (relationTo `regions`) to Clients.

### pictures.json — event images → Images collection

`legacyId`, `eventId` (= `parent_id`), `filename` (the `file` jsonb value), `sourceUrl`. URL (CarrierWave + GCS, `store_dir = uploads/picture/file/{picture.id}/`):

```
https://storage.googleapis.com/sahaj-atlas/uploads/picture/file/{legacyId}/{filename}
```

134 images across 60 events (8 source pictures referencing since-deleted events 12/20/29/537 are pruned). Phase 3 downloads each and re-uploads to Images, linking to the event.

## Open items / dependencies

| Item                                                          | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GCLOUD_BUCKET` value for image URLs                          | **resolved**: `sahaj-atlas`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| GCS objects still live/public at import time                  | open — verify in Phase 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `area_venues` discard                                         | **resolved**: discard (derived)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `geojson` / `bounds` retention                                | **resolved**: drop both; `osm_id` kept in `legacyData` only (geo identity is now the Mapbox `mapboxId`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Regions `mapboxId` resolution (Phase 3)                       | **open** — OSM ids don't map to Mapbox ids; the importer must geocode each node by name/coords to a `mapbox_id`, or fall back to the `manual` sentinel + legacy `latitude`/`longitude`/`radius` (countries/regions lack legacy coords). `legacyData.osm_id` retained for this.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `eventType` representation                                    | **resolved**: enum `offline`/`online`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| jsonb columns parsed (not stringified)                        | **resolved**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Atlas client geo scope mapping                                | **resolved**: → `regions` ref                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `mailing_list` Brevo `api_key` in repo                        | **resolved**: keep only `mailingService` (e.g. `brevo`); drop key + list_id + copy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `translations` (~250 langs)                                   | **resolved**: dropped entirely — derive from a package downstream                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Clients secret handling                                       | **resolved**: drop `secret_key`; keep `public_key` as `clientId` (reference-only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Clients API-key impedance (Atlas pair vs. single Payload key) | open — decide in Phase 2/3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` on Railway (infra #466)    | **resolved (deferred to cutover).** Leave it **entirely unset** in Railway — do **not** add it as a blank variable: an empty value fails the schema's `min(32)` check and breaks the pre-deploy (this was the blank "ghost" var; removing it made the deploy green). Set it only **post-cutover**: the Stream webhook is account-scoped and shared with the still-running Cloudflare Worker, so rotating it early breaks the live Worker. At cutover, rotate + capture it (`scripts/setup-stream-webhook.ts --url https://cloud.sydevelopers.com/api/webhooks/cloudflare-stream --force`) and set it via `railway variables --set`. The app boots fine without it (the webhook route 503s; new videos just won't auto-enable MP4 downloads until set). |

## Verification

- **Counts**: `events` 511, `registrations` 886, `regions` 482 (29+100+353), `venues` 407 (pruned), `users` 910, `managers` 327, `clients` 25, `pictures` 134 (pruned). ✅ all verified.
- **Referential integrity**: every `events.{managerId,areaId,venueId}`, `registrations.{eventId,userId}`, `managers.customResourceAccess[].legacyId`, and `clients.location.legacyId` resolves to a `legacyId` present in the corresponding file (no dangling refs).
- **Spot-checks**: a `weekly_1` event's `schedule` has the right weekday; one area with `region_id=null` parents to its country, one with `region_id` to its region; `administrator=true` managers show `type: 'admin'`; a `pictures.sourceUrl` returns HTTP 200 (Phase 3); no `api_key` string appears in `regions.json`.
- **JSON validity**: all 8 files parse; no embedded-newline corruption in `events.description`.
