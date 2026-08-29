# AGENTS.md

This file provides guidance to AI coding agents when working with this repository.

**Supported agents**: Claude Code, OpenAI Codex, Cursor, and other AGENTS.md-compatible tools.

> `CLAUDE.md` is a symlink to this file for Claude Code compatibility.
> Claude-specific features (rules, hooks, skills) remain in the `.claude/` folder.

## Documentation

- **`.claude/rules/`** — path-scoped rules that auto-load when reading matching files (run `ls .claude/rules/` for the inventory; each file's frontmatter declares its globs)
- **`@.claude/docs/environment.md`** — environment variables and Railway configuration
- **`@.claude/docs/architecture.md`** — top-level architecture (collections, routes, logging, scheduled jobs)
- **`.claude/skills/`** — local workflow skills (run `ls .claude/skills/` to discover; each has a `SKILL.md`)
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — deployment documentation

## Overall Instructions

- Always ask before editing or closing a GitHub PR, and before creating, editing, or closing a GitHub issue. Opening a new PR does not require prior approval.
- When continuing from a previous session: explicitly state what was previously decided/approved, confirm the continuation context, and proceed with implementation only if intent is clear.
- Prefer specialized MCP tools when researching: `mcp__cloudflare-docs__*` for Cloudflare, `mcp__sentry__*` for Sentry, `mcp__github__*` for GitHub. Use WebFetch only for sites without MCP coverage.
- **Payload docs**: use the `payload` skill first (local quick-reference + `.claude/skills/payload/reference/*.md` covers ~80% of common Q&A). For anything not in the skill — newer features, edge cases, exact API signatures — call `mcp__payloadcms-docs__list_doc_sources` → `mcp__payloadcms-docs__fetch_docs` (live docs via the `llms.txt` sitemap). Don't WebFetch `payloadcms.com` directly; the MCP returns cleaner markdown. **Context guard**: MCP responses land in the main thread (5–20KB per page). For single targeted lookups, call the MCP directly. For multi-page research (3+ pages, or unsure which page) — dispatch an `Explore` subagent and let _it_ call the MCP, so the main thread only receives the synthesized answer.

## Project Overview

A **Next.js 15** application integrated with **Payload CMS 3.0** — a headless content management system. TypeScript, PostgreSQL, deployed on Railway with Cloudflare R2 (S3 API) for storage and Cloudflare's edge services (Images, Stream, rate limiting, caching) in front.

## Admin Access

Admin panel at `http://localhost:{PORT}/admin/login` once the dev server is running.

**Local dev needs no password.** `src/payload.config.ts` enables Payload's `autoLogin` as
`contact@sydevelopers.com` whenever the app is neither production nor an E2E run, so the login form
is bypassed. If you land on it anyway, the local admin has been seeded without auto-login — re-seed
rather than hunting for a password.

Credentials for anything beyond local dev live outside the repo:

| Environment | Where the credential lives |
| ----------- | -------------------------- |
| Railway PR preview | `PREVIEW_ADMIN_PASSWORD` — CI secret; the smoke lane passes it through (`.github/workflows/ci.yml`) |
| Production | `ADMIN_PASSWORD` in `.env.claude.local` — see `.claude/docs/environment.md` |

## Essential Commands

### Development

Use the dev-server skill for a shared dev server across Claude sessions:

- `.claude/skills/dev-server/dev-server.sh` — start + tail logs (default)
- `.claude/skills/dev-server/dev-server.sh status|restart|stop`

The skill ensures a single shared instance, preventing port conflicts. Default port 3000; override with `PORT=4000 .claude/skills/dev-server/dev-server.sh`. `SAHAJCLOUD_URL` is derived from `PORT` via `src/lib/utilities/serverUrl.ts`.

Manual fallback: `pnpm dev` (start), `pnpm devsafe` (clean dev — removes `.next`), `pnpm build`, `pnpm start`.

### Code Quality, Types, Testing

- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript type checking over `src/` (the root `tsconfig.json` excludes `tests`)
- `pnpm typecheck:tests` — the same over the whole test suite, via `tsconfig.test.json`
- `pnpm generate:types` — TypeScript types from Payload schema (after schema changes)
- `pnpm generate:importmap` — admin-panel import map
- `pnpm test:unit` — fast unit lane (~1–2 s, no Payload bootstrap)
- `pnpm test` / `pnpm test:int` / `pnpm test:e2e` — full / integration / E2E

**Local vs CI**: GitHub Actions runs the **full test suite** on every PR (see [Continuous Integration](#continuous-integration)); the **Next.js build runs on Railway** as part of the per-PR preview deploy, _not_ in GitHub Actions. Locally, default to **targeted** validation — lint, `pnpm test:unit`, and the specific integration spec(s) for the area you touched: `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts`. Don't routinely run the full `pnpm test:int` locally or `check.sh --full` / `validate.sh --full` — let CI catch the less-common, cross-cutting failures. Run them only to reproduce a red CI check or when explicitly asked.

If wrapping any of these in `timeout` (only when actually needed — most one-shot runs don't need it), use these canonical values; other values will trigger a permission prompt:

- `timeout 600 pnpm build` — Next.js cold build
- `timeout 300 pnpm test:*` — full integration/E2E suites
- `timeout 120 pnpm generate:*` — `generate:types` / `generate:importmap`

CPU resource management for tests: see `.claude/rules/testing-reqs.md` (never run multiple test commands or test+build in parallel).

## Code Editing

After changes: lint and fix all TypeScript errors. Run `pnpm generate:types` after schema changes.

### File Naming Conventions

macOS is case-insensitive but TypeScript/Webpack builds are case-sensitive. Always verify exact file casing when importing.

| Directory                    | Convention | Examples                               |
| ---------------------------- | ---------- | -------------------------------------- |
| `src/collections/`           | PascalCase | `Managers.ts`, `Pages.ts`              |
| `src/fields/`                | camelCase  | `permissionsField.ts`, `slugField.ts`  |
| `src/lib/`                   | camelCase  | `accessControl.ts`, `serverUrl.ts`     |
| `src/components/`            | PascalCase | `Dashboard.tsx`, `ProjectSelector.tsx` |
| `src/types/`                 | camelCase  | `roles.ts`, `users.ts`                 |
| `src/lib/richEditor/blocks/` | PascalCase | `TextBoxBlock.ts`, `GalleryBlock.ts`   |

Type organization: see `.claude/rules/types.md` (auto-loaded for TypeScript files).

## Quick Reference

### Rich Text Editor

- **Basic** (`basicRichTextEditor`): Bold, Italic, Link, InlineToolbar
- **Full** (`fullRichTextEditor`): Basic + Lists, Blockquote, Headings, Relationships, Blocks

Configuration: `src/lib/richEditor/index.ts`.

### Key Configuration Files

- `src/payload.config.ts` — main Payload CMS configuration
- `next.config.mjs` — Next.js configuration
- `src/payload-types.ts` — auto-generated types (do not edit)
- `tsconfig.json` — TypeScript path aliases
- `railway.toml` — Railway deployment configuration

### Data Seed Scripts

See [seeds/AGENTS.md](seeds/AGENTS.md). Available: Storyblok, WeMeditate, Meditations, Tags. Run via `pnpm seed <script>` or `pnpm seed:<script>`. All scripts support `--dry-run` and `--clear-cache`.

Schema migrations live in `src/migrations/` — see `.claude/rules/migrations.md`. Operator scripts in `scripts/` — see `.claude/rules/scripts.md`.

## Development Workflow

1. **Schema changes**: `pnpm generate:types` after modifying collections.
2. **Database**: PostgreSQL on Railway, managed by migrations in `src/migrations/`. Dev uses `push: true` (auto-schema-sync); prod applies migrations in-process on server boot via `prodMigrations`. See `.claude/rules/migrations.md` for details.
3. **Admin Access**: `/admin`.
4. **API Access**: REST API at `/api/*` (GraphQL disabled).
5. **Migrations**: Create locally, commit, and they auto-apply on the next deploy. **Attempt creation automatically first**: `timeout 30 pnpm db:migrations:create <name> --skip-empty < /dev/null` — `--skip-empty` suppresses the blank-migration prompt, and the timeout catches drizzle's rename-vs-create prompt (which hangs on non-TTY stdin). Hand the command to the user to run interactively **only** when it times out (exit 124). See `.claude/rules/migrations.md` for the full outcome table.

### Git Commands

- Prefer working-directory commands (`git status`, `git add`, ...) from the project root. Avoid `git -C <path>` for paths **inside** this project — the project root is already cwd. Sibling repos in the `~/Documents/WeMeditate` workspace are exempt: `git -C <sibling>` and `cd <sibling> && git …` are allowed for cross-repo work such as `/workflow:cross-repo-issue`.
- Commit messages use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`. Examples: `feat(lectures): split into Lectures + LectureClips`, `fix(e2e): reset SQLite DB at setup`. Common types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`. Match the style of recent `git log` when in doubt.

## PR workflow (3 phases)

PRs move through three phases. The point is to **batch CI runs** — don't push (and re-trigger CI) on every small change.

1. **Implement** — `/implement-issue <n>` takes a ticket end-to-end: implement + test, then run the finalize pipeline, which opens the PR and gets CI green.
2. **Adjust** — while iterating on an **open PR** (follow-up tweaks after `/implement-issue`, or any further work on a PR branch), **commit each change locally as you go, but do NOT push** — batching avoids re-running CI on every tweak. This is the one place that overrides the usual "commit/push only when asked" default: during the Adjust phase, commit follow-up changes locally without being asked; just never push (the user can still say "hold off" to pause committing).
3. **Finalize** — `/finalize-pr` ships the batch: simplify → `/code-review` → conditional `/security-review` (only when risky paths changed) → lean test gate → docs sync → push → open/refresh the PR description → watch CI (with capped fixes). Run it when the PR is ready for review/merge.

Skills come from the **`workflow` plugin** (`sydevs/claude-workflow`), enabled in `.claude/settings.json`: `/workflow:implement-issue` (phase 1) and `/workflow:finalize-pr` (phase 3, also reused by phase 1). Per-repo variation — lean gate, contract step, security-review trigger paths, the autonomy allowlist — lives in `.claude/workflow.json`. There is exactly one copy of each skill, so there is no parity spec to keep in sync.

## PR Requirements

The test suite runs in three tiers (see `.claude/rules/testing-reqs.md` for the full table):

| Tier           | Command                                     | Fires when                                               |
| -------------- | ------------------------------------------- | -------------------------------------------------------- |
| **1 — Hook**   | `pnpm test:unit`                            | Claude PostToolUse on `src/**` / `tests/unit/**` (< 5 s) |
| **2 — Pre-PR** | `pnpm lint && pnpm typecheck && pnpm typecheck:tests && pnpm test:unit`               | Local pr-prep lean gate (< 45 s)                         |
| **3 — CI**     | `pnpm lint && pnpm typecheck && pnpm typecheck:tests && pnpm test && pnpm test:smoke` | GitHub Actions on every PR (≤ 20 min)                    |

Before marking a PR ready, run the **Tier 2** lean gate plus the targeted integration spec(s) for what you changed. Use the `/pr-prep` skill (`.claude/skills/pr-prep/`) — its `--full` flag reproduces the Tier 3 checks locally when you need to debug a red run, and it documents handling pre-existing failures. Don't block on a local full-suite/build run — that's CI's job.

## Continuous Integration

GitHub Actions runs on every pull request (`.github/workflows/ci.yml`) as one job, **Lint, Test & Smoke**:

1. `pnpm lint`
2. `pnpm test` — unit + integration via a postgres:18 service container (Vitest injects DATABASE_URL env)
3. `pnpm test:smoke` — Playwright REST smoke specs against the per-PR **Railway preview** (its URL discovered via the Railway API; the step skips gracefully when there's no preview env or `RAILWAY_API_TOKEN`)

GitHub Actions does **not** build the app — the Next.js build runs on Railway when it creates the PR preview deployment. PR-only triggers; `concurrency: cancel-in-progress` cancels superseded runs on the same branch. CI **reports** status but does not block merges unless a branch-protection rule on `main` requires the `Lint, Test & Smoke` check to pass.

### A conflicted PR runs NO CI at all — and says nothing about why

**If `main` moves and your branch conflicts with it, GitHub schedules zero workflow runs for that branch.** A `pull_request` workflow runs against the *merge commit* GitHub computes for the PR, and a conflicted PR has no such commit — so there is nothing to run. Nothing announces this: `gh pr checks` lists only the non-Actions checks (Railway keeps deploying happily, because it builds your branch head, not the merge), `gh run list --branch <branch>` is simply empty, and the PR page shows no failed job. It looks exactly like a slow or broken scheduler.

**The diagnostic is one command** — reach for it before waiting on a run that will never come:

```bash
gh pr view <n> --json mergeable,mergeStateStatus
# mergeable: CONFLICTING, mergeStateStatus: DIRTY  → resolve the conflict; CI cannot run
# mergeable: MERGEABLE,   mergeStateStatus: CLEAN  → genuinely waiting on the scheduler
```

**The fix is to merge `origin/main` into the branch and resolve**, then push — the merge commit becomes computable and CI fires on the next push. Do not close/reopen the PR or push empty commits to "nudge" it; neither addresses the cause.

Two things make this easy to misread, and both cost real time in #632/#653:

- **A green run can be stale.** The last successful run was against the commit *before* `main` moved, so the PR looks tested when the conflict arose after that run. Always check the run's `head_sha` against your branch head.
- **Docs conflict more than code.** Two PRs adding sibling features (a second root endpoint, a third collection) rarely touch the same functions, but they routinely edit the same paragraph of the same `.claude/rules/*.md` list — which is enough to stop CI on both. When your change edits a shared rule doc, prefer wording that states the *criterion* rather than a count or an enumeration, so a sibling PR neither conflicts nor makes your sentence false.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive documentation.

- **Platform**: Railway (Node.js, via Railpack builder) + PostgreSQL + R2 (S3 API) + Cloudflare edge (Images, Stream, rate limiting, caching)
- **Production URL**: https://cloud.sydevelopers.com
- **Deploy**: Push to the branch; Railway auto-detects changes, builds with Railpack, and deploys. Migrations auto-apply in-process on server boot via `prodMigrations` in `src/payload.config.ts`.
- **Monitor**: Railway deploy logs and `tail` command (see DEPLOYMENT.md)
- Environment variables set in Railway service (secrets) and platform settings.

## Project Structure

Standard Next.js + Payload layout under `src/` (plugins, collections, components, globals, jobs, lib, types, fields, app routes, migrations). Tests live under `tests/{int,e2e,utils}/`. Path-scoped rules in `.claude/rules/` document the subsystems Claude is editing — see **`.claude/rules/project-structure.md`** for the `src/` layout and the rules governing where new code belongs (`plugins/` vs `jobs/` vs `lib/` vs an owner's folder).
