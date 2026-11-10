# Sahaj Atlas — backend surface

Sahaj Atlas (`sydevs/SahajAtlasWeb`, the embeddable `<sahaj-atlas>` widget)
uses SahajCloud as its backend: it reads collections/globals as raw
Payload REST and calls two custom endpoints — `GET /api/events/geojson`
(below) and `POST /api/clients/report` (`docs/rules/clients.md`). The full
migration design lives in [MIGRATION_PLAN.md](MIGRATION_PLAN.md). The importer is
[import.ts](import.ts).

## Region `slug`

`regions` carry a unique, indexed `slug` (`slugField` in
[`src/collections/Regions/Regions.ts`](../../src/collections/Regions/Regions.ts))
for stable Atlas identity and routing.

- **Slugs transliterate non-Latin names.** Every `slugField` (regions
  included) uses the shared `slugifyValue`
  (`src/lib/utilities/slugify.ts`), which transliterates Cyrillic etc. to
  ASCII (`Москва → "moskva"`) where Payload's ASCII-only default would
  collapse them to empty — so new regions auto-generate readable slugs.
- **`generateSlug` defaults OFF for regions.** Not for the non-Latin
  reason anymore (transliteration handles that), but because the importer
  assigns _disambiguated_ slugs for names that repeat across the tree
  (Georgia the country vs. the US state → `georgia` / `georgia-united-
states`). An on-by-default checkbox would rewrite them back to the bare,
  colliding `slugify(name)` on any save, including the nested-docs
  breadcrumb cascade. New regions still auto-slug (the create hook fills
  from `name`). The column-default off also keeps the prod backfill
  cascade-safe.
