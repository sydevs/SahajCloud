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

- **Slugs transliterate non-Latin names.** Every `slugField` (regions included)
  uses the shared `slugifyValue` (`src/lib/utilities/slugify.ts`), which
  transliterates Cyrillic etc. to ASCII (`Москва → "moskva"`) where Payload's
  ASCII-only default would collapse them to empty — so new regions auto-generate
  readable slugs.
- **`generateSlug` defaults OFF for regions** — not for the non-Latin reason
  anymore (transliteration handles that), but because the importer assigns
  *disambiguated* slugs for the names that repeat across the tree (Georgia the
  country vs. the US state → `georgia` / `georgia-united-states`); an
  on-by-default checkbox would rewrite them back to the bare, colliding
  `slugify(name)` on any save, including the nested-docs breadcrumb cascade. New
  regions still auto-slug (the create hook fills from `name`); the column-default
  off also keeps the prod backfill cascade-safe.
- **Country slugs are ISO alpha-2 codes** (`belgium → be`). The Atlas widget
  derives each country's code (flags, localized country names) from the slug,
  replacing the deprecated `legacyData.countryCode` (#556). The importer assigns
  them (countries walk first, so they always claim the two-letter slugs), and the
  `country_slug_iso_code` migration rewrites pre-existing rows. `webPath`/`webUrl`
  are computed from current slugs on every read, so paths follow automatically.
- **The importer assigns collision-free slugs.** `buildRegionSlugs()` in
  `import.ts` walks every region/center in a fixed `(level, legacyId)` order and
  assigns the country's ISO code or `slugifyValue(name)`, falling back to
  `name-parentName` then `name-legacyId` for the handful of repeated names (and
  `region-<legacyId>` only if a name transliterates to empty). It shares
  `slugifyValue` with the slugField, so a manager re-generating a slug reproduces
  the same value.
- **Reseed (update mode) to backfill:** `pnpm seed atlas --update`. The upserts
  pin `generateSlug: false` so the explicit slug is never rewritten.

## events.json is curated — a re-extraction destroys it

[extract.ts](extract.ts) regenerates `events.json` from `select * from events`,
so **every value listed below is silently dropped by a re-extraction** and has to
be re-applied before the regenerated file is committed. The raw `atlas.dump` is
not in this repo, so re-extraction is not a routine operation — but if you do it,
work through this list.

`tests/unit/atlas-events-data.spec.ts` asserts most of these invariants, so a
naive re-extraction fails the unit lane rather than quietly shipping.

| What | Scope |
| --- | --- |
| `website` | 29 events — the "learn more" link (#584, extended by the grooming pass) |
| `contactEmail` | 28 events — no Atlas column at all |
| Groomed `customName` / `description` / `room` | 219 events (below) |
| Derived `schedule.weekday` | 44 events — reproducible, `parseSchedule` now emits it |
| Contact name/phone repairs | 4 events whose two `contactInfo` values were swapped |
| URL-field repairs | #159, #286 (missing scheme/colon), #352 (an email in a URL field) |

### `contactInfo` carries more than the importer reads

Atlas's `contact_info` jsonb has six keys — `phone_name`, `phone_number`,
`email_name`, `email_address`, `meetup`, `facebook` — but `AtlasEvent` and the
importer only read the phone pair. The other four carry a value on **13 events**
(18 have the keys, 5 with all four blank), almost all `category: inactive` ones
where a contact *is* the whole offer, so they're easy to discard by accident —
which happened once during the grooming pass, and is now guarded by a unit
assertion.

Two of them are promoted into real fields, which is where the `contactEmail` and
`website` counts above come from:

- `email_address` → `contactEmail` (12 events)
- `meetup` / `facebook` → `website` (10 events), own domain beating the
  aggregator per the #584 rule — so `sahajayoga.org.br` and
  `freemeditation.com.au` win over the Facebook page on the same row

`email_name` stays put: it's a duplicate of `phone_name` where both exist, and
`contactName` is gated on `contactPhone`, so promoting it would not make an
otherwise-uncontactable event publishable.

### `website` selection rules (#584)

- **URLs already carried by another field were skipped.** Most descriptions that
  contain a link just repeat `onlineUrl` (Zoom/Meet/Mixlr join links) or
  `registrationUrl` (Google Forms). Those are *not* websites: `website` is the
  "more information" link, distinct from where attendees join or sign up. Map
  links were skipped too.
- **Own domains beat aggregators**, then the event's `languageCode` breaks ties
  (event 376 is `DE`, so `de.inthemoment.today` won over the `en.` variant).
- The grooming pass added 5 more under the same rules, plus `website` as the
  fallback home for a link on an **offline** event (#324's Zoom link — the
  importer drops `onlineUrl` unless `eventType === 'online'`).

### The grooming pass

Atlas had no validation on `customName` / `description` / `room`, so ~200
volunteer managers used the description as a notice-board. 219 of 511 events were
groomed. The managers' own wording is kept **verbatim**; only these classes were
touched:

1. **Information the listing already renders structurally** — the venue, street,
   postcode, room, weekday, time, phone, email and URLs all have their own
   fields. Where prose and `schedule` disagreed, the schedule won (its weekday
   always matches `startDate`'s day-of-week; the prose did not — #128, #149,
   #235, #389, #443).
2. **Stale dates and expired notices** — 25 events named a year (2022–2024), 48 a
   specific date, 18 carried a "Christmas break"/"Sommerpause"/"CLOSED during
   August" notice. All removed; the dormant `category: inactive` listings keep
   their timeless "contact us" offer.
3. **Capitalization** — SHOUTY titles (the Italian `SAHAJA YOGA - …` prefix, the
   Australian `HORNSBY Thursdays 6.30pm` pattern), German title-case, missing
   accents, and styled Mathematical-Alphanumeric letters (#606).
4. **Spelling and grammar** — ~25 confirmed fixes across DE, IT, PT, NL, RU, PL,
   FR and EN.
5. **Invisible junk** — 480 U+2800 braille blanks used as VK copy-paste padding
   (#70/#329/#669), 31 U+200B zero-width spaces, tabs, `\r\n`, `</br>`, and
   leading/trailing/doubled whitespace.
6. **Titles that weren't titles** — bare place names, addresses, directions and
   day/time. See the title policy below.

Two deliberate exceptions to rule 1: a weekday stays in the **title** where it is
the only thing distinguishing sibling events at one venue (the Brazilian
centres, the Paris `la Source` week, the Barcelona and Dublin pairs), and stays
in the **description** where `schedule` cannot express the real cadence (#128's
per-day timetable, the three Brasília parks whose monthly meet-ups are stored as
`daily`).

**Deliberately left alone**, and worth a manager's attention:

- `contactName` values that aren't people: `WhatsApp` (#443/#444/#445),
  `Cootamundra` (#546). Clearing them would unpublish #445 (inactive events
  require a contact); inventing a name is worse.
- #576's old title held an **Addlestone** address while its venue is Weybridge
  Library — a genuine address conflict only the manager can resolve.
- #128 and #159 are near-duplicate `sahaj.me` online listings.
- Venue-side typos in [data/venues.json](data/venues.json): city
  `Bichinno do Mato` (#586/#587), a postcode in the `street` field (#455), a
  zero-width space in #100's postcode.

## Merged duplicates — 15 rows removed from events.json

Atlas let one real class be entered twice. 12 pairs were confirmed by sharing a
venue **and** an identical `frequency` / `interval` / `weekday` / `weekNumber` /
`startTime`, then differing only in title, description, lifecycle status or
language. Their superseded rows are deleted from
[data/events.json](data/events.json) (511 → 496) and listed in
`EXCLUDED_EVENT_LEGACY_IDS` ([import.ts](import.ts)) so a re-extraction can't
bring them back.

Atlas's own `status` decided which row survives: `0` = verified/live, `6` =
finished. A `6/0` pair means Atlas had already retired one side.

| Removed | Survivor | Why |
| --- | --- | --- |
| #195 | #603 | same Zoom room (`zoom.us/j/827783773`) + slot, same manager, same region |
| #752 | #753 | one bilingual Ixelles session listed twice, EN and FR |
| #360 | #684 | Helsinki EN — #360 was `finished` |
| #392 | #698 | Helsinki FI — #392 was `finished` |
| #458 #461 #464 #468 #469 | #560 #565 #562 #570 #571 | the Swiss set: one manager's `course` rows retired and re-entered as `dropin`, same venue/weekday/time/language each time |
| #82 + #496 | — | duplicates of each other, **both** already retired |
| #497 + #534 | — | duplicates of each other, **both** already retired |
| #355 + #535 | — | Amstelveen NL/EN pair, **both** already retired |

**A merge is not a delete.** Anything the removed row held that the survivor
lacked was carried over first: #684 gained #360's `website` (the Helsinki meetup
link) and its contact, and #698 gained #392's contact.

Two knock-on effects:

- **Venue topology.** `multiUseVenueIds` counts events per venue, so removing a
  row can drop a venue from multi-use to single-use — its address is then inlined
  on the event instead of becoming a Regions `center`. Three venues moved this
  way (132 Amstelveen, 317 Winterthur, 562 Ixelles), so the import creates 3
  fewer centers. Regions still clear their expected minimum, but re-check this
  after any further removal.
- **`expectedCounts.events` is now 494** (496 rows less the 2 test records).

### `languageCodes` — a curated multi-language override

Atlas stored exactly one `languageCode` per row, but Payload's `languages` is
`hasMany`. #753 merged an English and a French listing of one session, so it
carries `languageCodes: ['EN', 'FR']`; `mapEventLanguages` prefers that over
`languageCode` when present. Every other row leaves it unset.

### Not merged, and why

- **#115 / #116** — same Zoom link and slot, same manager, but different
  `areaId` (Kamloops / Kelowna). One online room deliberately advertised to two
  regions; merging would delete a region's listing.
- **#35/#36, #84/#704, #156/#524, #315/#340, #362/#543** — same slot and venue,
  but **two different managers own the rows** (and #35/#36 differ in `endTime`,
  #156/#524 in `room`). Needs both people to agree first.
- **#400/#404 (Brasília), #435/#437 (Rio)** — these look co-located only because
  a venue record's coordinates disagree with its own stated address. A *venue*
  data bug, not duplicate events.

### Test records

#494 (`Test`) and #575 (`Test Event`) are leftover Atlas test rows. Unlike the
merged duplicates above they are still *in* events.json — the importer skips them
via `EXCLUDED_EVENT_LEGACY_IDS` ([import.ts](import.ts)), which keeps them in the
list handed to `multiUseVenueIds` so the venue → center topology is unchanged.

**Skipping can't undo an earlier import.** Any environment seeded before these
guards still holds the rows — both test records (#575's Atlas `published` was
`true`, so it landed as a *published* listing) and all 15 merged duplicates. The
importer emits a warning naming the existing document id (`events/<id>`) for
every excluded row on every run; trash them by hand in the admin panel. Check
prod.

## Event titles: a blank title beats a generic one

`customName` maps to the Events `title`, and an empty title is auto-filled by
`eventTitleBeforeChange` with a **localized** template —
`"<time of day> Meditation at <place>"`. So a blank title is *preferred* over a
hand-written generic one: the auto-fill translates per locale and can be improved
for every event at once by editing one string, where 60 copies of
"Free Meditation Classes in <Place>" cannot.

The rule the grooming pass settled on:

- **Blank it** when the title only restated the place, the venue's own street,
  the day/time, or a generic "Free Meditation Classes" — all of which the
  listing already renders from `address` / `schedule`.
- **Keep it** when it names the **venue**: a library, institute, university or
  community centre. The auto-fill only has the *street*, so
  `Regina Public Library, Glen Elm branch` carries what `1601 Dewdney Ave E`
  cannot. Ten titles are kept on that basis (#122, #131, #136, #142, #204, #223,
  #499, #528, #611, #626) — an earlier pass standardised them away and they were
  restored.
- **Keep it** when the street is a poor stand-in for the place — #293
  (`Zentrum`), #294 (`Innenstadt`) would auto-fill to "Meditation at city
  centre", and #371's street is the unusable `B26`.

Because the auto-fill takes the **first comma-segment** of `street`, a stray
comma or a lowercase town name surfaces straight into the listing's name. Three
venue records in [data/venues.json](data/venues.json) were fixed for that reason
(they improve the rendered address too): venue 65 `"9, St Peter's Park Rd"` →
`"9 St Peter's Park Rd"` (the comma split "9" off as the whole place), 198
`solihull` → `Solihull`, 382 `old bar` → `Old Bar`. Worth re-checking after any
venue edit: no blank-titled offline event should end up with a place string
under ~6 characters or in lowercase.

The importer sends `title: ''` (not null/undefined) for a blank `customName`,
because the hook keeps `originalDoc.title` for a nullish value — only an empty
string falls through to the auto-fill. Without that, clearing a title here would
never reach an already-imported row.

## `event.title` translations

The four auto-title templates live in the `sy-atlas-translations` global under
`event.title` (`morning` / `afternoon` / `evening` / `default`), with English
source copy in `EVENT_TITLE_DEFAULTS`
([`eventTitle.ts`](../../src/collections/Events/hooks/eventTitle.ts)).

- Each slot is a **complete sentence** with a `%{place}` placeholder, not a
  shared prefix plus a separate time-of-day word. A locale that puts the time of
  day after the place, or inflects it with the preposition, cannot be served by
  concatenation.
- The slot comes from the event's **local** start hour, resolved through
  `schedule.firstDate_tz` — 19:00 in Auckland is 07:00 UTC, so reading the UTC
  hour would label it a morning class. Boundaries: morning 05:00–11:59,
  afternoon 12:00–16:59, evening 17:00–21:59; `default` covers a 22:00–04:59
  start and an event with no schedule (every `inactive` listing).
- Slots fall back to the English default **individually**, because Payload's
  locale fallback works per field, not per key — a partly translated locale would
  otherwise yield `undefined` for the slots a translator skipped.

Historical note: the hook previously read `event.titlePrefix`, which was never
declared in `translationsSchema.json` — so the read always missed and every
title used the hardcoded English. `event` holds nested groups, and the builder
does not support mixing leaf keys with groups at one level, which is why the new
keys are a `title` group rather than a bare `event.titlePrefix`.

## Known gap: the test config's timezone enum is narrower than production's

`payload.config.ts` sets `admin.timezones.supportedTimezones = SUPPORTED_TIMEZONES`
(581 zones, the full IANA set from the pinned `@vvo/tzdb`) *because* the Atlas
data uses zones beyond Payload's curated default — 276 of the 509 events sit on
one (`Europe/Prague`, `Europe/Vienna`, `Asia/Novosibirsk`, …).

`tests/utils/testHelpers.ts` does **not** mirror that setting, so every
integration suite's `push` bakes Payload's narrow 47-zone default into each
`timezone: true` companion enum. A test that uses a real Atlas timezone fails
with `invalid input value for enum … _schedule_firstdate_tz`. Integration tests
touching `schedule.firstDate_tz` therefore have to pick from the narrow list
(`Europe/Berlin`, `Pacific/Auckland`, …).

Mirroring the setting is the obvious fix but is **not** free: widening 47 → 581
across the schedule + registrations enums (and their versions tables) slows the
per-suite schema push enough to time out ~9 suites at the 60 s limit. Closing
this properly means either accepting that cost, curating a smaller list that
still covers the Atlas zones, or seeding the test schema from migrations instead
of `push` — a decision worth its own ticket rather than a drive-by.

## Optional event fields import as `null`, not `undefined`

`importEvent` maps every optional field to `null` when the source has no value.
This is load-bearing for `--update` reseeds: Payload omits `undefined` keys from
an update, so a value that *disappears* from events.json would otherwise survive
in the database forever. The grooming pass cleared 36 descriptions, and the first
reseed silently kept all 36 stale until this changed. If you add an optional
field to the mapping, use `?? null` / `|| null` — never `undefined`.

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

## `POST /api/events/:id/register`

The widget write path (`:id` is the event id)
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
