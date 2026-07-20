---
paths:
  - scripts/**/*.ts
---

# Operator Scripts

One-off operator scripts (NOT seeds — seeds live in `seeds/`). Use for tasks
an operator runs manually from their machine: external API registration,
one-time backfills, deployment helpers, etc.

## Conventions

- **Location**: `scripts/<name>.ts` (TypeScript, run via `pnpm tsx scripts/<name>.ts`).
- **Env access**: Read `process.env` directly, **not** the validated
  `serverEnv` module — the script runs from a local shell and shouldn't
  require unrelated env vars to be set.
- **Safety**: For destructive or state-changing scripts, add a `--force`
  flag guard and print a warning before making mutations.
- **Example**: [scripts/setup-stream-webhook.ts](../../scripts/setup-stream-webhook.ts)
  registers the Cloudflare Stream webhook and prints the signing secret.

## Existing scripts

| File | Purpose |
|---|---|
| `setup-stream-webhook.ts` | Register / inspect / delete the account-level Cloudflare Stream webhook |
| `preview-event-emails.ts` | Send the manager event-verification reminders (all levels/audiences) to an Ethereal inbox |
| `preview-registration-emails.ts` | Send the registrant confirmation in each state (online/offline, locale, branded/fallback, one-off, minimal) to an Ethereal inbox, with the `.ics` attached |
| `preview-registration-notification-emails.ts` | Send the manager registration notice (#588) in each state (named manager / override address / no session / long title) to an Ethereal inbox |
| `repair-r2-meditation-filenames.ts` | Backfill / fix R2 filenames on existing meditations |
| `create-sample-page.ts` | Generate a sample Pages document |
| `postinstall.cjs` | Run after `pnpm install` |
