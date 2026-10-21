# Collections & Fields

Rules for PayloadCMS collections, custom fields, and the patterns specific
to this codebase. This guide also covers `src/fields/`.

## Access control is automatic

`accessPlugin` applies access control, `admin.hidden`, and field-level
access automatically. Collections **do not** need a manual `access` config.

A custom **endpoint** gates on `requireManagerPermission`, or
`requireCollectionPermission` where an API client is a legitimate caller too:

```typescript
import { requireManagerPermission } from '@/lib/endpoints'

const denied = requireManagerPermission({
  req,
  collection: 'meditations',
  operation: 'update',
  forbidden: 'You do not have permission to transcribe this meditation.',
})
if (denied) return denied
```

⚠ **Never call `hasPermission` here** — the gates own its locale-scope
argument, and a check written out at a handler is free to omit it (#701,
#665). `tests/unit/endpoint-permission-gate.spec.ts` fails one under
`src/collections/**` or `src/endpoints/**`. What goes wrong without the
scope is in the gate's own docblock; the rule is in `docs/rules/endpoints.md`.

Worth knowing: **implicit read access** lets managers and clients read
everything in their role's project, plus collections in no project.
**Manager roles are per-locale** (uses `req.locale`). **Client roles apply
uniformly across all locales.** **Version history and a login
lockout both follow `update`, not `read`** — `withDerivedGrants` derives
`readVersions` and `unlock` from the collection's edit authority in one
pass, so a read-only role reaches no drafts through
`/api/{collection}/versions` (#719) and no API key can reset a locked
account's failed-attempt counter through `/api/{collection}/unlock`
(#748) — a route both auth collections now refuse outright (#840), while the
grant stays derived. See `docs/rules/access.md`.

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

// ❌ An empty object is not assignable to Where
filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : {})
```

## Conditional validation pattern

When a field has both `required: true` and a custom `validate`, do **not**
return `true` for null/empty values inside `validate` — PayloadCMS already
skips validation when `admin.condition` is false. Returning `true` for null
in your validator silently overrides `required`, allowing null saves even
when the field is visible.

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

When `admin.condition` is false, PayloadCMS skips both `required` and your
`validate` entirely. When it is true, it runs both.

**Supplying `validate` replaces Payload's default validator.**
`payload/dist/fields/config/sanitize.js` installs the default only when
`validate === undefined`, and the default is what enforces `required` and
the type's own checks (`maxLength` on text, the id shape on a
relationship, the schema on JSON). Compose with the type's validator from
`payload/shared` instead of replacing it.

**A field a `beforeChange` hook auto-fills breaks the rule above**, because
no field hook runs in the browser: the hook enforces, and the validator never
pretends to — see `src/collections/Events/AGENTS.md` (Events `title`). Don't reach for `event: 'submit'` to tell browser from
server — Payload's server path also passes `event: 'submit'`.

### A custom `validate` on a relationship silently disarms `filterOptions`

The `maxLength` trap above has a sharper twin, because here the thing dropped
is a write refusal rather than a length check. **`filterOptions` narrows the
admin picker; what applies it at save time is `validateFilterOptions`, and that
lives inside Payload's own `relationship` validator** — installed only when the
field supplies no `validate` of its own (`fields/config/sanitize.js`). So a
relationship that declares both gets the picker narrowing and **nothing
enforcing it**: an API `PATCH` naming any id the collection holds is accepted.

Compose, exactly as a custom `text` validator composes `text`:

```typescript
import { relationship } from 'payload/shared'

validate: async (value, options) => {
  const standard = await relationship(value, {
    ...options,
    relationTo: 'regions',
    filterOptions: myFilterOptions, // the same function the field declares
    required: true,
  } as never)
  if (standard !== true) return betterMessage(value, options) ?? standard
  return true
}
```

The class import's `targetRegion` (`src/plugins/eventImport/targetRegion.ts`)
is the smallest worked example: it composes `relationship` on create only, and
keeps Payload's own "invalid selection" wording. Pass `filterOptions` from one
shared constant, so the picker and the validator cannot narrow differently.

## `defaultPopulate`

`defaultPopulate` controls what's included **only when a doc is loaded
through a relationship** (depth ≥ 1). It does not affect direct queries.

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

To **test** it, query through a relationship — a direct query always
includes every field:

```typescript
// ❌ Direct query always includes virtual fields
const m = await payload.findByID({ collection: 'meditations', id })
expect(m.tagAssignments).toBeFalsy() // FAILS

// ✅ Test through a populating relationship
const lesson = await payload.findByID({ collection: 'lessons', id, depth: 1 })
expect((lesson.meditation as Meditation).tagAssignments).toBeFalsy()
```

### `defaultPopulate` does **not** cover the list view

It only applies to relationship hydration. A list read is a plain `find`,
so an expensive `afterRead` still runs once per row — 25 rows, 25 fan-outs.
Guard that with the **`findMany`** flag Payload passes to every field hook
(`true` for `find`, absent for `findByID`):

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

Pair it with a cheap **stored** column for anything the list needs to sort
or filter on (`Events.qualityOpenCount` is that column for the
listing-quality report — see `src/lib/eventQuality/`). Test it by asserting
the field is null on a `payload.find()`. Removing the guard must fail that.

### A nested read of another locale must not reuse the caller's `req`

`locale` is not a per-call argument to the Local API. `createLocalReq`
assigns it straight onto the request object you pass in
(`payload/dist/utilities/createLocalReq.js`):

```js
req.locale =
  localeCandidate && typeof localeCandidate === 'string' ? localeCandidate : defaultLocale
req.fallbackLocale = sanitizedFallback
```

So `payload.findByID({ locale: 'all', req })` inside a hook does not scope
`all` to that one read — it **repoints the caller's whole request** for the
rest of its life. In a hook running during a write, every later step of
that write then runs under the wrong locale, and a localized field's value
is silently dropped: the operation reports success and persists nothing.
That was a real bug in the Events quality report (#609) — a German title
saved on a published event vanished, with no error.

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

`context`, `transactionID`, `user`, and `payload` still travel by
reference, so memoization, the transaction, and access control are
unaffected — only `locale`/`fallbackLocale` become the copy's own. Skip
this when the nested call uses the caller's own locale.

⚠ **Unless reads run concurrently on one `req` — then copy even for the
caller's own locale.** `createLocalReq` assigns both keys before the
operation reads them back (`payload/dist/collections/operations/find.js`
destructures `{ fallbackLocale, locale }` off `req` after its own
`await`), so a sibling read can land its assignment inside that window.
Payload awaits every field's `afterRead` in one `Promise.all`, which is
how the seven `wm-app-status` sections reached this (#982): every read a
section makes copies, and the machinery running them copies nothing — a
copy there cannot cover reads that differ inside one section, and it hides
a read that forgot its own. Omitting `fallbackLocale` is not the safe
choice either — it is sanitised back to the locale's own fallback, so it
undoes a `fallbackLocale: false` beside it.

### A virtual field's `afterRead` must not join the caller's transaction

A nastier version of the same trap: **`afterRead` also runs on the response
of a `create`/`update`**, while that write's transaction is still open. A
nested read that forwards `req` joins it — and if that read goes wrong, it
takes the _write_ down with it:

```typescript
// ❌ inside a virtual field's afterRead — aborts the create it is decorating
const target = await req.payload.findByID({ collection: 'events', id, req })
```

The failure is silent and looks impossible: `payload.create` **returns a
document with an id**, and no row exists afterward. `disableErrors: true`
does not save you — the shared transaction is the problem, not a `null`
resolution. In #641 this rolled back every event-submission create that
named a target event, and only those, because only they took the branch
with the nested read.

Drop `req` from the nested call. A virtual field is a **projection of
committed state**, so its own connection is the correct one:

```typescript
// ✅ its own connection; `req` still keys the per-request memo
return memoizeOnRequest(req, `target:${id}`, () =>
  req.payload.findByID({ collection: 'events', id, depth: 0, overrideAccess: true }),
)
```

Keep passing `req` only when the nested call genuinely must see the
caller's uncommitted writes — a `beforeChange` hook reading a row the same
operation just wrote. A read-only projection never does.

### A field hook's relationship values are bare ids, at any depth

Relationship population happens elsewhere in the read, so inside a field
hook `data.<rel>` is the raw id **regardless of the `depth` the caller
asked for**. Rendering one straight into a user-facing projection prints a
row number: `proposedChanges` showed `Manager: 496` because the value
looked populated at `depth: 1` from the outside.

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

`memoizeOnRequest` (`@/lib/utilities/requestMemo`) matters when two hooks
on the same document need the same doc — `computePreviewEvent` and
`computeProposedChanges` share one load this way. Fall back to the raw id
if the row is gone, so a deleted manager degrades to `#496` rather than
blanking the line.

**Where a value can arrive either way, narrow it with `extractID` from
`payload/shared`** — it takes an id or a row and answers the id. Hand-rolled
`typeof value === 'object' ? value.id : value` guards grew twice in one PR
(#968) because nothing said this. It reads `.id` unguarded, so a nullable
relationship still needs its own null check first.

The neighboring trap: a **populated** relationship is a plain object, so
code that treats "plain object ⇒ a group to expand" renders the whole row.
`proposedChanges` had to special-case `relationship`/`upload` as
references to _name_, or a proposed manager came out as their id, roles,
email, and every notification preference.

## A JSON column declares its shape (#659, #726)

`type: 'json'` with no `jsonSchema` accepts anything and generates
`{ [k: string]: unknown } | unknown[] | string | number | boolean | null`.
Declaring a schema buys both halves at once: Payload compiles an Ajv
validator for writes **and** substitutes the schema into
`payload-types.ts`, so the column's consumers stop restating its shape by
hand.

**`jsonField` (`src/fields/jsonField.ts`) is the one way to declare a JSON
column.** It takes a `schemaTitle`, a shape, and the rest of the field, and
derives `type`, `uri`, `fileMatch`, `$id` and `title` from the first two — nothing
else may build a `jsonSchema` literal, and no `*_SCHEMA_URI` constant exists
to import. It is the module's only export, so there is no bare `jsonSchema`
to attach to a field that skipped it.

```typescript
jsonField({
  name: 'frames',
  schemaTitle: 'MeditationFrames',
  schema: z.array(z.looseObject({
    id: z.union([z.int(), z.string()]).describe('The Frame document id.'),
    timestamp: z.number().describe('Seconds into the meditation.'),
  })),
})
```

- **Declare the shape in Zod, inline at the field**, so a reader sees the
  column's shape where it is declared. `zod` is already a production
  dependency.
- **Zod idioms, and what each emits:** `z.strictObject` →
  `additionalProperties: false`. `z.looseObject` → `additionalProperties:
{}` (the same `[k: string]: unknown` as `true`). `z.literal(true)` →
  `{ type: 'boolean', const: true }`, which keeps a discriminator.
  `.describe()` → `description`, which becomes JSDoc on the generated
  property.
- **A raw `JSONSchema4` `schema` is for a shape assembled as data** — a
  `properties` map built by `Object.fromEntries` (`stringsSchema`), or
  `enum`s spliced from an exported const array
  (`Clients.canonical.verification`, `UserSubmissions.screeningResult`,
  `Clients.embedMetadata`). Round-tripping such a shape through Zod only
  to convert it back buys nothing. It is **not** a list of things Zod
  cannot express: Zod reaches `maxProperties` through `.meta()`, and its
  `enum`/`.nullable()` forms generate the same TypeScript as the bare
  ones. Assembly, not expressiveness, is the test.
- **Name a `schema` at module level only when it is too big to read beside
  the field** — `ReadinessReport` and `EventQualityReport` — or when it
  splices const arrays from elsewhere. Say which, in one line, above it.
- **A schema belongs at its field, not in a module a client component
  imports.** Declaring one pulls `zod` and a `toJSONSchema` call into
  whatever chunk the module lands in, and an admin `'use client'`
  component reaching it ships both to the browser to describe a shape only
  the server validates. `Clients.canonical.verification` and
  `Managers.notificationPreferences` sit at their fields for that reason.
- **Every property optional, unless nothing can hold the old shape.**
  Payload validates the column on _every_ save of the document, including
  one that never touched it, so a `required` key or
  `additionalProperties: false` can make a row written under an earlier
  shape unsaveable. Close the shape only where a single internal writer
  owns the column.
- **The generated type omits `null`**, because the schema replaces
  Payload's loose union verbatim. The column is still nullable in
  Postgres, and the validator skips `null`, `undefined`, `{}` and `[]`
  before reaching Ajv — so code that clears a column casts.
  **`.nullable()` puts it back, and unlike the hand-written form it is
  safe with `properties`.** Zod emits `anyOf: [ {…}, { type: 'null' } ]`,
  which generates a clean `X | null`. The old hazard belonged to
  `type: ['object', 'null']`, which emitted `X & (X | null)` — `X` again
  plus a duplicate of the whole interface. Say a column is nullable when
  it is, rather than casting at every reader.
- **An open shape can still be typed.** `additionalProperties: true`
  generates `[k: string]: unknown`, so every consumer reading a dynamic
  key needs a hand-written alias to cast to — the second definition this
  rule exists to delete. Give `additionalProperties` a schema instead —
  `z.record(z.string(), <value shape>)`, as
  `Managers.notificationPreferences` does: the value is described, the
  keys stay open, and no row is stranded.
- **Do not name the known keys beside an open value.** Per-key
  `properties` validate exactly what the value shape already does, and
  TypeScript refuses the combination: an optional named property includes
  `undefined`, which is not assignable to an index signature that does
  not, so `payload-types.ts` itself fails `tsc` with TS2411. Making those
  keys `required` silences the compiler and strands every row missing one.
- **Ajv runs in strict mode**, so only standard JSON Schema keywords may
  appear. A custom keyword throws at validate time, not at boot.

**Supplying `validate` replaces the built-in validator — which is the
thing that runs the schema.** A schema sitting beside a custom validator
does nothing at all. Compose instead, the same way a custom `text`
validator composes `text` from `payload/shared`:

```typescript
import { json as jsonFieldValidation } from 'payload/shared'

validate: (value, options) => {
  const shape = jsonFieldValidation(value, options)
  if (shape !== true) return shape
  return myCrossKeyRule(value) // what no schema can state
}
```

Keep a custom validator only for a rule the schema cannot carry — a
cross-key constraint, or one that depends on `operation`.
`Managers.notificationPreferences` and `Meditations.frames` are the two
examples; `tests/unit/json-field-schemas.spec.ts` fails if either stops
composing.

**Leave the shape open where it is genuinely open** — a verbatim legacy
import, or a third-party payload. Say so in a one-line comment naming
where the type already lives, rather than restating that type as a second
definition.

### A virtual column takes a schema too, and it can be closed

`virtual: true` changes what the schema is _for_, not whether to write one.
Nothing stores the column, so the Ajv validator has nothing to gate — but
`generate:types` still reads the schema, and without one the column's type
is the loose union above. "Typed at its source" types the **hook**, never
the interface, so every consumer reading the field still casts.

The `required` / `additionalProperties: false` caution above does not apply
here: the caution exists because a stored row written under an earlier
shape must stay saveable, and a virtual column has no stored row. Its only
writer is its own `afterRead` hook, so close the shape to match what that
hook returns — `Events.qualityReport`, `Clients.usage.abuseScore`,
`AppCards.viewSchedule`, `schedule.upcomingDates`, the Meditations join
columns, and every readiness section all do.

Two consequences worth knowing:

- **Write a union as a union, not one object with optional keys.**
  `z.union([...])` emits `anyOf` and keeps the discriminator, so a reader
  narrowing on `qualityReport.skipped` gets `checks` non-null. Merged into
  one object, both arms' keys become optional and the narrowing is gone.
  `anyOf` and `oneOf` accept identically here, because the branches are
  closed and discriminated, so at most one can ever match.
- **The generated type still omits `null`.** A hook returning `null` — no
  future occurrence, no locale — is not expressible alongside `properties`
  (see the bullet above), so a consumer still null-checks.

Then **delete the hand-written type the schema replaces, and import the
generated one at each call site** — do not leave an alias behind. An alias
puts the shape's name in two places, and the next reader cannot see what it
came from (`src/types/AGENTS.md`, "A derived alias stays local, and is never
re-exported"). `EventQualityReport`, `ReadinessReport`, `ClientAbuseScore`
and `TagAssignments` are all imported from `@/payload-types` directly for
exactly that reason.

## Activity logs (`logField`)

Use `logField` (`src/fields/logField.ts`) for a manager-readable record of what happened to a document. Its JSDoc, the `LogEntry` type, and `src/components/admin/LogTable/LogTable.tsx` own the conventions — read them before you add a writer.

## Plugins

### Form Builder (`@payloadcms/plugin-form-builder`)

Configured once in **`src/plugins/formBuilder`**, which generates `forms` and
**`user-submissions`** — the one intake for every public write. What the
wrapper does that the plugin's options cannot, and how a collection-wide
admin slot branches per intake: `src/plugins/formBuilder/AGENTS.md`.

⚠ **Every collection-wide admin slot here serves four intakes.** The review
components gate on `type === 'proposal'` themselves and fall through to the
ordinary Save otherwise; `livePreview.url` sends the other three to the
explanation page, with a reason that fits a row nobody reviews. A new slot owes
the same branch — the field hooks behind one included, since `admin.condition`
hides a field without stopping its hooks.

### Login (`src/plugins/login`)

Passwordless sign-in for `Managers` (#837, #840): managers hold no password.
The routes, the sign-in page and `createSession`: `src/plugins/login/AGENTS.md`.

Four things worth knowing before you touch `Managers`:

- ⚠ **Consuming a link sets `_verified`.** `Managers.auth.verify` is configured,
  and the JWT strategy yields no user while that flag is false, so a session
  minted for an unverified manager authenticates nobody. Following a link
  delivered to the stored address is the same proof the verify mail asks for,
  and an invited manager (#664) is unverified by definition.
- ⚠ **`magicLinkIssuedAt` is written by `issueMagicLink` and the redeem route,
  and nothing else.** It is simultaneously the 60-second send throttle, the nonce
  the redeem route matches exactly, and — cleared — what makes a link single-use.
  A hook that writes it invalidates a manager's outstanding link. The sign-in
  page's Server Action reaches it only through `issueMagicLink`, which is why
  that function is exported rather than copied.
- ⚠ **Every route here is anonymous**, and so is the sign-in page. They have to
  be: a manager who cannot sign in is who reaches them. `request-magic-link` and
  the page's Server Action therefore answer identically for every outcome —
  sent, unknown address, inactive manager, throttled repeat — because any
  difference is an account-enumeration oracle.
- The plugin **appends** to `endpoints` and `fields`. Replacing either array
  would delete `setProject` — the project switcher — silently.

## Localization (19 locales)

### Admin locale filtering (`filterAvailableLocales`)

A manager sees only the locales where they hold a role, and **English is not
force-added** (#665) — see `docs/rules/access.md` § "How a per-locale role
reaches `req.user`".

### Meditations locale handling (special)

Each meditation **is** a single-locale document: `filterMeditationsByLocale`
filters `find`/`count` to `req.locale`, and `findByID`, `locale=all` and a
versions read (below) bypass it. See `src/collections/Meditations/AGENTS.md`.

### A `read` beforeOperation hook also fires on a versions read

Payload maps `find`, `findByID`, `findVersions` and `findVersionByID` onto
the single `read` hook operation. So a `beforeOperation` hook guarding on
`operation === 'read'` runs on `GET /api/{collection}/versions` too, and
any `where` it appends is applied to the **versions** collection — where a
document's own fields live under `version.` and its id is `parent`.

Naming a document field there fails query validation with `The following
path cannot be queried`, **before** the read runs and regardless of
`overrideAccess`. In #745 that broke the admin version-history tab for
meditations for every caller.

`'id' in args` does not answer this question — it separates `findByID`
from `find`, not a versions read from either. Use `isVersionsRead`, whose
own doc comment carries the argument table it derives this from:

```typescript
import { isVersionsRead } from '@/lib/utilities/versionsRead'

export const myHook: CollectionBeforeOperationHook = ({ operation, args }) => {
  if (operation !== 'read' && operation !== 'count') return args
  if (isVersionsRead(operation, args)) return args   // cannot carry a document filter
  if ('id' in args) return args                      // findByID
  // …append the where…
}
```

`count` and `countVersions` map to their own hook operations, so a
counting hook needs no extra guard. In practice only `findVersions`
reaches the 400 in a hook that already skips `findByID`, since
`findVersionByID` carries an `id` too.

**Decline or translate? Ask what the `where` decides.** Both answers exist
in this repo, and the choice is not about which edit is smaller:

- A filter that **scopes a listing** — `locale`, finished events — is
  **declined**. A versions read is not that listing, nobody's authority
  widens, and `findByID` has never carried these filters either.
- A filter that **decides authority** is **translated**, never declined,
  because declining it would widen who may read a version row.
  `withDerivedGrants` (`src/plugins/access/accessConfigs.ts`)
  rewrites `update`'s `Where` onto `version.` with Payload's own
  `appendVersionToQueryKey` for exactly that reason.

The two hooks that append a `where` — `filterMeditationsByLocale` and
`excludeFinishedEvents` — are the only ones that needed this, and both are
covered by integration specs that go red when the guard is deleted
(`tests/int/meditations.int.spec.ts`, `tests/int/events.int.spec.ts`).
Other `read` hooks still fire on a versions read and are meant to:
`validateClientQueryParamsHook` (an API client must declare `select` there
too), `usageTrackingBeforeOperationHook`, and `ensureWebPathDeps`, which
mutates `select` rather than `where`.

⚠ **The guard fails silently in the dangerous direction.** It reads an
argument Payload supplies, so if an upgrade stopped supplying it the
filter would switch off for ordinary reads instead of erroring. Pin both
branches when you add a consumer: a `findVersions` that resolves, and a
`find` that leaves `draft` to Payload and is still filtered.

## Pages collection

### Publish state is per locale (#718)

`pages` and `app-cards` set `versions.drafts.localizeStatus: true` — the
object form, since `drafts: true` sanitises the flag back to `false`. The
root `experimental.localizeStatus` is already set in `payload.config.ts`;
Payload forces the flag off per entity without it. `_status` therefore
lives in `pages_locales` / `app_cards_locales`, not the base table, and
publishing German says nothing about French.

```typescript
await payload.update({
  collection: 'pages',
  id,
  locale: 'de',
  publishSpecificLocale: 'de',
  data: { title: 'Deutscher Titel', _status: 'published' },
})
```

Three consequences, each of which has already bitten:

- **A field `afterRead` hook sees `_status` in either shape** — a plain
  string on a collection without the flag, a `{ locale: status }` map on
  one with it. The map arrives *unresolved*, because Payload hoists a
  localized value down to the requested locale in the same afterRead field
  pass that runs the hook, so field order decides. Handle both shapes;
  `isPublished` in `src/fields/publicUrlFields.ts` is the one to copy. A
  bare `_status !== 'published'` nulled every page's `webUrl`.
- **`publishSpecificLocale` validates that locale's required fields.**
  `title` is required and localized, so publishing a locale with no title
  of its own is refused — the English fallback does not satisfy validation.
- **The published-only access filter is now per locale.** A page published
  in English alone returns nothing at `?locale=de` for an API client. That
  is the point, not a regression, and it is what stops an unpublished
  translation's text being readable. See `docs/rules/api-clients.md` for
  the consumer contract and the `?locale=all` read that answers which
  languages a document is live in.

Live preview integrates with the We Meditate Web frontend
(`WEMEDITATE_WEB_URL` env var).

### Page blocks (`src/lib/richEditor/blocks/`)

- ⚠ `TextBoxBlock.wisdomStyle` never renders — its `admin.condition` reads `position`, a field the block lacks (#989).

Field notes and custom block icons → `src/lib/richEditor/blocks/AGENTS.md`.

## Lessons collection ("Path Steps")

`title` and `panels` are per locale (#977) and neither may be `required` — see
`src/collections/Lessons/AGENTS.md` for why, and for the polymorphic
`meditation` relationship.

## Trash (soft delete)

**`payload.delete` is always a _hard_ delete, even on a trash-enabled
collection.** Its `trash` argument only widens _which_ documents are
deletable (whether already-trashed ones can be targeted) — it does not
choose soft vs. hard, and `deleteByID` never writes `deletedAt`. Trashing
is setting `deletedAt` yourself:

```typescript
// ✅ trash (recoverable from the admin trash view)
await payload.update({ collection: 'events', id, data: { deletedAt: new Date().toISOString() } })

// ⚠️ permanent, irreversible — not "move to trash"
await payload.delete({ collection: 'events', id })
```

The ExpireEvents job's `expired → trash` step and the Atlas importer's
archived-event handling both use the `update` form.

Use `deletedAt` in `where` clauses (`{ deletedAt: { exists: true|false } }`),
not `_status`.

### Trashed docs are invisible to a default query

Payload appends `deletedAt exists: false` to every read on a trash-enabled
collection unless you pass **`trash: true`** (`appendNonTrashedFilter`).
That flag _includes_ trashed docs alongside live ones — it does not filter
to only-trashed — and it's a no-op on collections without `trash`, so it's
safe to pass unconditionally.

This matters for any **existence check**: a trashed row still occupies its
natural key, so a lookup that omits `trash: true` reports "absent" and the
caller creates a duplicate. That was a live bug in the seed importers'
`preloadCollection` — `CleanupOrphanedMedia` trashes orphaned Files/Images,
so a later re-seed re-uploaded them instead of finding the trashed row (see
`tests/int/seed-importer-preload.int.spec.ts`).

**It applies to writes too, which is easier to miss.** An `update`
addressing a trashed row _by id_ throws `Not Found` without the flag —
even when you got that id from a query that did pass it. Two archived
Atlas events failed on every seed run for exactly this reason:
`preloadCollection` handed `upsert` the right id, and the update refused
it. Fixing the read is not enough — every write that can land on a
trashed row needs the flag too (#609):

```typescript
await payload.update({ collection: 'events', id, data, trash: true })
```

The asymmetry deserves its own test — assert the write **fails** without
the flag and succeeds with it, or the guard can be deleted without
anything noticing (`tests/int/event-quality.int.spec.ts`).

## Programmatic file upload

Payload expects a Node.js Buffer (not a Web API File/Blob) when uploading
to an upload collection (Images, Frames, Files, UserChoices, SongTags, Songs,
Meditations, Videos):

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

To find every field that references a collection, use the helpers in
`src/jobs/CleanupOrphanedMedia/schemaUtils.ts` instead of hardcoding
collection/field knowledge. How, and the `parseInt` pitfall in ID
extraction: `src/jobs/CleanupOrphanedMedia/AGENTS.md`.

⚠ **Read `depth: 0, locale: 'all'`, or a reference held only by a localized
field is invisible** — and an invisible reference reads as an orphan, so the
job trashes a file that is in use. `locale: 'all'` wraps a localized field's
value in a `{ [locale]: value }` map. Which path segments carry one is
recorded on the reference as `localizedAt` by the walk, off each field's own
`localized` flag, and `localeValues` splits exactly there. No key is
inspected, so a group whose subfields are named like locale codes cannot be
read as a translation, and no locale list can be forgotten.

## Schedule field

`scheduleFields()` (`src/fields/scheduleFields.ts`) is shared by **Events**
and **AppCards**, so a change lands on both and on their version tables.
Its stored `lastDate` column, the partial-update trap `computeLastDate`
avoids, and why it uses `rrule-temporal`: `src/fields/AGENTS.md`.
