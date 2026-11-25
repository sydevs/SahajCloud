# Support impersonation (`src/plugins/impersonation`)

The support account can act as a manager in the production admin and reproduce a permission
problem exactly as that manager sees it: their roles in each locale, their derived roles, their
project, their sidebar. Saves go through as the manager.

Owner decisions (2026-11-25). Don't reopen them without asking:

- **Only the support account can impersonate.** That is the manager whose email equals
  `CONTACT_EMAIL` (`NEXT_PUBLIC_CONTACT_EMAIL`) **and** whose `type` is `admin` (`gate.ts`).
  Anyone who can read that mailbox can request its sign-in link, so access to the inbox is the
  real gate. ⚠ Any admin can also take the role, by moving the address off the support account
  and onto their own; accepted, since an admin already reaches every record. `CONTACT_EMAIL` is
  also the public support address, so changing it moves this right to the new address.
- **Only an active, non-admin manager can be impersonated.**
- **Writes are allowed, and are recorded as the manager's.** The manager gets no notice and
  nothing is stored. The only record is one log line at start and one at exit
  (`[impersonation] … started acting as manager …`).
- **No timeout.** It lasts until Exit or sign-out; the cookie itself keeps for the browser's
  maximum, 400 days. A red banner sits across every admin page (`admin.components.header`).

## How a request becomes the manager

`POST /api/managers/impersonate/:id` sets the `sahajcloud-impersonation` cookie. It holds a
`jose` token signed with `payload.secret`, carrying the support account's id, the support session
id, the target's id, and the target's project. The `support-impersonation` auth strategy is
prepended to `managers`, so it runs before `localized-roles`. On every request it:

1. authenticates support's JWT exactly as an ordinary request would (`authenticateJWT`);
2. requires that the account is still the support account, and that the session is still the one
   the cookie is bound to;
3. loads the target, checks it is still an active manager, and returns it through
   `hydrateAuthUser`, with `impersonatedBy` and the cookie's `currentProject` set on it.

If any of these checks fails, the request reads as support themself, and the response clears the
cookie wherever it can carry the header (a REST request; an admin page render cannot). So a stale
cookie does no harm, and a demotion or a sign-out ends the impersonation on the next request.

⚠ **The token carries no `id`, `collection` or `sid` claim.** Payload's JWT verifier reads those
three names, and they are what keeps this token from ever reading as a session
(`@/plugins/login/token.ts` keeps the same rule for its links).

## What Payload would otherwise get wrong

Each of these hooks covers a place where Payload's default would act on `req.user` (the
manager) when it should act on support, or would write the manager's own state:

| Where                                      | Default                                                                                                                  | Here                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refresh-token`                            | Signs a token for the manager, on no session of theirs. It authenticates nobody, so the first refresh signs support out. | `refreshImpersonatorToken` re-signs support's own token (`signSessionToken`).                                                                                                |
| `/me`, and the user a refresh answers with | Re-read the manager's stored row, so the cookie's project and `impersonatedBy` are lost.                                 | `overlayImpersonation`, an `afterRead` hook on the impersonated manager's own row, puts both back.                                                                           |
| Project switcher                           | Writes `currentProject` to the manager's row.                                                                            | `set-project` writes it into the cookie instead (`setImpersonatedProject`).                                                                                                  |
| The manager's own row                      | Writable: their name, contacts and notification preferences.                                                             | `refuseOwnRowWrites` answers 403, and refuses every bulk write. Another manager's row stays writable by id.                                                                  |
| `payload-preferences`                      | Saves column, nav and locale choices over the manager's own.                                                             | `keepImpersonatedPreferences` skips them. ⚠ A first-time create still lands. Payload adds this collection after every plugin, so `restrictPayloadSystemEntities` applies it. |
| Sign-out                                   | Removes `req.user`'s session, which is the manager's, so support's own session outlives it.                              | `endImpersonationOnLogout` removes support's session and clears the cookie.                                                                                                  |

⚠ **Document locks are not covered.** While support has a document open, other people see the
manager's name on it. The lock clears when support leaves the document.

⚠ **There is no Sentry tag for impersonated requests.** Every server report goes through
`capture` (`src/plugins/sentry/AGENTS.md`), which names `req.user`, so an error raised while
impersonating is reported under the manager.

## Tests

- `tests/unit/impersonation-gate.spec.ts` covers the full matrix of who may impersonate whom.
- `tests/int/support-impersonation.int.spec.ts` checks the wiring end to end: the per-locale roles
  on the target, refusals, a stale session, a demoted target, the own-row (single and bulk) and
  project-switcher writes, refresh, preferences, `/me`, exit, and sign-out.
