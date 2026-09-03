# Collections & Fields

Rules for PayloadCMS collections, custom fields, and the patterns
specific to this codebase. This guide also covers `src/fields/`.

## Access control is automatic

`accessPlugin` applies access control, `admin.hidden`, and field-level
access automatically. Collections **do not** need manual `access` config.

```typescript
// src/payload.config.ts (already wired up)
import { accessPlugin, bypassPermissions } from '@/plugins/access'

plugins: [accessPlugin({ enabled: true, bypassPermissions })]
```

For custom logic outside collections, use `hasPermission`:

```typescript
import { hasPermission } from '@/plugins/access'

const canUpdate = hasPermission({
  user,
  collection: 'meditations',
  operation: 'update',
})
```

Permission flow (in order):

1. Block null users.
2. Bypass function (admin → allow; inactive → deny; self-access → allow).
3. Extract roles (flat array for clients, localized for managers).
4. Per-role check: implicit project read access, explicit permissions, translate-only for localized field updates.
5. Document-level manager access: when the above deny an active non-admin manager a read/update, `createAccessConfig` grants it if the doc (or an ancestor) lists them via a `managers`/`manager` field.
6. Default: deny.

Behaviors worth knowing:

- **Implicit read access**: managers and clients can read everything in
  their role's project + collections that aren't in any project.
- **Manager roles are per-locale** (uses `req.locale`).
- **Client roles apply uniformly across all locales.**

Full RBAC details: see `docs/rules/access.md` (loads when editing
`src/plugins/access/`).

## Field factory naming

```typescript
// ✅ lowercase camelCase, no prefix
virtualUrlField({ collection, adapter })
previewUrlField({ collection })
slugField({ useAsSlug: 'title' })

// ❌ no PascalCase or create* prefix
createVirtualUrlField()
VirtualUrlField()
```

## `filterOptions` return types

`filterOptions` must return `Where | true`:

```typescript
// ✅
filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true)

// ❌ Empty object is not assignable to Where
filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : {})
```

## Conditional validation pattern

When a field has both `required: true` and a custom `validate` function,
**do not** return `true` for null/empty values inside `validate` —
PayloadCMS already skips validation when `admin.condition` is false.
Returning `true` for null in your custom validator silently overrides
`required`, allowing null saves even when the field IS visible.

```typescript
// ✅ Let PayloadCMS handle the required + condition lifecycle
{
  name: 'startTime',
  type: 'text',
  required: true,
  validate: (value: string | null | undefined) => {
    const re = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/
    if (!value || !re.test(value)) {
      return 'Enter time in HH:MM format (e.g., 09:00 or 14:30)'
    }
    return true
  },
}
```

When `admin.condition` is false, PayloadCMS skips both `required` and
your custom `validate` entirely. When it's true, it runs both normally.

### The exception: a field a hook fills for you (Events `title`)

A field that a `beforeChange` hook auto-fills has to break the rule above, and
the reason is worth knowing: **no field hook runs in the browser**. Server-side
the order is hooks → `validate` (`payload/dist/fields/hooks/beforeChange/promise.js`
— hooks at line 58, `validate` at 86), so the value is already filled by the time
it's checked. The admin panel validates _before_ sending the request, with no
hook to fill anything — so `required` refuses the blank field outright and the
"leave it blank and we'll write it for you" workflow is unreachable.

Permitting the blank in `validate` unblocks the browser but disarms `required`,
because supplying `validate` **replaces** the default that enforces it
(`payload/dist/fields/config/sanitize.js` installs the default only when
`validate === undefined` — which is also why a custom validator must compose
with `text` from `payload/shared` or it silently drops `maxLength`).

So put the guarantee where the knowledge is. `src/collections/Events/hooks/eventTitle.ts`:

- the **hook** throws a `ValidationError` against the field when the auto-fill
  comes up empty — it is the only party that knows whether it actually had
  anything to work from;
- the **validator** answers only the cheap question the browser can answer (is a
  value _plausible_), and never pretends to be the enforcement.

