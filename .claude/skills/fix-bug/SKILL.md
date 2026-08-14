---
name: fix-bug
description: Troubleshoot and fix application bugs. Use when the app has an error, unexpected behavior, or test failure. Gathers logs, narrows root cause, proposes and applies a minimal fix. Does not commit — user reviews changes before commit.
effort: high
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

# Fix Bug

End-to-end bug troubleshooting for the sy-devs-cms PayloadCMS + Next.js + Railway + Postgres stack (Cloudflare edge proxy). Gathers diagnostics, narrows root cause, applies a minimal fix.

## Workflow

1. **Clarify the symptom.** Ask the user for: exact error message / stack trace, reproduction steps, what they expected vs. what they got. Don't guess.
2. **Gather diagnostics.** Run `.claude/skills/fix-bug/scripts/gather-logs.sh` to collect dev server logs and recent test output. Search for the error string. Cross-reference any relevant memory notes.
3. **Narrow the root cause.** Consult the supporting files for stack-specific patterns:
   - `debug-checklist.md` — general diagnostic flow
   - `payload-errors.md` — PayloadCMS hooks/access/types
   - `cloudflare-errors.md` — R2, Cloudflare Stream, Cloudflare Images (legacy Workers/D1 sections archived)
4. **Propose the fix.** Single-paragraph diagnosis + minimal change. Don't add defensive cleanup or speculative edits.
5. **Apply the fix.** Edit the relevant files. Run the narrowest validation that proves it: targeted test, manual repro, or `pnpm tsc --noEmit` for type fixes.
6. **Stop.** Do NOT commit. The user reviews the diff and commits when ready.

## Scope rules

- **One bug per invocation.** If you find unrelated issues, surface them but don't fix them.
- **Root cause over symptom.** Adding a `?.` operator to silence a `undefined` error usually isn't a fix — find why the value is undefined.
- **No new abstractions.** Three similar lines is fine; don't refactor while fixing.
- **Don't bypass safety checks.** Never use `--no-verify`, `--force`, or disable hooks to make the symptom go away.

## What this skill does NOT do

- Commit changes (user's job)
- Open PRs (use `/implement-issue` for that flow)
- Schema migrations (use `pnpm payload migrate:create` — ask the user; see `.claude/rules/migrations.md`)
- Refactor working code

## Quick references

- Logs: `.claude/skills/dev-server/state/server.log`
- Sentry MCP: `mcp__sentry__*` (production errors)
- Custom logger: `src/lib/logger/workerSafeLogger.ts`
- Env validation: `src/lib/env.ts`
