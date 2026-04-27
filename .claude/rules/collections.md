---
paths:
  - src/collections/**/*.ts
  - src/fields/**/*.ts
---

# Collections & Fields

Rules for PayloadCMS collections, custom fields, and the patterns
specific to this codebase.

## Access control is automatic

`accessPlugin` applies access control, `admin.hidden`, and field-level
access automatically. Collections **do not** need manual `access` config.

```typescript
// src/payload.config.ts (already wired up)
import { accessPlugin, bypassPermissions } from '@/lib/access'

plugins: [accessPlugin({ enabled: true, bypassPermissions })]
```

For custom logic outside collections, use `hasPermission`:

```typescript
import { hasPermission } from '@/lib/access'

const canUpdate = hasPermission({
  user,
  collection: 'meditations',
  operation: 'update',
})
```

Permission flow (in order):
1. Block null users.
2. Bypass function (admin → allow; inactive → deny; `customResourceAccess` → allow; self-access → allow).
3. Extract roles (flat array for clients, localized for managers).
4. Per-role check: implicit project read access, explicit permissions, translate-only for localized field updates.
5. Default: deny.

Behaviors worth knowing:
- **Implicit read access**: managers and clients can read everything in
  their role's project + collections that aren't in any project.
- **Manager roles are per-locale** (uses `req.locale`).
- **Client roles apply uniformly across all locales.**

Full RBAC details: see `.claude/rules/access.md` (loads when editing
`src/lib/access/`).

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

## `defaultPopulate`

`defaultPopulate` controls what's included **only when a doc is loaded
through a relationship** (depth ≥ 1). It does **not** affect direct
queries.

Use it to exclude expensive virtual fields from relationship hydration:

```typescript
export const Meditations: CollectionConfig = {
  slug: 'meditations',
  defaultPopulate: { randomSongUrl: false },  // skip during relationship population
  fields: [
    {
      name: 'randomSongUrl',
      type: 'text',
      virtual: true,
      hooks: { afterRead: [randomSongUrlAfterRead] },  // 2 DB queries per read
    },
  ],
}
```

To **test** `defaultPopulate`, query through a relationship — direct
queries always include all fields:

```typescript
// ❌ Direct query always includes virtual fields
const m = await payload.findByID({ collection: 'meditations', id })
expect(m.randomSongUrl).toBeFalsy()  // FAILS

// ✅ Test through a populating relationship
const lesson = await payload.findByID({ collection: 'lessons', id, depth: 1 })
expect((lesson.meditation as Meditation).randomSongUrl).toBeFalsy()
```

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

slugField({ useAsSlug: 'title' })  // returns a RowField, no spread
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

## Localization (16 locales)

Configured in `src/payload.config.ts` via `buildPayloadLocales()` from
`src/lib/locales.ts`. Default locale: `en`. Fallback enabled — non-English
locales fall back to English. Farsi (`fa`) has `rtl: true`. Locale labels
come from the `iso-639-1` package with overrides for `pt-br` (Brazilian
Portuguese) and `fa` (Farsi/Persian).

Supported: `en`, `es`, `de`, `it`, `fr`, `ru`, `ro`, `cs`, `uk`, `el`,
`hy`, `pl`, `pt-br`, `fa`, `bg`, `tr`.

### Admin locale filtering (`filterAvailableLocales`)

`src/lib/access/filterAvailableLocales.ts` controls which locales appear
in the admin locale selector:

| User | Locales shown |
|---|---|
| Unauthenticated | English only (login page) |
| Admin managers | All 16 |
| API clients | All (filter only applies to admin UI) |
| Regular managers | English (always) + locales where they have ≥ 1 role |
| Inactive managers | English only |

A manager with `{ en: ['translator'], cs: ['meditations-editor'] }` sees
English + Czech — not German/French/etc.

### Field-level localization

Mark fields `localized: true`. Currently localized fields include:
- `UserChoices` / `SongTags`: `title`
- `Media`: `alt`, `credit`
- `Songs`: `title`, `credit`
- (Many other content-collection fields — see individual collection files.)

### Meditations locale handling (special)

Meditations don't use field-level localization — each meditation **is**
a single-locale document:

- `locale` select field with all 16 options, default `en`.
- `filterMeditationsByLocale` (beforeOperation hook in
  `src/hooks/meditationHooks.ts`) adds `{ locale: { equals: req.locale } }`
  to `find`/`count` operations.
- `findByID` returns the specific doc regardless of locale.
- `locale=all` bypasses filtering.

```bash
GET /api/user-choices?locale=en
GET /api/meditations?locale=cs    # Czech meditations only
GET /api/songs?locale=cs
```

## Pages collection

`src/collections/content/Pages.ts`. Lexical rich text with embedded
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