- **Country slugs are ISO alpha-2 codes** (`belgium → be`). The Atlas
  widget derives each country's code (flags, localized country names)
  from the slug, replacing the deprecated `legacyData.countryCode` (#556).
  The importer assigns them (countries walk first, so they always claim
  the two-letter slugs), and the `country_slug_iso_code` migration
  rewrites pre-existing rows. `webPath`/`webUrl` are computed from current
  slugs on every read, so paths follow automatically.
- **Reseed (update mode) to backfill**: `pnpm seed atlas --update`. The
  upserts pin `generateSlug: false`, so the explicit slug is never
  rewritten.

## The sync pipeline — the data is local, the curation is an overlay

⚠ **The Atlas data is personal data and is never committed.** Registrant and
manager names, emails, and phone numbers live only on the operator's machine,
in two gitignored directories: `seeds/atlas/local/` (dumps, raw extractions,
the overlay, reports) and `seeds/atlas/data/` (the importer's input). The
seed CLI uploads `seeds/atlas/data/` as `inlineData`, so a deployed target
never needs the files on disk. Until the 2026-11 refresh they were committed
to this public repository, and they remain in its history.

The legacy Atlas runs on Heroku (`sahajatlas`), and `pnpm atlas:sync` turns
its database into that input, the same way every time:

```bash
pnpm atlas:sync fetch                 # capture a Heroku backup, restore it, extract to local/raw/<bNNN>/
pnpm atlas:sync build                 # raw + merges + overlay → seeds/atlas/data/, a report, a worksheet
# groom the worksheet rows (below), then:
pnpm atlas:sync groom --patch <file>  # mechanical clean of worksheet rows, then your patch
pnpm atlas:sync check                 # grooming and write-contract invariants
pnpm atlas:sync record --groomed      # the groomed data becomes the new overlay
pnpm atlas:sync build && pnpm atlas:sync check   # proves the overlay reproduces it
```

`fetch --backup bNNN` reuses an existing backup instead of capturing one. It
needs the Heroku CLI signed in to the account that owns `sahajatlas`, and a
local Postgres 16+ to restore into (`atlas_scratch_<bNNN>`).

**The overlay is what makes a refresh repeatable.** `local/overlay/` records,
per row, the mechanical values it was groomed against (`basis`) and the
curated values that differ (`set`) — [sync/overlay.ts](sync/overlay.ts).
`build` copies a curated value over only while every field it was derived
from is unchanged upstream, and sends the row back for review otherwise. So
a refresh re-grooms only what moved: the 2026-11 refresh re-applied 609
events untouched and put 65 events and 35 venues on the worksheet.
**`record` only after grooming**: it marks every row of `seeds/atlas/data/`
as reviewed, which is why it demands `--groomed` while the worksheet is not
empty.

What lives where:

| Decision                                             | Lives in                                                                        | Committed?                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| Wording, titles, rooms, websites, contacts, weekdays | `local/overlay/*.json`                                                          | No — it carries personal data |
| Merged duplicates and their survivors                | [sync/merges.ts](sync/merges.ts), applied by `build`                            | Yes — ids only                |
| Duplicate venues and cities, venue field repairs     | [dedupe.ts](dedupe.ts), applied by `fetch` and again by `build`                 | Yes — ids only                |
| Verification floors                                  | `data/manifest.json`, derived by [sync/counts.ts](sync/counts.ts) on each build | No — and needs no constant    |

Neither committed list needs a deploy to take effect: both run locally, and
the importer only ever sees their result. A merge found at the final sync is
a change to commit, but not one to ship before seeding.

⚠ **The extraction reads Atlas timestamps as UTC.** Rails writes
`timestamp without time zone` in UTC, and node-postgres reads that type in
the extracting machine's zone, so every timestamp before the 2026-11 refresh
was shifted by its operator's offset — and the same dump extracted in two
zones disagreed. `extract.ts` sets the type parsers; extracting in two zones
now produces identical files.

**Grooming a worksheet.** `local/groom/<bNNN>.json` lists each row with its
previous mechanical value, its previous curated value, and the current one —
everything a three-way groom needs. `local/reports/<bNNN>.md` adds what moved
upstream (managers, clients, geo nodes) and the duplicate candidates to rule
on, which are evidence and never merges. Write decisions as a patch,
`{ "events": { "<legacyId>": { field: value } }, "venues": { … } }`, and let
`groom` apply it after its mechanical clean ([sync/clean.ts](sync/clean.ts) —
whitespace, invisible characters, stray HTML, empty contact values). The
rules are the ones below. `check` ([sync/check.ts](sync/check.ts)) enforces
the parts a machine can, against today's year.

**Re-syncing a target.** The importer cannot undo an earlier import, and
Atlas renumbers geo nodes, so a target is emptied first, then seeded in
update mode, which reconciles managers and clients in place:

```bash
pnpm tsx scripts/redeem-signin-link.ts '<link>' --seed atlas-reset --dry-run   # counts only
pnpm tsx scripts/redeem-signin-link.ts '<link>' --seed atlas-reset             # ⚠ deletes
pnpm tsx scripts/redeem-signin-link.ts '<link>' --seed atlas --update
```

Each run spends its own sign-in link. [reset.ts](reset.ts) empties events
(with their versions), regions, users and user-submissions in one
transaction, below the Local API — no hooks, so no revalidation storm and no
half-emptied map — and refuses to start if a RESTRICT foreign key has
appeared. `clients.region` goes null until the import re-links it, which it
does only for clients Atlas created — so the reset also refuses while a client
SahajCloud made for itself points at a region. **Take a database backup
before running it against production.** `--update` then
takes Atlas's side of every manager and client field, prunes managers Atlas
deleted (keeping, with a warning, any admin, any manager holding a non-Atlas
role, and any manager a non-Atlas client or form names), and never touches a
client Atlas did not create. Every event gets a fresh verification lease.

Then prove no embed lost its captcha (#1077): `pnpm tsx scripts/audit-challenge-parents.ts`
under `railway run --service SahajCloud` must print no refused inline mount from an
enabled service. A refused host is a service whose `site.domain` is missing or wrong —
the import writes it on create only, so a fix made on the Install tab survives every
re-sync — or a second site, which needs a `CLIENT_SPLITS` row ([sync/merges.ts](sync/merges.ts)).

### What the overlay carries

`extract.ts` reads Atlas mechanically, so every value below is curation,
kept in the overlay rather than recomputed. The scope is as of the 2026-08
refresh (#621); later refreshes add to it.

| What                                          | Scope                                                                                                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `website`                                     | 56 events — the "learn more" link (#584, extended by both grooming passes)                                                                                                                                                                |
| `contactEmail`                                | 31 events — no Atlas column at all                                                                                                                                                                                                        |
| Groomed `customName` / `description` / `room` | ~490 events across both passes (below)                                                                                                                                                                                                    |
| Derived `schedule.weekday`                    | reproducible — `parseSchedule` emits it for rows with no `on` key                                                                                                                                                                         |
| **Curated** `schedule.weekday`                | 7 events (#102, #455, #517, #520, #527, #629, #2291) whose own title/description names a different day. The mismatch is against Atlas's stale `on` value or a misleading `start_date` derivation. Title and start date agree in each case |
| Contact name/phone fixes                      | swapped `contactInfo` pairs (#1990, #5189 in this pass)                                                                                                                                                                                   |
| URL-field fixes                               | scheme-less (#1724 `vk.com`), leading whitespace (#1823), an email in a URL field (#2846, the #352 class)                                                                                                                                 |

### `contactInfo` carries more than the importer reads

Atlas's `contact_info` jsonb has six keys — `phone_name`, `phone_number`,
`email_name`, `email_address`, `meetup`, `facebook` — but `AtlasEvent` and
the importer only read the phone pair. The other four carry a value on
**13 events** (18 have the keys, 5 with all four blank), almost all
`category: inactive` ones where a contact _is_ the whole offer — easy to
discard by accident, which happened once during the grooming pass, and is
now guarded by a unit assertion.

Two are promoted into real fields, which is where the `contactEmail` and
`website` counts above come from:

- `email_address` → `contactEmail` (12 events)
- `meetup` / `facebook` → `website` (10 events), own domain beating the
  aggregator per the #584 rule — so `sahajayoga.org.br` and
  `freemeditation.com.au` win over the Facebook page on the same row

`email_name` stays put — it duplicates `phone_name` where both exist, and
`contactName` is gated on `contactPhone`, so promoting it would not make
an otherwise-uncontactable event publishable.

### `website` selection rules (#584)

- **URLs already carried by another field were skipped.** Most
  descriptions with a link just repeat `onlineUrl` (Zoom/Meet/Mixlr join
  links) or `registrationUrl` (Google Forms) — not websites: `website` is
  the "more information" link, distinct from where attendees join or sign
  up. Map links were skipped too.
- **Own domains beat aggregators**, then the event's `languageCode` breaks
  ties (event 376 is `DE`, so `de.inthemoment.today` won over the `en.`
  variant).
- The grooming pass added 5 more under the same rules, plus `website` as
  the fallback home for a link on an **offline** event (#324's Zoom
  link — the importer drops `onlineUrl` unless `eventType === 'online'`).

### The grooming pass

Atlas had no validation on `customName`/`description`/`room`, so ~200
volunteer managers used the description as a notice-board. 446 of the 511
events extracted from the 2024 dump were groomed (#605). The **2026-08
refresh** ran the same pass over the 230 new events and the ~100 rows
managers had edited upstream, under the same rules. Managers' own wording
is kept **verbatim**. Only these classes were touched:

1. **Information the listing already renders structurally** — venue,
   street, postcode, room, weekday, time, phone, email, and URLs all have
   their own fields. Where prose and `schedule` disagreed, `schedule` won
   (its weekday always matches `startDate`'s day-of-week. The prose did
   not — #128, #149, #235, #389, #443).
2. **Stale dates and expired notices** — 25 events named a year
   (2022–2024), 48 a specific date, 18 carried a "Christmas
   break"/"Sommerpause"/"CLOSED during August" notice. All removed. The
   dormant `category: inactive` listings keep their timeless "contact us"
   offer.
3. **Capitalization** — SHOUTY titles (the Italian `SAHAJA YOGA - …`
   prefix, the Australian `HORNSBY Thursdays 6.30pm` pattern), German
   title-case, missing accents, and styled Mathematical-Alphanumeric
   letters (#606).
4. **Spelling and grammar** — ~25 confirmed fixes across DE, IT, PT, NL,
   RU, PL, FR, and EN.
5. **Invisible junk** — 480 U+2800 braille blanks used as VK copy-paste
   padding (#70/#329/#669), 31 U+200B zero-width spaces, tabs, `\r\n`,
   `</br>`, and leading/trailing/doubled whitespace.
6. **Titles that weren't titles** — bare place names, addresses,
   directions, and day/time. See the title policy below.

Two deliberate exceptions to rule 1: a weekday stays in the **title**
where it is the only thing distinguishing sibling events at one venue (the
Brazilian centres, the Paris `la Source` week, the Barcelona and Dublin
pairs), and stays in the **description** where `schedule` cannot express
the real cadence (#128's per-day timetable, the three Brasília parks whose
monthly meet-ups are stored as `daily`).

**Deliberately left alone**, and worth a manager's attention:

- `contactName` values that aren't people: `WhatsApp` (#443/#444/#445),
  `Cootamundra` (#546), `Mödling` (#3111). Clearing them would unpublish
  inactive listings that require a contact. Inventing a name is worse.
- #2714's `room` says **Walcote Drive Community centre** while its venue
  is The Mary Potter Centre on Gregory Blvd — the #576-style address
  conflict only the manager can resolve.
- #4958 (Cornwall PE, Canada) has **no Atlas area at all**, so the
  importer cannot resolve a region for it.
- #965's `onlineUrl` is the bare `https://zoom.com` — not a join link. The
  real information lives on its `website`.
- Two Atlas _areas_ are actually street addresses masquerading as geo
  nodes — `Rue de Nimy 46` (Mons) and `Rue du Petit Bruxelles 94 Quenast
(Rebecq)` — surfacing as oddly-named region entries.
- Venue-side typos in `data/venues.json`: city
  `Bichinno do Mato` (#586/#587), `Феодосия Росиия` jammed into #1465's
  city, the junk street `Rua A` (#2719) and `-` (#4106), and #448's street
  being an office address rather than Kitsilano Beach.

## Shared venues — grouping events that meet at one address

> The Regions level is `venue` (label **Venue**), renamed from `center` /
> "SY Center" — most of these are libraries and community halls, not
> Sahaja Yoga centres. **SahajAtlasWeb reads `level` off the region API and
> must be updated in step.**

A venue referenced by **more than one event** becomes a Regions node those
events point their `region` at. A single-use venue has its address lifted
inline onto the event, and the venue record is discarded
(`multiUseVenueIds`/`venueToEventAddress` in
[helpers/venueRouter.ts](helpers/venueRouter.ts)).

Grouping keys on `venueId`, and Atlas holds the same place under several
venue rows — so two events at one address each looked single-use and
neither grouped. `VENUE_MERGES` in [dedupe.ts](dedupe.ts) collapses them.
`dedupeAtlasData` re-points the events and drops the losing row. **52
shared venues** as of the 2026-08 dump.

The refresh added seven venue-merge pairs, each hand-verified: a fourth
row for the Amsterdam Manenburgstraat building (3116 → 11), the Mons
P'tite Maison Folie (4337 → 4336), _three_ rows for the Frankfurt
stadtRAUM concert hall at 293 Mainzer Landstraße (5062/5293 → 5194), two
rows for the Frankfurt Burgstraße 72 centre (5095/5096 → 492, three
different managers list there), a second Nottingham Central Library row
(4765 → 4798), and a second row for the München Am Lilienberg building
(5063 → 458). Five `AREA_MERGES` were added for city rows Atlas now holds
twice — Nottingham (1538 → 226), Colombier (2726 → 364), Compiègne (2198 →
393), Martinique (2759 → 2231) — plus "Province Québec" (1807 → 1472),
which duplicated the Québec feature the existing nodes already claim. The
kept side is always the id previously-seeded environments already hold, so
reseeds update instead of colliding on the unique `slug`/`mapboxId`.
Extraction also normalizes venue `name`/`street`/`city`/`postCode`
whitespace — 126 fields carried stray spaces — and fixes two venue
fields via `VENUE_FIELD_OVERRIDES`: 2125's name was its whole marketing
slogan (now `Málnárium`), 5755's city was lowercase `sydney`.

Ten pairs were added, each verified by hand. Coordinates alone are not
evidence **in either direction**: two Civitavecchia venues sit 177 m apart
but are different places, while Athens 386/432 are 230 m apart yet share a
name, street, city _and_ postcode. Two candidates were rejected outright
after confirming — Móstoles 155/158 (404 km apart, different venue names.
one row's `street` is simply wrong) and Воронеж/Тольятти 483/511 (700 km
apart).

- **The kept side is whichever carries better data**, not the lower id:
  191 → 215 because 215 is named `Wensum Sports Centre`, which event
  #315's own description names. 50 → 514 because 50's postcode `1017ZP`
  is _Amsterdam's_ on a Den Haag venue.
- **`VENUE_FIELD_OVERRIDES`** fixes a field where the _removed_ row held
  the better value (venue 514 keeps its correct postcode but takes 50's
  real name, `Atelier`). Kept in code so a re-extraction reproduces it.
- **It also names the venues that have no venue** (sydevs/SahajAtlasWeb
  bug #15). Twelve listings give only a town, so their point is the town's
  centre — Sneek's landed on a supermarket. Six already repeat the town as
  their street; the other six said `Zentrum`, `Innenstadt`, `Centro`,
  `Perth CBD`, `None` or `wird noch angekündigt`, and the overrides rewrite
  each to the town's own name. That is the form the widget reads as "no
  real place" in any language, and draws as an area with no directions,
  as it does every inactive listing. A street cannot be blank: Events
  require one. #4106's `-` stays, because its point is the park its venue
  names.
- **Targets must be terminal.** `dedupeAtlasData` applies the map in one
  pass, so a chain would strand events on a removed row. This bit the
  Amsterdam building, which had three rows: the pre-existing `342 → 104`
  had to become `342 → 11` when 104 itself was merged into 11.
  `tests/unit/atlas-dedupe.spec.ts` asserts no chains, no
  self-references, and no override on a deleted venue.
- Venues 11 and 104 were **both** shared venues 1 m apart, so the import
  used to create _two_ nodes for one Amsterdam building.

Three postcode conflicts could not be resolved from the data and stand as
they are — Eindhoven `5641EC` vs `5641PC`, Tampere `33541` vs `33540`,
Derby `DE73 5SA` vs `DE73 5UA`. Worth a manager's eye.

**Orphaned nodes.** The import only upserts, so a venue that drops below
the >1-event bar leaves a stale region behind, complete with its public
URL. The importer warns with the document id rather than deleting — a
manager may have hung content or child nodes off it.

## Merged duplicates — 15 rows removed by #605, 9 more by the 2026-08 refresh

Atlas let one real class be entered twice. The #605 pairs were confirmed
by sharing a venue **and** an identical `frequency`/`interval`/`weekday`/
`weekNumber`/`startTime`, then differing only in title, description,
lifecycle status, or language. Their superseded rows are listed in
`EXCLUDED_EVENT_LEGACY_IDS` ([sync/merges.ts](sync/merges.ts)), which
`build` applies to every extraction, so a refresh can't bring them back.

Atlas's own `status` decided which row survives: `0` = verified/live, `6`
= finished. A `6/0` pair means Atlas had already retired one side.

The refresh added a **session re-listing** variant of the same evidence:
one manager's class re-entered as a new row per term, with sequential
non-overlapping date ranges at the same venue and slot. The open-ended or
latest term survives. Anything the removed rows held that it lacked was
carried over first (#4662 gained #1988's contact number and room).

| Removed (2026-08) | Survivor | Why                                                                               |
| ----------------- | -------- | --------------------------------------------------------------------------------- |
| #4365 #4366       | #4364    | Melbourne Ross House entered three times, identical rows                          |
| #5849             | #5684    | "Klanken van India" Amsterdam concert entered twice                               |
| #4299             | #4298    | one bilingual Mons session listed twice, FR and NL (`languageCodes: ['FR','NL']`) |
| #2951             | #3440    | Mittagong re-entered two months later, same manager/address/slot                  |
| #1988             | #4662    | Nottingham Central Library under two venue rows, same manager/slot                |
| #1328             | #2945    | Reading: Feb–Apr 2025 term superseded by the open-ended re-listing                |
| #3078 #4331       | #4332    | Milton Parc fall/winter terms superseded by the latest                            |

Of the #605 exclusions, five rows (#575, #458, #461, #468, #469) have
since been deleted in Atlas itself — their entries stay as harmless
no-ops. The #605 survivors #570/#571 were also deleted upstream, so the
Swiss set is gone entirely.

| Removed                  | Survivor                 | Why                                                                                                                              |
| ------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| #195                     | #603                     | same Zoom room (`zoom.us/j/827783773`) + slot, same manager, same region                                                         |
| #752                     | #753                     | one bilingual Ixelles session listed twice, EN and FR                                                                            |
| #360                     | #684                     | Helsinki EN — #360 was `finished`                                                                                                |
| #392                     | #698                     | Helsinki FI — #392 was `finished`                                                                                                |
| #458 #461 #464 #468 #469 | #560 #565 #562 #570 #571 | the Swiss set. One manager's `course` rows retired and re-entered as `dropin`, at the same venue/weekday/time/language each time |
| #82 + #496               | —                        | duplicates of each other, **both** already retired                                                                               |
| #497 + #534              | —                        | duplicates of each other, **both** already retired                                                                               |
| #355 + #535              | —                        | Amstelveen NL/EN pair, **both** already retired                                                                                  |

**A merge is not a delete.** Anything the removed row held that the
survivor lacked was carried over first: #684 gained #360's `website` (the
Helsinki meetup link) and its contact, and #698 gained #392's contact.

Two knock-on effects:

- **Venue topology.** `multiUseVenueIds` counts events per venue, so
  removing a row can drop a venue from multi-use to single-use — its
  address then inlines onto the event instead of becoming a Regions
  `venue` node. The regions floor is recomputed from the data on every
  build ([sync/counts.ts](sync/counts.ts)), so a removal that changes the
  topology moves the floor with it instead of leaving a stale constant.
- **The events floor** is every row whose manager and region resolve, less
  the ones that import straight into the trash, which `payload.count` does
  not see: at the 2026-08 refresh, 653 rows less #494 (test record), #4958
  (no Atlas area, so no resolvable region) and the archived #75/#199 — 649.
  Registrations on merged-away duplicates re-attach to the merge survivor via
  `MERGED_EVENT_TARGETS` ([sync/merges.ts](sync/merges.ts), applied by
  `build`) — a merge is not a delete; #195's 39 registrants belong to #603's
  class.
  Dropped: the 2 registrations whose event has neither a row nor a
  survivor, and the 1 on the archived #199 — **Payload silently rolls
  back a `create` whose relationship target is trashed** (the API returns
  201 with a doc id, but the row never lands. Reproduced with a bare REST
  create), so trashed events stay out of the registration id-map and that
  skip is visible instead of a phantom success. The **user-submissions**
  floor is counted under `activeRegistrationWhere` rather than as a
  whole-collection count — contact, subscribe and proposal rows share that
  table.
- **The regions floor** is every source geo node (post-dedupe) plus one
  shared-venue node per venue more than one surviving event uses, less the
  nodes in `UNIMPORTABLE_REGIONS` — region:East (#42), whose source carries
  no usable location. Because verification is `actual >= expected`, an
  understated value is not conservative — it just stops confirming.

### `languageCodes` — a curated multi-language override

Atlas stored exactly one `languageCode` per row, but Payload's
`languages` is `hasMany`. Seven rows carry the override, which
`mapEventLanguages` prefers over `languageCode`: the two merged
one-session-per-language pairs (#753 EN/FR, #4298 FR/NL) and five rows
whose own text declares both languages — the Milton Parc workshops
"offered in French and English" (#4332), Florence's "hosted both in
Italian and in English" (#4464), Marburg's part-bilingual Russian/German
course (#4793), and the bilingual Frankfurt programs (#4859, #5387, both
DE/EN). Every other row leaves it unset.

### Not merged, and why

- **#115 / #116** — same Zoom link and slot, same manager, but different
  `areaId` (Kamloops / Kelowna). One online room deliberately advertised
  to two regions. Merging would delete a region's listing.
- **#35/#36, #84/#704, #156/#524, #315/#340** — same slot and venue, but
  **two different managers own the rows** (and #35/#36 differ in
  `endTime`, #156/#524 in `room`). Needs both people to agree first.
- **#400/#404 (Brasília), #435/#437 (Rio)** — these look co-located only
  because a venue record's coordinates disagree with its own stated
  address. A _venue_ data bug, not duplicate events.
- **2026-08 additions to the different-managers list**: #748/#759 (Mol —
  the same Thursday course re-listed for the new season under a second
  manager account, same contact person on both), #3242/#5618 (Gent — a
  finished course and its drop-in continuation at the same venue and
  slot), #3308/#4333 (Québec — same Zoom room and Monday slot, different
  managers), and #4893/#5486 (Frankfurt Burgstraße — two listings of the
  same Tuesday-evening slot by different managers).

### Test records

#494 (`Test`) is the one leftover Atlas test row still in the dump. `build`
drops it via `EXCLUDED_EVENT_LEGACY_IDS` ([sync/merges.ts](sync/merges.ts));
no venue's multi-use status hinges on it, so the venue topology is
unchanged. (#575, the other #605-era test record, has since
been deleted in Atlas itself.)

**Skipping can't undo an earlier import.** Any environment seeded before
these guards still holds the rows — the test records (#575's Atlas
`published` was `true`, so it landed as a _published_ listing) and every
merged duplicate. The importer emits a warning naming the existing
document id (`events/<id>`) for every excluded row on every run, and —
since the 2026-08 refresh — a warning for every imported event whose
`legacyId` no longer appears in events.json at all
(`reportUpstreamDeletedEvents`), which is how the 64 events deleted in
Atlas between the two dumps surface for hand-trashing. The same report
exists for regions (`reportUpstreamDeletedRegions`), and there it is
**load-bearing**: Atlas _renumbers_ geo nodes (Paris moved from area 438
to 1208 between dumps), and because `slug` and `mapboxId` are unique, a
stale doc under the old id _blocks the renumbered node's create_ — a
region upsert failing with "The following field is invalid:
Slug"/"mapboxId" means exactly this. **A re-sync avoids all of it by
running `atlas-reset` first** (above, "Re-syncing a target"); the reports
remain for a target seeded on top of an earlier import without one.

## Services: one site each (#1055)

A SahajCloud service is one site, and Atlas let one service list several.
`prepareRaw` applies two decisions from [sync/merges.ts](sync/merges.ts) to
the clients table, ahead of the overlay:

- **`EXCLUDED_CLIENT_LEGACY_IDS`** leaves out Atlas's own two services, "Sahaj
  Atlas Dev" (#33, `localhost`) and "Sahaj Atlas" (#66, the legacy widget
  hosts). Both were deleted from production on 2026-11-07, and the importer
  never deletes, so leaving them out of the data is what keeps them deleted.
  SahajCloud's own "Sahaj Atlas" service (`clients/8`, no `legacyId`) holds the
  live key and is never touched.
- **`CLIENT_SPLITS`** gives a second site its own row: `yogaessonne.fr` leaves
  Sahaja Yoga FR (#32) as "Yoga Essonne", legacy id **-32**, under
  Ile-de-France. ⚠ A split's id is negative so no Atlas row can take it. Its
  region is found by name under the source's country, because Atlas renumbers
  geo nodes, and the build throws if none or several match.

⚠ **Production's "Yoga Essonne" (`clients/43`) was created by hand before
the split existed**, so it needs `legacyId: -32` before the next `atlas
--update`. Without it the import creates a second "Yoga Essonne", and
`atlas-reset` refuses while a service SahajCloud made itself points at a
region.

## One-offs, and the duplicate-class guard

**Atlas stores a one-off as an open-ended daily.** A `single` or `concert`
event carries `type: daily`, a start date and no end. The 2026-08 import read
that literally, so every past concert listed upcoming dates every day,
forever. `isAtlasOneOff` ([helpers/scheduleMapper.ts](helpers/scheduleMapper.ts))
maps it to a schedule that does not repeat, which also finishes it after its
date. A `festival` with an end date is a genuine daily run and is left alone.

**The seed skips `refuseDuplicateClass`** (`context.skipDuplicateClassCheck`).
The guard (#912, 2026-10) refuses a class whose type, region, place, start time
and cadence match another's. For a manager entering a class that is right, but
Atlas's own listings already carry pairs left unmerged on purpose — two
managers, one slot (above, "Not merged, and why") — and the guard dropped all
of them on a clean import, 16 events at the 2026-08 data. Which Atlas rows
repeat each other is decided by evidence in [sync/merges.ts](sync/merges.ts).
⚠ The guard also runs on update, so a manager saving either half of such a
pair is refused until the pair is resolved.

## Event titles: a blank title beats a generic one

`customName` maps to the Events `title`, and an empty title is auto-filled
by `eventTitleBeforeChange` with a template — `"<time of day> Meditation
at <place>"`. So a blank title is _preferred_ over a hand-written generic
one: it can be improved for every event at once by editing one string,
where 60 copies of "Free Meditation Classes in <Place>" cannot, and the
Atlas widget translates the result client-side.

> `title` stopped being localized in #609: it is one column, composed in
> the default locale. The `sy-atlas-translations` `event.title` templates
> are still a localized field, but only the default locale's set is read
> now.

**Online events** have no address, so `<place>` falls back to the name of
the `region` the event hangs off — "Evening Meditation at Dublin."
`region` is required on every event, so there is always something to name
a listing after, and the importer needs no fallback title of its own (it
used to send a hardcoded "Online Sahaj Yoga Meditation"). Two
blank-titled online events in one region and one time-of-day slot collide
the same way two at one venue do.

The rule the grooming pass settled on:

- **Blank it** when the title only restates the place, the venue's own
  street, the day/time, or a generic "Free Meditation Classes" — all of
  which the listing already renders from `address`/`schedule`.
- **Blank it** when the title says nothing but "meditation" in some
  language — `Méditation`, `Taller de meditación`, `Corso di
Meditazione`, `Meditatie Cursus`, `Viikoittainen meditaatio`,
  `Медитация`. 78 titles went this way. The same string was often
  repeated verbatim across a dozen cities, so it never distinguished
  anything. A title earns its place by naming something the auto-fill
  _can't_: a venue, an audience (`Kids' Meditations`, `Aula de
Aprofundamento`), a language (`Viikoittainen meditaatio suomeksi`,
  `Meditationskurs auf Deutsch`), a format (`Music and Meditation`, `Live
Online WhatsApp Video Meditation`) or a named event (`Corso Leopold`,
  `Puja a Shri Ganesha`). `pnpm atlas:sync check` enforces
  this with a regex over the bare "meditation/class/course" shapes.
- **Keep it** when it names the **venue**: a library, institute,
  university, or community centre. Ten titles were kept on that basis
  (#122, #131, #136, #142, #204, #223, #499, #528, #611, #626) — an
  earlier pass standardised them away and they were restored — when the
  auto-fill had only the _street_. It now names the venue itself:
  `addressPlaceName` (`src/lib/eventTitle/compose.ts`) prefers
  `address.venueName`, which `venueToEventAddress` sets from the Atlas
  venue name unless that only repeats the street or city, and falls back
  to the street. Most of the ten now restate their venue's name (#142
  `Regina Public Library, Glen Elm branch` against the venue's `Regina
Public Library - Glen Elm Branch`), so re-check the rule against that.
- **Keep it** when the street is a poor stand-in for the place — #371's
  street is the unusable `B26`. #293 and #294 were kept when their streets
  were `Zentrum` and `Innenstadt`, which are now the town's own name.

**Blanking can collide.** Two events at one venue in the same
time-of-day slot auto-fill to the same title, so check before blanking.
After the 2026-08 refresh, 16 collision groups remain — all either
pre-existing pairs whose identical hand-written titles already collided
(#263–#266 Madrid, #84/#704, #138/#244, #156/#524, #315/#340, #612/#696,
#641/#682, #319/#342, #389/#683, #493/#690) or unmerged near-duplicates on
the different-managers list above (#748/#759 Mol, #3242/#5618 Gent), plus
sibling sets whose Atlas titles were blank or identical to start with:
#1103/#1104 (Lansdale), #1328→#2945 (Reading, resolved by the merge),
#3803/#3804/#3836 (three Poitiers evening classes), and #4925/#4926
(Luzern's DE/PT pair, distinguished by language and weekday chips rather
than title).

Where no venue name survives, the auto-fill takes the **first
comma-segment** of `street`, so a stray comma or a lowercase town name
surfaces straight into the listing's name. Three venue records in `data/venues.json` were
fixed for that reason (they also improve the rendered address): venue 65
`"9, St Peter's Park Rd"` → `"9 St Peter's Park Rd"` (the comma split "9"
off as the whole place), 198 `solihull` → `Solihull`, 382 `old bar` →
`Old Bar`. Worth re-checking after any venue edit: no blank-titled offline
event should end up with a place string under ~6 characters or in
lowercase.

The importer sends `title: ''` (not null/undefined) for a blank
`customName`, because the hook keeps `originalDoc.title` for a nullish
value — only an empty string falls through to the auto-fill. Without
that, clearing a title here would never reach an already-imported row.

## `event.title` translations

The four auto-title templates live in the `sy-atlas-translations` global
under `event.title` (`morning`/`afternoon`/`evening`/`default`), with
English source copy in `EVENT_TITLE_DEFAULTS`
([`compose.ts`](../../src/lib/eventTitle/compose.ts)).

### Listing-quality stamps (#609)

Events carry two derived columns — `qualityOpenCount` and
`qualityCheckVersion` — written by the Events `stampEventQuality`
beforeChange hook. The import gets them for free: every event goes through
`upsert`, which goes through the Local API, so the hook runs.

**That is why there is no backfill script.** Production is seeded from
here, so there are no pre-existing rows to repair — a row can only lack a
stamp if it has never been saved since the columns shipped. The batch that
finishes the events collection calls `verifyEventQualityStamps()` and
warns if any remain, scoped past the excluded duplicates and trashed rows,
which this import refuses to touch by design and so can never stamp.

Historical note: the hook previously read `event.titlePrefix`, which was
never declared in `translationsSchema.json`, so the read always missed
and every title used the hardcoded English. `event` holds nested groups,
and the builder does not support mixing leaf keys with groups at one
level — which is why the new keys are a `title` group rather than a bare
`event.titlePrefix`.

## Known gap: the test config's timezone enum is narrower than production's

`payload.config.ts` sets `admin.timezones.supportedTimezones =
SUPPORTED_TIMEZONES` (581 zones, the full IANA set from the pinned
`@vvo/tzdb`) _because_ the Atlas data uses zones beyond Payload's curated
default — over half the events sit on one (`Europe/Prague`,
`Europe/Vienna`, `Asia/Novosibirsk`, …).

`tests/utils/testHelpers.ts` does **not** mirror that setting, so every
integration suite's `push` bakes Payload's narrow 47-zone default into
each `timezone: true` companion enum. A test that uses a real Atlas
timezone fails with `invalid input value for enum …
_schedule_firstdate_tz`. Integration tests touching
`schedule.firstDate_tz` therefore have to pick from the narrow list
(`Europe/Berlin`, `Pacific/Auckland`, …).

Mirroring the setting is the obvious fix but is **not** free: widening
47 → 581 across the schedule + submission enums (and their versions
tables) slows the per-suite schema push enough to time out ~9 suites at
the 60 s limit. Closing this properly means either accepting that cost,
curating a smaller list that still covers the Atlas zones, or seeding the
test schema from migrations instead of `push` — a decision worth its own
ticket rather than a drive-by.

## Optional event fields import as `null`, not `undefined`

`importEvent` maps every optional field to `null` when the source has no
value. This is load-bearing for `--update` reseeds: Payload omits
`undefined` keys from an update, so a value that _disappears_ from
events.json would otherwise survive in the database forever. The grooming
pass cleared 36 descriptions, and the first reseed silently kept all 36
stale until this changed. If you add an optional field to the mapping,
use `?? null` / `|| null` — never `undefined`.

## Response types & docs

- `GET /api/events/geojson`: its contract is the docblock in
  [`src/collections/Events/endpoints/geojson.ts`](../../src/collections/Events/endpoints/geojson.ts).
- Response shapes are committed in
  [`src/collections/Events/endpoints/responseTypes.ts`](../../src/collections/Events/endpoints/responseTypes.ts)
  (self-contained), so SahajAtlasWeb can sync them by raw GitHub URL.
- `geojson` appears in the Scalar docs (`/docs?project=sahaj-atlas`); its
  OpenAPI path and schemas live in `src/plugins/openapi/customEndpoints.ts`.
  The widget's write path is a plain `POST /api/user-submissions` create with
  `type: registration`, which the generated types carry rather than the spec —
  `user-submissions` is in no project, so every path on it is `x-internal`.
