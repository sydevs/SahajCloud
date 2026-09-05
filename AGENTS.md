# AGENTS.md

This file guides AI coding agents working in this repository.

**Supported agents**: Claude Code, OpenAI Codex, Cursor, and other AGENTS.md-compatible tools.

> `CLAUDE.md` is a symlink to this file, for Claude Code. Every nested guide below is paired the same way. Claude-specific features (hooks, skills, commands) stay in `.claude/`.

## Documentation

Subsystem guidance loads two ways, by whether its scope is one directory:

- **Nested `AGENTS.md` guides** — for a subsystem that is one directory subtree. It loads when an agent reads a file there (a `CLAUDE.md` symlink sits beside each one). Run `find src tests scripts seeds -name AGENTS.md` for the inventory.
- **`docs/rules/*.md`** — for a pattern that spans directories. Each file has `paths:` frontmatter and loads on a matching file. `.claude/rules/` holds symlinks to these files, not copies: a write under `.claude/` triggers Claude Code's Protected Paths guard and stalls an unattended run. Run `ls .claude/rules/` for the inventory.
- **`@docs/code-style.md`**, **`@docs/environment.md`**, **`@docs/architecture.md`** — global rules loaded every session.
- **`.claude/skills/`** — local workflow skills. Run `ls .claude/skills/` to list them.
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — deployment documentation.

## Overall Instructions

- Ask before you edit or close a GitHub PR or issue, and before you create or edit an issue. A new PR needs no prior approval.
- After a previous session: state what was already decided, check the context, then proceed only once the intent is clear.
- Use a specialized MCP tool for research: `mcp__cloudflare-docs__*`, `mcp__sentry__*`, `mcp__github__*`. Use WebFetch only where no MCP tool covers the site.
- **Payload docs**: check the `payload` skill first. Otherwise call `mcp__payloadcms-docs__list_doc_sources`, then `mcp__payloadcms-docs__fetch_docs`. Never fetch `payloadcms.com` directly. For research over 3+ pages, dispatch an `Explore` subagent so the main thread fetches only the synthesized answer.

## Project Overview

A Next.js 15 app on Payload CMS 3.0, a headless CMS. TypeScript, PostgreSQL, deployed on Railway. Cloudflare R2 (S3 API) handles storage. Cloudflare's edge (Images, Stream, rate limiting, caching) sits in front.

## Admin Access

Admin panel: `http://localhost:{PORT}/admin/login`, once the dev server runs.

**Local dev needs no password.** `src/payload.config.ts` auto-logs in as `contact@sydevelopers.com` outside production and E2E runs. If you still see the login form, re-seed the local admin instead of hunting for a password.

| Environment | Credential |
| --- | --- |
| Railway PR preview | `PREVIEW_ADMIN_PASSWORD` (a Railway preview env var, also a CI secret). Every preview deploy resets the admin to it (`src/plugins/previewAdmin`). Environments forked before 2026-08-27 never got the variable and keep an old seeded admin. |
| Production | `ADMIN_PASSWORD` in `.env.claude.local` — see `docs/environment.md`. |

## Essential Commands

Use the `/workflow:dev-server` skill for a dev server shared across sessions. It prevents port conflicts. Default port 3000. Override with `PORT=4000`. `SAHAJCLOUD_URL` derives from `PORT`. Manual fallback: `pnpm dev`, `pnpm devsafe` (clean, removes `.next`), `pnpm build`, `pnpm start`.

- `pnpm lint` — ESLint.
- `pnpm typecheck` / `pnpm typecheck:tests` — type-check `src/` / the test suite.
- `pnpm generate:types` — regenerate types after a schema change.
- `pnpm generate:importmap` — regenerate the admin import map.
- `pnpm test:unit` — the fast unit lane, no Payload bootstrap.
- `pnpm test` / `pnpm test:int` — the full suite / integration only.
- `pnpm test:smoke` — Playwright smoke specs against a Railway preview.

Locally, run lint, `pnpm test:unit`, and the integration spec for the area you changed. Let CI run the full suite. See `docs/rules/testing-reqs.md` for the tier policy and the CPU rules (never run test commands, or a test and a build, in parallel).

Wrap a slow command in `timeout` only when needed. Other values trigger a permission prompt: `timeout 600 pnpm build`, `timeout 300 pnpm test:*`, `timeout 120 pnpm generate:*`.

## Code Editing

After a change: lint, and fix every TypeScript error. Run `pnpm generate:types` after a schema change.

macOS ignores filename case, but TypeScript and Webpack builds do not — check exact casing when you import. See `docs/code-style.md` for the naming table, and `src/types/AGENTS.md` for type organization.

## Quick Reference

