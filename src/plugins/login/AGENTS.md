# Login (`src/plugins/login`)

Passwordless sign-in for `Managers` (#837). It appends one hidden
`magicLinkIssuedAt` column and two endpoints — `POST /api/managers/request-magic-link`
and `POST /api/managers/redeem` (which spends any link) — to whatever
`Managers.ts` already declares. Since #840 it is the only way in: managers hold no password.

`/admin/login` is the human surface (#838, #840): the plugin replaces Payload's
login view with `src/components/admin/SignIn`, which asks for a link, confirms a
delivered one, and explains a refused one. Every emailed link and every
refusal's redirect lands there. `managersLogin.requestPagePath` is the single
spelling of that route.

A sign-in link returns its holder to the page Payload sent them from: the
page's `?redirect=` rides the form into the token's signed `to` claim, and the
redeem route lands there. That value is anonymous input, so `returnPath` keeps
only an admin path and drops the sign-in and logout routes. A visitor already
signed in is sent there directly, by the same rule — Payload's own
`getSafeRedirect` would keep `/admin/logout`. An expired link cannot be read for
a destination, so the fresh one it prompts lands on the dashboard.

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

`createSession` (`@/plugins/login`) is the one place a session is minted
without a password, for any auth collection that can hold one. It refuses a
collection with no `sessions` field: `clients` sets `disableLocalStrategy`, so
Payload gives it neither `sessions` nor `email`.
