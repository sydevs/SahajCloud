# Operator Scripts

One-off scripts an operator runs by hand from their own machine: external API registration,
one-time backfills, deployment helpers. Seeds live in `seeds/`, not here. What each script does,
and how to call it, is in its own header comment — `ls scripts/` is the inventory.

## Conventions

- **Location**: `scripts/<name>.ts`. Run it with `pnpm tsx scripts/<name>.ts`. Code two scripts
  here share goes in `scripts/lib/`, not in one of them — reaching into a sibling script makes a
  CLI entry point somebody else's module.
- **Env access**: Read `process.env` directly. Do not use the validated `serverEnv` module — the
  script runs from a local shell and should not require every unrelated env var to be set.
- **Safety**: Add a `--force` flag (or a dry run by default with `--apply`) to any destructive or
  state-changing script. Print a warning before it makes a change. An audit that only reports, and
  whose fix is a human decision, takes neither.
- **Pure decision half**: a script whose logic is worth testing splits it into a pure module beside
  it — no network, no clock — with a spec in `tests/unit/`. The script keeps the I/O.
- **Example**: [scripts/setup-stream-webhook.ts](./setup-stream-webhook.ts) registers the
  Cloudflare Stream webhook and prints the signing secret.

## ⚠ Any script you may point at production boots through `lib/payloadBoot.ts`

`loadPayloadWithoutSchemaChanges` runs no schema push, no pending migration and no `onInit`, and
refuses to start once the adapter stops carrying the keys that turn those off. A plain
`getPayload` under `NODE_ENV=production` applies every pending migration, so break-glass from a
feature branch would migrate production (#1138). Only a local-only script, such as the
`preview-*-emails` ones, may boot with a plain `getPayload`, to keep the dev schema push.

## Warnings by script

- **`create-manager.ts`** — ⚠ **the only way to bootstrap an empty `managers` table**: Payload's
  `create-first-user` is `Forbidden` under `disableLocalStrategy` (#840), and `admin.autoLogin`
  needs a row that already exists. Every manager after the first belongs in the admin panel.
- **`signin-link.ts`** — ⚠ **production's break-glass entry** when email delivery is down (#840).
  A script, not a route, so it grants nothing without `DATABASE_URL` and `PAYLOAD_SECRET`.
- **`redeem-signin-link.ts`** — the way to authenticate a remote seed run (`seeds/AGENTS.md`). ⚠
  It spends the link and saves nothing: the session expires within hours. `--seed` runs
  `pnpm seed` and nothing else, so an allow rule on this script's prefix grants no other command.
- **`lib/cloudflare.ts`** — ⚠ throws on a `200` carrying `success: false`, so a caller that needs a
  refusal as a _value_ has to catch `CloudflareError` itself.
- **`mailpit-transport.ts`** — every `preview-*-emails` script sends through Mailpit's HTTP API,
  because a Claude routine cannot reach Mailpit over SMTP (#807).
- **`get-railway-preview-url.ts`** (run by `ci.yml`) — ⚠ healthy is not caught up: a PR pushed to
  twice in quick succession answers from the previous build, so it waits for this PR's head commit.
  ⚠ An answer with no `commit` key at all is a build older than that field, so the error names a
  stale branch head, never Railway (#1124). Which endings exit non-zero is decided in
  `railway-preview-status.ts` and its spec (#661).
- **`preview-domain.ts`** — ⚠ **never builds a Railway host**, it takes one as an argument: Railway
  appends a random suffix to some generated domains, so a constructed host turns #661's loud
  failure into a 502. ⚠ The nightly sweep is load-bearing, not hygiene: a zone holds 100 Custom
  Domains. ⚠ Deleting one does **not** remove the Advanced Certificate it generated — that is
  residue to clear by hand.
- **`preview-sleep.ts`** — ⚠ every check in `previewEnvironments` keeps production out: a settings
  update given a non-fork environment applies to every non-fork environment, so production is
  re-read before and after every write. It deploys fresh, never redeploys, because a redeploy
  reuses the old settings snapshot.
- **`select-unit-specs.mjs`** — ⚠ **`.mjs`, not `.ts`**: the hook imports it under plain `node`,
  which loads no TypeScript unflagged on Node 22.17.
- **`hook-run.mjs`** — the hooks' logic lives in `scripts/` rather than `.claude/`, a protected
  path, so an unattended run can change it (#993). ⚠ **`CLAUDE_PROJECT_DIR` names the workspace for
  a session started there**, so a hook addressed through it alone was not found in a worktree.
  `.claude/settings.json` falls back to `git rev-parse --show-toplevel` when the project holds no
  hook — never the other way round, which would run any checkout's script the session wandered
  into.
- **`migrate-create-pty.py`** — ⚠ **Python, not `.ts`**: Node has no pty in its standard library.
  Allowlisted by literal prefix in `.claude/settings.json`, so renaming it strands unattended runs.
  See `src/migrations/AGENTS.md`.