Don't reach for `event: 'submit'` to tell browser from server — Payload's server
path passes `event: 'submit'` too, so it discriminates nothing.

## `defaultPopulate`

`defaultPopulate` controls what's included **only when a doc is loaded
through a relationship** (depth ≥ 1). It does **not** affect direct
queries.

Use it to exclude expensive virtual fields from relationship hydration:

```typescript
export const Meditations: CollectionConfig = {
  slug: 'meditations',
  defaultPopulate: { tagAssignments: false }, // skip during relationship population
  fields: [
    {
      name: 'tagAssignments',
      type: 'group',
      // each subfield's afterRead runs a user-choices query per row
      fields: [virtualJoinField({ name: 'asMorningMeditation', on: 'morningMeditation' })],
    },
  ],
}
```

To **test** `defaultPopulate`, query through a relationship — direct
queries always include all fields:

```typescript
// ❌ Direct query always includes virtual fields
const m = await payload.findByID({ collection: 'meditations', id })
expect(m.tagAssignments).toBeFalsy() // FAILS

// ✅ Test through a populating relationship
const lesson = await payload.findByID({ collection: 'lessons', id, depth: 1 })
expect((lesson.meditation as Meditation).tagAssignments).toBeFalsy()
```

### `defaultPopulate` does **not** cover the list view

It only applies to relationship hydration. A list read is a plain `find`, so an
expensive `afterRead` still runs once per row — 25 rows, 25 fan-outs. The guard
for that is the **`findMany`** flag Payload passes to every field hook (`true`
for `find`, absent for `findByID`):

```typescript
hooks: {
  afterRead: [
    async ({ data, req, findMany }) => {
      if (findMany) return null   // list read — don't pay the per-row cost
      return computeSomethingExpensive(data, req)
    },
  ],
}
```

Pair it with a cheap **stored** column for anything the list actually needs to
sort or filter on (`Events.qualityOpenCount` is that column for the
listing-quality report — see `src/lib/eventQuality/`). Test it by asserting the
field is null on a `payload.find()`; removing the guard must make that fail.

### A nested read of another locale must not reuse the caller's `req`

`locale` is **not** a per-call argument to the Local API. `createLocalReq`
assigns it straight onto the request object you hand over
(`payload/dist/utilities/createLocalReq.js`):

```js
req.locale =
  localeCandidate && typeof localeCandidate === 'string' ? localeCandidate : defaultLocale
req.fallbackLocale = sanitizedFallback
```