### Page blocks (`src/blocks/pages/`)

| Block | Notes |
|---|---|
| `TextBoxBlock` | `style` (splash / leftAligned / rightAligned / overlay), `title`/`text` (250-char limit, HTML stripped), `image`, `link`, `actionText` |
| `ButtonBlock` | `text` + `url` |
| `LayoutBlock` | `style` (grid / columns / accordion) + `items` array (image, title, text, link) |
| `GalleryBlock` | `title`, `collectionType` (media/meditations/pages), `items` (max 10, dynamic relationTo) |
| `QuoteBlock` | `title`, `text` (textarea, required), `credit`, `caption` (shown when credit exists) |
| `CatalogBlock` | `items` relationship hasMany, min 3 / max 6, supports meditations + pages |
| `ContentIndexBlock` | `type` select (meditations/pages/songs/lectures), `limit` (1–100), per-type filter fields (only the active filter survives via `clearWhenTypeNot` hooks), virtual `apiEndpoint` (computed by `computeApiEndpoint` afterRead — `null` if `limit` invalid) |

Custom block icons → see `.claude/rules/blocks.md`.

### Tests

- `tests/int/pages.int.spec.ts` — main suite
- `tests/int/content-index-block.int.spec.ts` — pure-function tests on
  `computeApiEndpoint` + integration tests via the virtual field
- `tests/utils/testData.ts` has a `createPage()` factory

## Lessons collection ("Path Steps")

`src/collections/content/Lessons.ts`. Slug `lessons`, admin labels
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

## Trash (soft delete) on Files / Images

Collections with `trash: true` (Files, Images) soft-delete on first
delete and permanently delete on second delete:

```typescript
await payload.delete({ collection: 'files', id })             // moves to trash (sets deletedAt)
await payload.delete({ collection: 'files', id, trash: true })// trashed → permanently delete
```

`deletedAt` is automatically managed by Payload — use it in `where`
clauses (`{ deletedAt: { exists: true|false } }`), don't query `_status`.

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
`src/lib/schemaUtils.ts` instead of hardcoding collection/field knowledge.

```typescript
import {
  discoverReferencesForCollection,
  extractIdsFromDocument,
  extractIdsFromLexicalContent,
  groupByCollection,
} from '@/lib/schemaUtils'

const fileRefs = discoverReferencesForCollection(payload, 'files')
// [{ collection: 'lessons', fieldPath: 'introAudio', fieldType: 'upload', ... },
//  { collection: 'lessons', fieldPath: 'panels.*.media', ... }]

const byCollection = groupByCollection(fileRefs)

for (const [slug, refs] of byCollection) {
  const docs = await payload.find({ collection: slug, limit: 1000 })
  for (const doc of docs.docs) {
    for (const ref of refs) {
      const ids = extractIdsFromDocument(doc, ref)  // Set<number>
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

`scheduleField()` (`src/fields/scheduleField.ts`) is a Group field with
native sub-fields stored in individual DB columns. The `firstDate` field
uses `timezone: true`, which stores the datetime in UTC and auto-creates
a companion `firstDate_tz` for the IANA timezone.

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

| Field | Stored values | RFC 5545 alignment |
|---|---|---|
| `recurrenceType` | `'DAILY'`, `'WEEKLY'`, `'MONTHLY'` | matches `freq` directly |
| `weekdays` | `'MO'`, `'TU'`, `'WE'`, `'TH'`, `'FR'`, `'SA'`, `'SU'` | matches `byDay` |
| `weekdayOfMonth` | `'MO'`–`'SU'` | matches RFC 5545 day codes |
| `weekNumber` | `'1'`–`'4'`, `'-1'` | combined with weekday for `byDay` (e.g., `1MO`, `-1FR`) |

### `ScheduleSummary` (afterInput component)

Client component registered as `beforeInput` on the schedule group;
human-readable description that updates in real time. For recurring
events, builds an iCalendar string (DTSTART + RRULE) from form values
and runs it through `toText()` from `rrule-temporal/totext`. For one-off
events, formats with `Intl.DateTimeFormat`. Uses `useAllFormFields()`
for reactive access to schedule sub-fields.

### Key files

- `src/fields/scheduleField.ts` — group field factory
- `src/hooks/scheduleHooks.ts` — `buildRRuleTemporal`, `computeIcalRule`,
  `computeUpcomingDates`, `cleanupExpiredExclusions`, `getLocalTimeHHMM`,
  type definitions
- `src/components/admin/ScheduleSummary.tsx` — afterInput component
- `src/components/admin/FlatArrayField/FlatArrayField.tsx` — custom
  array field for exclusions (flat rows, no per-row Collapsible)
- `tests/int/schedule-hooks.int.spec.ts` — DST transition tests included
