# Workflow Parity Spec

Canonical spec of the shared slash-command workflow across **SahajCloud**, **SahajAtlasWeb**, and
**WeMeditateWeb** (all under `~/Documents/Projects/`). An **identical copy** of this file lives in
each repo at `.claude/docs/workflow-parity.md` — a plain `diff` across the three copies must show
no differences. The `/sync-workflow` skill audits each repo's skills against this spec.

When a workflow improvement lands in one repo, port it to the other two and update all three
copies of this file in the same effort.

## The 3-phase PR workflow

1. **Implement** — `/implement-issue <n>` takes a ticket end-to-end and runs the finalize pipeline.
2. **Adjust** — iterate on the open PR: commit locally as you go, **never push** (batches CI).
3. **Finalize** — `/finalize-pr` ships the batch and gets CI green.

## Canonical step lists

### `/draft-ticket`

classify → gather context → clarify (only if ambiguous) → choose template → conventional-commit
title → specific body (file:line refs) → plan-mode approval is the sign-off → `gh issue create`
with a **mktemp body file** → return the URL.

### `/implement-issue` — `[issue-number] [--no-worktree]`

1. Verify clean working tree (stop if uncommitted changes aren't ours).
2. Fetch the issue; ask the user only if acceptance criteria are missing.
3. Plan; **auto-proceed** when the ticket is clear — pause only on missing criteria, ambiguity,
   deviation from the ticket, or destructive work.
4. **Worktree by default** (EnterWorktree, branch renamed to `<type>/<slug>`); `--no-worktree`
   or explicit user opt-out falls back to a plain branch. Install deps in the worktree; edit
   files in the worktree, never the main checkout.
5. Implement in incremental conventional commits (HEREDOC bodies, `Co-Authored-By` trailer).
6. Repo-specific contract step (migrations / types sync — see deltas below).
7. Tests per the repo's test-plan checklist.
8. Lean gate as you go: `.claude/skills/pr-prep/check.sh` (`--full` mirrors CI).
9. Finalize via the `/finalize-pr` skill — single source of truth; never hand-rolled.
10. Remove the worktree (ExitWorktree) only after the PR is open, CI is green, and
    `git rev-parse HEAD` == `git rev-parse origin/<branch>`.
11. Close with the final-summary template (PR link · CI status · worktree removed ·
    continue-locally instructions · manual-verification line).

### `/finalize-pr`

0. Pre-flight: not on `main`; commit pending Adjust-phase changes (stop if unrelated); exit if
   nothing to ship.
1. `/simplify` over the full branch diff (`origin/main...HEAD`).
2. **One** `/code-review` pass at high effort via a **dispatched Task subagent** — never inline,
   never a second pass. Triage findings; fix each in its own commit.
3. Conditional security review — only when the diff matches the repo's risky-path list.
4. Lean test gate: `.claude/skills/pr-prep/check.sh`.
5. **Docs sync** — update every doc surface the diff makes stale (CLAUDE.md/AGENTS.md,
   `.claude/docs/`, `.claude/rules/`, `.claude/skills/`, repo-specific docs); own
   `docs: …` commit, the final commit before pushing. If nothing is stale, say so in the report.
6. Push (`git push -u origin HEAD` on first push).
7. Open or refresh the PR: **mktemp body file**; on refresh re-derive **title and body** from the
   current `origin/main...HEAD`.
8. Watch CI; fix-loop **capped at 3 iterations**, then hand back.
9. Report: PR URL, CI status, dismissed findings with reasons, manual-verification items;
   suggest `/reflect-session` only after real friction.

## Shared invariants

- Worktree by default in `/implement-issue`, with `--no-worktree` opt-out and post-merge cleanup.
- `mktemp` for **every** `gh` body file (issue and PR) — never a fixed `/tmp/` path.
- Single code-review pass, dispatched to a subagent.
- Docs-sync commit before push — stale docs never ship.
- Never report success while CI is red; CI fix-loop capped at 3.
- Lean gate lives at `.claude/skills/pr-prep/check.sh` in every repo.
- Conventional commits everywhere (`<type>(<scope>): <subject>`, ≤ 70 chars, imperative).
- Never force-push shared branches; never `--no-verify`; never commit secrets.

## Intentional per-repo deltas

| Concern | SahajCloud | SahajAtlasWeb | WeMeditateWeb |
| --- | --- | --- | --- |
| Schema/contract step | Payload migrations: attempt-then-fallback (`timeout 30 pnpm db:migrations:create <name> --skip-empty < /dev/null`; hand off on exit 124) per `.claude/rules/migrations.md` | `pnpm types:cms` + `pnpm types:openapi` contract refresh | `pnpm types:cms` (consumes SahajCloud types; no migrations) |
| Lean gate contents | lint + `test:unit` (+ targeted int specs) | lint + typecheck + `test:run` | lint + `tsc --noEmit` + `test:run` |
| Security-review trigger paths | access plugins, Clients/Managers, endpoints, storage, webhooks, payload.config | api config, Widget entry, lexical/HTML sinks, deps, env, vite config | `server/`, `pages/preview/`, wrangler/vite/sentry configs, `scripts/`, env files |
| Worktree env setup | `CI=true pnpm install`; `.env` is git-tracked (already present); dev server needs a distinct `PORT` (shared instance + shared local Postgres via `push: true`) | `pnpm install`; copy `.env.local` from main checkout if needed | `pnpm install`; copy `.env` / `.dev.vars` from main checkout if needed |
| Deploy target | Railway (+ per-PR preview) | Cloudflare Pages | Cloudflare Workers + Pages (Ladle) |
