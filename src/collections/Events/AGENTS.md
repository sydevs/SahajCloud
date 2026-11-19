# Events

Rules that apply to `events` alone. The cross-collection rules — validation,
hooks, trash — are in `src/collections/AGENTS.md`, and the schedule field is in
`src/fields/AGENTS.md`.

## `title`: a field a hook fills for you

A field a `beforeChange` hook auto-fills has to break the conditional
validation rule in `src/collections/AGENTS.md` (do not return `true` for an
empty value inside `validate`), because **no field hook runs in the
browser**. Server-side the order is hooks → `validate`
(`payload/dist/fields/hooks/beforeChange/promise.js` — hooks at line 58,
`validate` at 86), so the value is already filled by the time it's checked.
The admin panel validates _before_ sending the request, with no hook to
fill anything — so `required` refuses the blank field outright, and "leave
it blank and we'll write it for you" becomes unreachable.

Permitting the blank in `validate` unblocks the browser but disarms
`required`, because supplying `validate` **replaces** the default that
enforces it (`payload/dist/fields/config/sanitize.js` installs the default
only when `validate === undefined` — also why a custom validator must
compose with `text` from `payload/shared`, or it silently drops
`maxLength`).

So put the guarantee where the knowledge is.
`src/collections/Events/hooks/eventTitle.ts`: the **hook** throws a
`ValidationError` when the auto-fill comes up empty — it is the only party
that knows whether it had anything to work from. The **validator** answers
only the cheap question the browser can answer (is a value _plausible_),
and never pretends to be the enforcement.

Don't reach for `event: 'submit'` to tell browser from server — Payload's
server path also passes `event: 'submit'`, so it discriminates nothing.

## The Atlas event feed and registration contract

`GET /api/events/geojson` and `POST /api/user-submissions` back the Sahaj Atlas widget. A finished event stays published but drops off the feeds (#603/#604). `ExpireEvents` marks it `finished` without unpublishing, so `GET /api/events/:id` still renders an "Ended" panel. The public feeds exclude it via `excludeFinishedEvents`, keyed on `schedule.lastDate`. Registration is gated server-side (#599) on the unified intake: a `POST /api/user-submissions` with `type: registration` refuses external-mode, ended, started-course or full events with a `409` and a stable `code` at `errors[].data.code`. A denormalized `registrationsFull` boolean lets the widget show "Full" without a live count, from the `user-submissions` registration rows.

## `inactive` is a computed field, `repeats` is the column

One control stores how often a class meets _and_ whether it is dormant:
`repeats` — `once` / `daily` / `weekly` / `monthly` / `inactive`. An editor
reads `inactive` as **On-demand**: no fixed schedule, and a time arranged
through the public contact, which such a class must carry. Two things
follow from it, and both have a sharp edge.

**`schedule.recurrenceType` is written from it**, by the
`syncScheduleRecurrence` collection hook, in `beforeValidate` so the schedule's
own field hooks see the value on the same save. On an update the pace is
`paceAfter`'s (`@/lib/events/derivedFields`): a changed `repeats` wins, and a
write that edits the recurrence alone — an update proposal, a REST patch — moves
a scheduled pace with it. A create has no stored pace to compare, so it owes
`repeats` with its schedule, or a recurrence named alone is cleared: the class
import and the proposal merge both go through `newEventDefaults`, which derives
it, and `testData.createEvent` does the same for a spec.

**`inactive` stays in the API, computed from `repeats`**, because the Atlas
widget selects it and the We Meditate site reads `schedule.inactive` off
`/api/atlas/seo`. ⚠ **Never query it, and never read it in a hook.** A `where`
cannot name a virtual field, and Payload runs every field's `afterRead` in one
`Promise.all` — so a collection hook, and a sibling field's own `afterRead`,
both run where `inactive` is not computed yet. Read `repeats` there:
`shouldFinish`, `resolveNextCheckAt`, `calendarFeedAnswer`, `classKey` and
`notFinishedWhere` all do.

## `allowContact` takes two halves, and needs both

The three public contact fields answer `null` on every read while the box is
off, and the columns are emptied on every save where it is off
(`hooks/withholdContact.ts`). `admin.condition` hides a field without clearing
it, and the widget reads `contactPhone` with no gate of its own.

⚠ **A read gate cannot withhold a column from a `where`.** A field
`afterRead` hook governs the value returned, never the query, and nothing
bounds a client's `where` — `validateClientQueryParamsHook` reads `select` and
the range bounds alone, and returns before any of it for a `count`. A stored
number therefore answers `where[contactPhone][contains]` one character at a
time, to any key holder, and the widget's key is published in every host page.
Emptying the column is the only answer; the read gate covers the window between
a partial write and the next save.

⚠ **Clear on the resolved state, never the transition.** A row written with
the box already off — an API create, a CSV import — never transitions, so a
transition-only hook leaves exactly that row queryable. A caller meaning to
offer a contact sends the box with it, which `newEventDefaults`, `updatePatch`
and `eventData` all derive.
