# Support impersonation (`src/plugins/login/impersonation`)

Wired by `loginPlugin` onto the same `managers` entry as passwordless sign-in: both are ways
into the admin panel, so one plugin owns the collection (`../loginPlugin.ts`).

The support account can act as a manager in the production admin and reproduce a permission
problem exactly as that manager sees it: their roles in each locale, their derived roles, their
project, their sidebar. Saves go through as the manager.

Owner decisions (2026-11-25). Don't reopen them without asking:

- **Only the support account can impersonate.** That is the manager whose email equals
  `CONTACT_EMAIL` (`NEXT_PUBLIC_CONTACT_EMAIL`) **and** whose `type` is `admin` (`gate.ts`).
  Anyone who can read that mailbox can request its sign-in link, so access to the inbox is the
  real gate. No one can give a manager the address through the admin or the API
  (`refuseSupportAddress`, attached to `email` by the plugin), so another admin cannot take the
  role by moving it onto their own account; a seed or script with no user is not judged.
  `CONTACT_EMAIL` is also the public support address, so changing it moves this right to the new
  address.
- **Only an active, non-admin manager who has confirmed their email can be impersonated.** The
  JWT strategy yields no user while `_verified` is false, so an unconfirmed target would be
  refused every request — the start refuses it instead (`gate.ts`).
- **Writes are allowed, and are recorded as the manager's.** The manager gets no notice and
  nothing is stored. The only record is one log line at start and one at exit
  (`[impersonation] … started acting as manager …`).
- **No timeout.** It lasts until Exit or sign-out; the cookie itself keeps for the browser's
  maximum, 400 days. A red banner sits across every admin page (`admin.components.header`).
- **Support's own session stays underneath**, and the cookie naming the target is bound to it.
  That one choice is what forces every stop under "What Payload would otherwise get wrong", so it
  is the one to weigh first.
  The alternative was minting the target's own session with `createSession` and stashing
  support's token instead. Three facts decided against it: `createSession` writes a session row
  on the manager's account and stamps `lastLoginAt`, the column the manager contacts table shows
  as their last sign-in; nothing would then be re-checked per request, so a demotion, a
  deactivation or support's own sign-out would leave a live token for the manager until it
  expired; and `impersonatedBy` still has to come from somewhere, since the banner, Exit, `/me`
  and the own-row refusal are all keyed on it. It would have saved the manager's stored
  `currentProject`, which the cookie carries instead.

## How a request becomes the manager

`POST /api/managers/impersonate/:id` sets the `sahajcloud-impersonation` cookie, and the
`support-impersonation` auth strategy reads it on every request. What it checks, in what order,
and what a refused cookie answers with are `strategy.ts`'s docblocks; the cookie's claims are
`cookie.ts`'s.

⚠ **The token carries no `id`, `collection` or `sid` claim.** Payload's JWT verifier reads those
three names, and they are what keeps this token from ever reading as a session
(`@/plugins/login/token.ts` keeps the same rule for its links).

## What Payload would otherwise get wrong

Six Payload defaults would act on `req.user` — the manager — where they should act on support, or
would write the manager's own state. `hooks.ts`, `endpoints.ts` and `preferences.ts` hold one
docblock per stop, naming the default it covers.

⚠ **A first-time `payload-preferences` create still lands**, so a preference row the manager never
had is written on support's first column or locale change. Refusing it would throw inside a page
render.

⚠ **Document locks are not covered.** While support has a document open, other people see the
manager's name on it. The lock clears when support leaves the document.

⚠ **There is no Sentry tag for impersonated requests.** Every server report goes through
`capture` (`src/plugins/sentry/AGENTS.md`), which names `req.user`, so an error raised while
impersonating is reported under the manager.

## Tests

`tests/unit/impersonation-gate.spec.ts` holds the matrix of who may impersonate whom, and
`tests/int/support-impersonation.int.spec.ts` the wiring end to end.
