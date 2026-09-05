---
name: migration-validator
description: Validate a Payload schema migration before applying it. Validates syntax, exported up/down functions, .json snapshot presence, data-loss risk patterns, and PostgreSQL FK constraints. Use before `pnpm payload migrate`.
allowed-tools: Bash, Read, Grep
---

# Migration Validator

Pre-flight validation for Payload migrations in `src/migrations/`. It catches the most common
ways a migration breaks on PostgreSQL, before you apply it.

## Workflow

1. **Run the validator** against the newest migration:

   ```bash
   .claude/skills/migration-validator/validate.sh
   ```

   Or run it against a specific file:

   ```bash
   .claude/skills/migration-validator/validate.sh src/migrations/20260526_100019.ts
   ```

2. **Review the findings.** Each one is:
   - **PASS** ✓ — safe to proceed
   - **WARN** ⚠ — review it carefully, since it may be intentional
   - **FAIL** ✗ — fix it before you apply the migration

3. **Decide:**
   - All PASS → run `pnpm payload migrate` (or `pnpm payload migrate:status` first, to preview)
   - Any WARN or FAIL → fix the issue, or get explicit sign-off from the user

## What it validates

| Validation | Why it matters |
| --- | --- |
| File exists and is `.ts` | Catches a typo in the invocation |
| Matching `.json` snapshot | Drizzle diffs future migrations against it — a missing one breaks the next `db:migrations:create` |
| `export async function up` | A migration without `up` does nothing on apply |
| `export async function down` | Without `down`, rollback is impossible |
| `pnpm tsc --noEmit` | A compile error blocks the migration from importing into `src/migrations/index.ts` |
| `DROP TABLE` / `DROP COLUMN` | Data loss — validate that the data is no longer needed |
| `RENAME COLUMN` | Breaks reads from old code while the migration applies — coordinate with the deploy |
| Foreign key constraints | PostgreSQL enforces FK constraints during migration — validate parent-before-child order |
| Hardcoded secrets | A token or key committed inside a migration file |

## Limitations

This is a static validation. It cannot catch a logic bug (the migration runs but produces the wrong
data), a performance issue (a full-table rewrite on a large table), a cross-migration ordering
bug, or behavior that depends on data already in the database. For a semantic review, follow up
with the `migration-reviewer` subagent, or do a manual walkthrough.

## When to use

- After `pnpm db:migrations:create` (the user runs this interactively)
- Before you open a PR that contains migrations
- Before `pnpm payload migrate`, in any environment
- Before you deploy to production — migrations auto-apply on server boot, and a restore from
  backup is the only way back

## References

- `src/migrations/AGENTS.md` — the full migration workflow and the push-mode rationale
- `src/migrations/` — existing migrations, as examples
