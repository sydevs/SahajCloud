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
- **Example**: [scripts/repair-r2-meditation-filenames.ts](../../scripts/repair-r2-meditation-filenames.ts)
  backfills / fixes R2 filenames on existing meditations.

## Existing scripts

| File | Purpose |
|---|---|
| `repair-r2-meditation-filenames.ts` | Backfill / fix R2 filenames on existing meditations |
| `create-sample-page.ts` | Generate a sample Pages document |
| `postinstall.cjs` | Run after `pnpm install` |
