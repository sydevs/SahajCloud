---
name: migration-validator
description: Validate a Payload schema migration before applying it. Checks syntax, exported up/down functions, .json snapshot presence, data-loss risk patterns, and the D1 PRAGMA foreign_keys gotcha. Use before `pnpm payload migrate`.
allowed-tools: Bash, Read, Grep
---

# Migration Validator

Pre-flight checks for Payload migrations in `src/migrations/`. Catches the most common ways a migration goes wrong on D1 before you apply it.

## Workflow

1. **Run the validator** against the newest migration:

   ```bash
   .claude/skills/migration-validator/validate.sh
   ```

   Or against a specific file:

   ```bash
   .claude/skills/migration-validator/validate.sh src/migrations/20260526_100019.ts
   ```

2. **Review the findings.** Each is one of:
   - **PASS** ✓ — safe to proceed
   - **WARN** ⚠ — review carefully; may be intentional but flag-worthy
   - **FAIL** ✗ — fix before applying

3. **Decide:**
   - All PASS → run `pnpm payload migrate` (or `pnpm payload migrate:status` first to preview)
   - Any WARN/FAIL → fix or get explicit user sign-off

## What it checks

| Check                         | Why it matters                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| File exists & is `.ts`        | Catches typos in invocation                                                                                                                                                                                                    |
| Matching `.json` snapshot     | Drizzle uses the snapshot to compute future diffs; missing one breaks subsequent `db:migrations:create`                                                                                                                        |
| `export async function up`    | Migration without `up` does nothing on apply                                                                                                                                                                                   |
| `export async function down`  | Reversibility — without `down`, rollback is impossible                                                                                                                                                                         |
| `pnpm tsc --noEmit`           | Compile-time errors block migration from being importable from `src/migrations/index.ts`                                                                                                                                       |
| `DROP TABLE` / `DROP COLUMN`  | Data loss — confirm the data is no longer needed                                                                                                                                                                               |
| `RENAME COLUMN`               | Breaks reads from old code while migration applies — coordinate with deploy                                                                                                                                                    |
| Child-then-parent FK rebuilds | **D1 PRAGMA foreign_keys gotcha**: D1 does not honor `PRAGMA foreign_keys=OFF` across `db.run()` calls. Rebuilding a child table before its parent will cascade-null FK columns. See [feedback_d1_pragma_foreign_keys] memory. |
| Hardcoded secrets             | Tokens/keys committed via migration files                                                                                                                                                                                      |

## Limitations

This is a static check. It cannot catch:

- Logic bugs (the migration runs but produces wrong data)
- Performance issues (full-table rewrites on large tables)
- Cross-migration ordering bugs
- Behavior that depends on data already in the DB

For semantic review, follow up with the `migration-reviewer` subagent (if available) or do a manual walkthrough.

## When to use

- After `pnpm db:migrations:create` (user-run, interactive)
- Before opening a PR that contains migrations
- Before `pnpm payload migrate` in any environment
- Before `pnpm run deploy:prod` (production migrations are irreversible without DB restore)

## References

- `.claude/rules/migrations.md` — full migration workflow + push mode rationale
- [feedback_d1_pragma_foreign_keys] memory — the FK cascade-null gotcha
- `src/migrations/` — existing migrations as examples