So `payload.findByID({ locale: 'all', req })` inside a hook doesn't scope `all`
to that read — it **repoints the caller's whole request** for the rest of its
life. In a hook that runs during a write, every later step of that write then
runs under the wrong locale, and a localized field's value is silently dropped:
the operation reports success and persists nothing. That was a real bug in the
Events quality report (#609) — a German title saved on a published event
vanished, with no error.

Pass a copy whenever the nested call reads a **different** locale than the
caller:

```typescript
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

const doc = await req.payload.findByID({
  collection: 'events',
  id,
  locale: 'all',
  select: { title: true },
  req: localeIsolatedReq(req), // not `req`
})
```

`context`, `transactionID`, `user` and `payload` still travel by reference, so
memoization, the transaction and access control are unaffected — only
`locale`/`fallbackLocale` become the copy's own. Not needed when the nested call
uses the caller's own locale.

### A virtual field's `afterRead` must not join the caller's transaction

The sibling trap, and a nastier one: **`afterRead` also runs on the response of
a `create`/`update`**, while that write's transaction is still open. A nested
read that forwards `req` joins it — and if that read goes wrong, it takes the
_write_ down with it:

```typescript
// ❌ inside a virtual field's afterRead — aborts the create it is decorating
const target = await req.payload.findByID({ collection: 'events', id, req })
```

The failure is silent and looks impossible: `payload.create` **returns a
document with an id**, and no row exists afterwards. `disableErrors: true` does
not save you — the read resolving to `null` is not the problem, the shared
transaction is. In #641 this rolled back every event-submission create that
named a target event, and only those, because only they took the branch that
issued the nested read.

Drop `req` from the nested call. A virtual field is a **projection of committed
state**, so its own connection is the correct one:

```typescript
// ✅ its own connection; `req` still keys the per-request memo
return memoizeOnRequest(req, `target:${id}`, () =>
  req.payload.findByID({ collection: 'events', id, depth: 0, overrideAccess: true }),
)
```

Keep passing `req` when the nested call genuinely must see the caller's
uncommitted writes — a `beforeChange` hook reading a row the same operation just
wrote. A read-only projection never does.

### A field hook's relationship values are bare ids, at any depth

Relationship population happens elsewhere in the read, so inside a field hook
`data.<rel>` is the raw id **regardless of the `depth` the caller asked for**.
Rendering one straight into a user-facing projection prints a row number:
`proposedChanges` showed `Manager: 496` because the value looked populated at
`depth: 1` from the outside.

Resolve it explicitly, memoized, and — per the section above — **without**
forwarding `req`:

```typescript
function loadManager(req: PayloadRequest, managerId: number) {
  return memoizeOnRequest(req, `submissionManager:${managerId}`, () =>
    req.payload.findByID({
      collection: 'managers',
      id: managerId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    }),
  )
}
```

`memoizeOnRequest` (`@/lib/utilities/requestMemo`) matters when two hooks on the
same document need the same doc — `computePreviewEvent` and
`computeProposedChanges` share one load this way. Fall back to the raw id if the
row is gone, so a deleted manager degrades to `#496` rather than blanking the
line.

The neighbouring trap: a **populated** relationship is a plain object, so any
code that treats "plain object ⇒ a group to expand" will render the whole row.
`proposedChanges` had to special-case `relationship`/`upload` as references to
_name_, or a proposed manager came out as their id, roles, email and every
notification preference.

## Activity logs (`logField`)

"What happened to this document, and when?" is a question managers ask —
emails sent about it, but also a registration created or cancelled, a listing
verified. Answering it from application logs or the database is not an answer.

```typescript
import { logField } from '@/fields'

logField({ description: 'Everything recorded about this registration.' })
// → an `activityLog` field, "Activity Log", read-only, rendered
```

`name` and `label` default to `activityLog` / "Activity Log" and are overridable
for a document that needs a second log. Both current consumers use the default:
Events resets its log on every verification, Registrations accumulates.

### Columns are declared on the field

`logField({ columns: [{ key: 'activity', label: 'Event' }, …] })` — they travel
to the renderer in `admin.custom`, the same way `SelectDescription` and
`EventQualityPanel` get theirs. Declaring them fixes order and headings even
before any entry carries the cell; omit `columns` and the table derives them
from the union of the entries' `cells`, which keeps a new log zero-config.

A column reads the matching key from an entry's **`cells`**.

Everything outside `cells` is machine data and never renders — `at`, `type`
(the slug jobs match on, never a label), `key` (the exactly-once key), plus
whatever the writer needs to read back. That default matters: a verification
entry carries ten such fields, and with the rule the other way round that log
rendered a fourteen-column table of raw enum values.

| Key     | Meaning                                                                |
| ------- | ---------------------------------------------------------------------- |
| `at`    | ISO timestamp. Always the first column, and what the log sorts by.     |
| `type`  | Stable slug (`session-reminder`, `verification`) — matched, not shown. |
| `key`   | Exactly-once key, scoped to `type`.                                    |
| `cells` | What the columns read. Everything else is data.                        |

Nothing is hidden by not having a column: every row's trailing **⋯** opens the
whole entry as JSON in a popover, which is where a reminder's stage, level and
recipient live.

A cell is a string, or `{ label?, text, sub? }` — `label` renders muted inline
before the text (`email: a@b.test`), `sub` as a muted line beneath it (a
recipient's role and region under their name). Those two options are what
replaced the verification log's hand-written cell components.

Columns come from the **union** of entries, not the newest: a log whose latest
entry is a cancellation would otherwise drop the recipient column and hide what
it holds for every email above it.

### Writing entries

```typescript
import { appendLogEntry, asLog, hasLogEntry } from '@/fields'

const log = asLog(registration.activityLog)
if (hasLogEntry(log, 'session-reminder', occurrenceIso)) continue // exactly-once guard
// …send…
data: {
  activityLog: appendLogEntry(log, {
    at,
    type: 'session-reminder',
    key: occurrenceIso,
    cells: {
      activity: `Session reminder for ${date}`,
      sentTo: { label: 'email', text: address },
    },
  })
}
```

Three things worth knowing:

- **`appendLogEntry` caps the log** (`DEFAULT_LOG_LIMIT`, oldest dropped). Use it
  rather than `[...log, entry]`: a reminder log on a weekly class gains an entry
  per occurrence, read and rewritten on every send, and nothing bounded it
  before this existed.
- **Match on `type` _and_ `key`.** One log holds several kinds of entry, so a
  bare key collides — registration 42's follow-up must not read as its reminder.
- **Display is additive, never a replacement.** Entries are read back as _data_:
  `hasReminderForStage` decides whether to send by reading an entry's `stage` and
  `manager.id`. An entry builder adds a `cells` block beside those fields — see
  `buildReminderEntry`, which is where that log's wording lives precisely
  because it is the code that knows the domain.
- **A log is a record, not a query filter.** Nothing can `where` on a JSON column
  cheaply, so a sweep that needs to _find_ documents still wants a real dated
  column beside the log. `Registrations.followUpSentAt` is exactly that: the log
  says what happened, the column is what the query selects on.

## Plugins

### SEO (`@payloadcms/plugin-seo`)

Applied to Pages. Title template `We Meditate — {title}`, description
from page content, tabbed admin UI. Configured in `src/payload.config.ts`.

### Form Builder (`@payloadcms/plugin-form-builder`)

Auto-generates `forms` (admin group: Resources) and `form-submissions`
(admin group: System). Default email `contact@sydevelopers.com`. Standard
permission-based access.

### Slug generation (`slugField` from `payload`)

```typescript
import { slugField } from 'payload'

slugField({ useAsSlug: 'title' }) // returns a RowField, no spread
```

`unique: true` and `index: true` are hardcoded; default
`position: 'sidebar'`. Customize description via `overrides`:

```typescript
slugField({
  useAsSlug: 'name',
  overrides: (field) => {
    if (field.fields[1].type === 'text') {
      field.fields[1].admin = {
        ...field.fields[1].admin,
        description: 'URL-friendly identifier (auto-generated from name)',
      }
    }
    return field
  },
})
```

## Localization (19 locales)

Configured in `src/payload.config.ts` via `buildPayloadLocales()` from
`src/lib/locales/index.ts`. Default locale: `en`. Fallback enabled — non-English
locales fall back to English. Farsi (`fa`) has `rtl: true`. Compound codes use
BCP-47 form (lowercase language, uppercase region). Locale labels come from the
`iso-639-1` package with overrides for `pt-BR` (Brazilian Portuguese), `en-AU`
(Australian English), and `fa` (Farsi/Persian).

Supported: `en`, `es`, `de`, `it`, `fr`, `ru`, `ro`, `cs`, `uk`, `el`,
`hy`, `pl`, `pt-BR`, `fa`, `bg`, `tr`, `en-AU`, `hu`, `nl`.

### Admin locale filtering (`filterAvailableLocales`)

`src/plugins/access/filterAvailableLocales.ts` controls which locales appear
in the admin locale selector:

| User                             | Locales shown                                                  |
| -------------------------------- | -------------------------------------------------------------- |
| Unauthenticated                  | English only (login page)                                      |
| Admin managers                   | All 19                                                         |
| API clients                      | All (filter only applies to admin UI)                          |
| Regular managers                 | exactly the locales where they have ≥ 1 role, most roles first |
| Managers with roles in no locale | English only                                                   |
| Inactive managers                | English only                                                   |

A manager with `{ en: ['translator'], cs: ['meditations-editor'] }` sees
English + Czech — not German/French/etc.

**English is not force-added** (#665). A manager holding roles only in French
sees French alone, and Payload lands them there — the forced English entry used
to make their own locale unreachable. The first entry is both the top of the
dropdown and the landing locale, so the ordering is a real behaviour, not
cosmetics. See `docs/rules/access.md` § "How per-locale roles reach `req.user`".

### Field-level localization

Mark fields `localized: true`. Currently localized fields include:

- `UserChoices` / `SongTags`: `title`
- `Media`: `alt`, `credit`
- `Songs`: `title`, `credit`
- (Many other content-collection fields — see individual collection files.)

### Meditations locale handling (special)

Meditations don't use field-level localization — each meditation **is**
a single-locale document:

- `locale` select field with all 19 options, default `en`.
- `filterMeditationsByLocale` (beforeOperation hook in
  `src/collections/Meditations/hooks/`) adds `{ locale: { equals: req.locale } }`
  to `find`/`count` operations.
- `findByID` returns the specific doc regardless of locale.
- `locale=all` bypasses filtering.

```bash
GET /api/user-choices?locale=en
GET /api/meditations?locale=cs    # Czech meditations only
GET /api/songs?locale=cs
```

## Pages collection

`src/collections/Pages/Pages.ts`. Lexical rich text with embedded
blocks, drafts (60 s autosave), version history (3 / doc), scheduled
publishing.

### Core fields

- `title` (text, required, localized)
- `slug` (auto-generated via `slugField`)
- `content` (richText, localized) — Lexical editor with embedded blocks
- `_status` (draft | published) — Payload drafts
- `author` (relationship to authors, optional)
- `tags` (relationship hasMany, optional)

Per-locale publishing via `publishSpecificLocale` API option (tracks
`published_locale` in versions table).

Live preview integrates with the We Meditate Web frontend
(`WEMEDITATE_WEB_URL` env var).

### Page blocks (`src/lib/richEditor/blocks/`)

| Block               | Notes                                                                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TextBoxBlock`      | `style` (splash / leftAligned / rightAligned / overlay), `title`/`text` (250-char limit, HTML stripped), `image`, `link`, `actionText`                                                                                                                   |
| `ButtonBlock`       | `text` + `url`                                                                                                                                                                                                                                           |
| `LayoutBlock`       | `style` (grid / columns / accordion) + `items` array (image, title, text, link)                                                                                                                                                                          |
| `GalleryBlock`      | `title`, `collectionType` (media/meditations/pages), `items` (max 10, dynamic relationTo)                                                                                                                                                                |
| `QuoteBlock`        | `title`, `text` (textarea, required), `credit`, `caption` (shown when credit exists)                                                                                                                                                                     |
| `CatalogBlock`      | `items` relationship hasMany, min 3 / max 6, supports meditations + pages                                                                                                                                                                                |
| `ContentIndexBlock` | `type` select (meditations/pages/songs/lectures), `limit` (1–100), per-type filter fields (only the active filter survives via `clearWhenTypeNot` hooks), virtual `apiEndpoint` (computed by `computeApiEndpoint` afterRead — `null` if `limit` invalid) |

Custom block icons → see `src/lib/richEditor/blocks/AGENTS.md`.

### Tests

- `tests/int/pages.int.spec.ts` — main suite
- `tests/int/content-index-block.int.spec.ts` — pure-function tests on
  `computeApiEndpoint` + integration tests via the virtual field
- `tests/utils/testData.ts` has a `createPage()` factory

## Lessons collection ("Path Steps")

`src/collections/Lessons/Lessons.ts`. Slug `lessons`, admin labels
"Path Step" / "Path Steps".

### Fields

- `title` (text, required)
- `panels` (array, required, min 1) — story panels:
  - `title` (text, optional)
  - `text` (textarea, optional)
  - `media` (upload to files, optional) — image OR video
  - `subtitles` (json, optional, conditionally shown when media exists)
- `introAudio` (upload to files, optional)
- `introSubtitles` (json, optional)
- `meditation` (relationship to Meditations, optional) —
  `filterOptions: { type: { equals: 'lesson' } }`. When creating
  meditations for test lessons, set `type: 'lesson'`.
- `article` (richText, localized, optional) — Lexical with QuoteBlock
  support. **Not** a relationship to Pages — it's an inline rich text
  field within Lesson.
- `unit` (select, required) — Unit 1–4
- `step` (number, required)
- `icon` (relationship to Images, optional)

Trash (soft delete) supported. File attachments cascade-delete via the
ownership system.

## Trash (soft delete)

Collections with `trash: true`: Files, Images, **Events**.

**`payload.delete` is always a _hard_ delete, even on a trash-enabled
collection.** Its own `trash` argument only widens _which_ documents are
deletable (i.e. whether already-trashed ones can be targeted) — it does not
choose soft vs hard, and `deleteByID` never writes `deletedAt`. Trashing is
setting `deletedAt` yourself:

```typescript
// ✅ trash (recoverable from the admin trash view)
await payload.update({ collection: 'events', id, data: { deletedAt: new Date().toISOString() } })

// ⚠️ permanent, irreversible — not "move to trash"
await payload.delete({ collection: 'events', id })
```

The ExpireEvents job's `expired → trash` step and the Atlas importer's
archived-event handling both use the `update` form.

Use `deletedAt` in `where` clauses (`{ deletedAt: { exists: true|false } }`),
don't query `_status`.

### Trashed docs are invisible to a default query

Payload appends `deletedAt exists: false` to every read on a trash-enabled
collection unless you pass **`trash: true`** (`appendNonTrashedFilter`). That
flag _includes_ trashed docs alongside live ones — it does not filter to
only-trashed — and it's a no-op on collections without `trash`, so it's safe to
pass unconditionally.

This matters for any **existence check**: a trashed row still occupies its
natural key, so a lookup that omits `trash: true` reports "absent" and the caller
creates a duplicate. That was a live bug in the seed importers'
`preloadCollection` — `CleanupOrphanedMedia` trashes orphaned Files/Images, so a
later re-seed re-uploaded them instead of finding the trashed row (see
`tests/int/seed-importer-preload.int.spec.ts`).

**It applies to writes too, which is easier to miss.** An `update` addressing a
trashed row _by id_ throws `Not Found` without the flag — even when you got that
id from a query that did pass it. Two archived Atlas events failed on every seed
run for exactly this reason: `preloadCollection` handed `upsert` the right id and
the update then refused it. Fixing the read is not enough; every write that can
land on a trashed row needs the flag as well (#609):

```typescript
await payload.update({ collection: 'events', id, data, trash: true })
```

The asymmetry is worth a test of its own — assert the write **fails** without
the flag and succeeds with it, or the guard can be removed without anything
noticing (`tests/int/event-quality.int.spec.ts`).

The admin UI shows a "permanently delete" checkbox.

## Programmatic file upload

Payload expects a Node.js Buffer (not Web API File/Blob) when uploading
to upload collections (Media, Frames, Files, tag collections):

```typescript
// ✅
await payload.create({
  collection: 'user-choices',
  data: { title: 'My Tag', slug: 'my-tag' },
  file: {
    data: Buffer.from(svgContent, 'utf-8'),
    mimetype: 'image/svg+xml',
    name: 'my-tag.svg',
    size: buffer.length,
  },
})

// ❌ Web API File constructor — fails with
// "Expected the `input` argument to be of type `Uint8Array` or `ArrayBuffer`, got `undefined`"
const file = new File([blob], 'tag.svg', { type: 'image/svg+xml' })
```

For text files use `Buffer.from(content, 'utf-8')`. For binary files,
`fs.readFile()` returns a Buffer directly.

## Schema introspection (auto-discover field references)

To find every field that references a particular collection (e.g. all
fields pointing at `files` or `images`), use the helpers in
`src/jobs/CleanupOrphanedMedia/schemaUtils.ts` instead of hardcoding collection/field knowledge.

```typescript
import {
  discoverReferencesForCollection,
  extractIdsFromDocument,
  extractIdsFromLexicalContent,
  groupByCollection,
} from '@/jobs/CleanupOrphanedMedia/schemaUtils'

const fileRefs = discoverReferencesForCollection(payload, 'files')
// [{ collection: 'lessons', fieldPath: 'introAudio', fieldType: 'upload', ... },
//  { collection: 'lessons', fieldPath: 'panels.*.media', ... }]

const byCollection = groupByCollection(fileRefs)

for (const [slug, refs] of byCollection) {
  const docs = await payload.find({ collection: slug, limit: 1000 })
  for (const doc of docs.docs) {
    for (const ref of refs) {
      const ids = extractIdsFromDocument(doc, ref) // Set<number>
    }
  }
}
```

Container types traversed: simple, `tabs`, `groups`, `rows`, `arrays`
(wildcard `*`), `blocks`, `collapsible`, and `richText`. RichText fields
get a marker reference (`isLexicalBlock: true`) — at scan time, use
`extractIdsFromLexicalContent()` to walk the Lexical tree and pull out
all numeric IDs from block fields.

`CleanupOrphanedMedia` job uses this pattern to discover unreferenced
`files` and `images` without hardcoded knowledge.

### `parseInt` pitfall (relevant to ID extraction)

`parseInt('1748234234_abcdef', 10) === 1748234234` — it parses the
leading digits and silently ignores non-numeric suffixes. Validate
strings are fully numeric before parsing:

```typescript
function isNumericString(s: string): boolean {
  return /^\d+$/.test(s)
}

function extractId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && isNumericString(value)) return parseInt(value, 10)
  return null
}
```

This caught a real bug in schema introspection where Lexical block IDs
like `'1748234234_abcdef'` were being parsed as valid IDs.

## Schedule field

`scheduleFields()` (`src/fields/scheduleFields.ts`) is a Group field with
native sub-fields stored in individual DB columns. The `firstDate` field
uses `timezone: true`, which stores the datetime in UTC and auto-creates
a companion `firstDate_tz` for the IANA timezone. Used by **Events** and
**AppCards**, so a change here lands on both (and on their version tables).

Two virtual fields are computed on read using
[`rrule-temporal`](https://www.npmjs.com/package/rrule-temporal):

- **`icalRule`** (text) — iCalendar string with DTSTART, RRULE, and
  optional EXDATE lines for both recurring and one-off events. One-off
  events produce `FREQ=DAILY;COUNT=1`. Returns `null` only when
  `firstDate` is missing.
- **`upcomingDates`** (json) — array of up to 10 ISO 8601 UTC date
  strings representing the next occurrences from now. Computed via
  `rule.between()` with correct DST handling. Excludes EXDATE entries.
  Returns `[]` when `firstDate` is missing or all occurrences are in the
  past.

Both hooks delegate to a shared `buildRRuleTemporal()` helper.

And one **stored** derived column, recomputed on every write (#603):

- **`lastDate`** (date, indexed, `admin.hidden`) — end of the final occurrence's
  **local** day (23:59:59.999 in `firstDate_tz`) as a UTC instant, or `null` when
  the recurrence never ends. Computed by the `computeLastDate` `beforeChange`
  field hook from the pure `lastOccurrenceEnd()`; the column is just that
  function's DB-queryable projection. A real column rather than a virtual field
  precisely so "has this schedule run out?" can appear in a `where` — the public
  event feeds filter on it (see `docs/rules/api-clients.md`).

  Two things to know if you touch it:
  - **Termination is read off the built rule's own `options()`**, not re-derived
    from the sub-fields, so it can't drift from `buildRRuleTemporal`'s conditions
    (a positive `count`, a parseable `untilDate`). An open-ended rule returns
    `null` _before_ `all()` is called — `all()` on an infinite rule would run to
    its iteration cap.
  - **The partial-update trap.** A field `beforeChange` hook receives only the
    incoming patch, and Payload materialises an empty `{}` for a group the patch
    omits — so computing from `siblingData` alone would NULL the column on every
    unrelated write. `computeLastDate` computes from
    `{ ...previousSiblingDoc, ...siblingData }`: a partial schedule patch
    recomputes correctly, an unrelated patch is a no-op, and any write back-fills
    a NULL for free. Spread, not deep merge — an explicit `null` in the patch (a
    cleared `recurrenceType`) must win.

  Existing rows are brought up to date by
  `scripts/backfill-schedule-last-date.ts`.

### Why rrule-temporal (not rrule)

Legacy `rrule` (v2.8.1) has a [double-timezone-conversion bug](https://github.com/jkbrzt/rrule/issues/355):
its `dateInTimeZone()` treats `dtstart`'s UTC slot values as real UTC and
applies the timezone offset again, producing environment-dependent
results. `rrule-temporal` handles timezones natively via
`Temporal.ZonedDateTime`, eliminating this class of bugs entirely.

### UTC → ZonedDateTime conversion

```typescript
const dtstart = Temporal.Instant.from(fields.firstDate).toZonedDateTimeISO(timezone)
```

This is one step (replacing the old multi-step
`Intl.DateTimeFormat → formatToParts → manual extraction → ZonedDateTime.from`).
The `getLocalTimeHHMM()` helper uses the same pattern for `endTime`
validation.

### Stored-value conventions

| Field            | Stored values                                          | RFC 5545 alignment                                      |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `recurrenceType` | `'DAILY'`, `'WEEKLY'`, `'MONTHLY'`                     | matches `freq` directly                                 |
| `weekdays`       | `'MO'`, `'TU'`, `'WE'`, `'TH'`, `'FR'`, `'SA'`, `'SU'` | matches `byDay`                                         |
| `weekdayOfMonth` | `'MO'`–`'SU'`                                          | matches RFC 5545 day codes                              |
| `weekNumber`     | `'1'`–`'4'`, `'-1'`                                    | combined with weekday for `byDay` (e.g., `1MO`, `-1FR`) |

### `ScheduleSummary` (afterInput component)

Client component registered as `beforeInput` on the schedule group;
human-readable description that updates in real time. For recurring
events, builds an iCalendar string (DTSTART + RRULE) from form values
and runs it through `toText()` from `rrule-temporal/totext`. For one-off
events, formats with `Intl.DateTimeFormat`. Uses `useAllFormFields()`
for reactive access to schedule sub-fields.

### Key files

- `src/fields/scheduleFields.ts` — group field factory
- `src/lib/schedule/scheduleHooks.ts` — `buildRRuleTemporal`, `computeIcalRule`,
  `computeUpcomingDates`, `lastOccurrenceEnd`, `computeLastDate`,
  `cleanupExpiredExclusions`, `getLocalTimeHHMM`
- `src/lib/schedule/scheduleStatus.ts` — `shouldFinish` ("has this schedule run
  out?", shared by the ExpireEvents sweep, the public feeds, and registration)
- `src/lib/schedule/backfillLastDate.ts` — recompute `lastDate` on existing rows
- `src/types/schedule.ts` — `EventSchedule` (the stored group, derived from
  `Event['schedule']`) and `ExclusionRange`. Anything reading a schedule off a
  document or merging a patch takes `Partial<EventSchedule>`, written out rather
  than aliased
- `src/components/admin/ScheduleSummary.tsx` — afterInput component
- `src/components/admin/FlatArrayField/FlatArrayField.tsx` — custom
  array field for exclusions (flat rows, no per-row Collapsible)
- `tests/unit/schedule-hooks.spec.ts` — DST transition tests included
- `tests/unit/schedule-status.spec.ts` — `shouldFinish`, and the matrix pinning it
  to agree with `notFinishedWhere`
- `tests/int/schedule-last-date-backfill.int.spec.ts` — backfill side effects
