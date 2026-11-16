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