- **Rich text editor** — Basic (`basicRichTextEditor`): Bold, Italic, Link, InlineToolbar. Full (`fullRichTextEditor`): Basic + Lists, Blockquote, Headings, Relationships, Blocks. Config: `src/lib/richEditor/index.ts`.
- **Key files** — `src/payload.config.ts` (Payload config), `next.config.mjs` (Next.js config), `src/payload-types.ts` (generated, do not edit), `tsconfig.json` (path aliases), `railway.toml` (Railway config).
- **Seed scripts** — see [seeds/AGENTS.md](seeds/AGENTS.md): Storyblok, WeMeditate, Meditations, Tags. Run with `pnpm seed <script>` or `pnpm seed:<script>`. Every script supports `--dry-run` and `--clear-cache`.
- **Migrations** — `src/migrations/`, see its `AGENTS.md`. **Operator scripts** — `scripts/`, see its `AGENTS.md`.

## Development Workflow

1. Change a collection, then run `pnpm generate:types`.
2. Database is PostgreSQL on Railway, via migrations in `src/migrations/`. Dev uses `push: true` (auto-sync). Prod applies migrations in-process on boot. See `src/migrations/AGENTS.md`.
3. Admin is at `/admin`. REST API is at `/api/*` (GraphQL disabled).
4. To add a migration: create it locally, commit it, and it auto-applies on the next deploy. Run `timeout 30 pnpm db:migrations:create <name> --skip-empty < /dev/null` first. This suppresses the blank-migration prompt and catches drizzle's rename-vs-create prompt, which hangs on non-TTY input. Only on exit 124, hand the command to the user to run interactively. See `src/migrations/AGENTS.md` for the full outcome table.

### Git Commands

- Run git commands from the project root. Avoid `git -C <path>` for paths inside this project. Sibling repos in `~/Documents/WeMeditate` are exempt: `git -C <sibling>` and `cd <sibling> && git …` are fine for cross-repo work.
- Commits use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>` — e.g. `feat(lectures): split into Lectures + LectureClips`. Match recent `git log` style when unsure.

## PR workflow (3 phases)

Batch CI runs: do not push, and so retrigger CI, on every small change.

1. **Implement** — `/workflow:implement-issue <n>` implements and tests a ticket, then runs the finalize pipeline to open the PR.
2. **Adjust** — on an open PR, commit each follow-up change locally as you go, but do not push. This is the one exception to "commit only when asked": commit without asking, but never push without asking.
3. **Finalize** — `/workflow:finalize-pr` ships the batch and opens or refreshes the PR. See the finalize-pr skill in the `workflow` plugin for the exact pipeline.

Both skills come from the `workflow` plugin (`sydevs/claude-workflow`), enabled in `.claude/settings.json`. Per-repo variation — the lean gate, the contract step, security-review trigger paths, the autonomy allowlist — lives in `.claude/workflow.json`.

**Before marking a PR ready**: run the Tier 2 lean gate plus the integration spec(s) you touched. See `docs/rules/testing-reqs.md` for the tier policy. Use `/pr-prep` (`.claude/skills/pr-prep/`). Its `--full` flag reproduces Tier 3 locally, for debugging a red CI run. Otherwise let CI run the full suite and the build.

## Continuous Integration

GitHub Actions (`.github/workflows/ci.yml`) runs one job, **Lint, Test & Smoke**, on every PR. It runs `pnpm lint`, then `pnpm test` (against a `postgres:18` container), then `pnpm test:smoke` (Playwright, against the PR's Railway preview — skipped with no preview). It does not build the app. Railway builds it for the preview. A new push cancels the branch's prior run. CI reports status but blocks a merge only if branch protection requires it.

### A conflicted PR runs no CI

If `main` moves and your branch conflicts, GitHub silently schedules zero CI runs for it (#632, #653). Diagnose first, before you wait on a run that will never come:

```bash
gh pr view <n> --json mergeable,mergeStateStatus
```

`CONFLICTING` / `DIRTY` means: resolve the conflict before CI can run. Merge `origin/main` in, resolve, then push — never close and reopen the PR, and never push an empty commit. See (why: docs/why.md#a-conflicted-pr-schedules-zero-ci-runs).

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full documentation.

- **Platform**: Railway (Railpack builder) + PostgreSQL + R2 (S3 API) + Cloudflare edge (Images, Stream, rate limiting, caching).
- **Production**: https://cloud.sydevelopers.com
- **Deploy**: push to the branch. Railway builds and deploys it. Migrations apply in-process on boot, via `prodMigrations` in `src/payload.config.ts`.
- **Monitor**: Railway deploy logs. Environment variables live in the Railway service and platform settings.

## Project Structure

Standard Next.js + Payload layout under `src/` (plugins, collections, components, globals, jobs, lib, types, fields, app routes, migrations). Tests live under `tests/{int,e2e,utils}/`. See **`src/AGENTS.md`** for the layout and where new code belongs (`plugins/` vs `jobs/` vs `lib/` vs an owner's folder).
