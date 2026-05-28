# AGENTS.md

This file provides guidance to AI coding agents when working with this repository.

**Supported agents**: Claude Code, OpenAI Codex, Cursor, and other AGENTS.md-compatible tools.

> `CLAUDE.md` is a symlink to this file for Claude Code compatibility.
> Claude-specific features (rules, hooks, skills) remain in the `.claude/` folder.

## Documentation

- **`.claude/rules/`** — path-scoped rules that auto-load when reading matching files (run `ls .claude/rules/` for the inventory; each file's frontmatter declares its globs)
- **`@.claude/docs/environment.md`** — environment variables and Wrangler configuration
- **`@.claude/docs/architecture.md`** — top-level architecture (collections, routes, logging, scheduled jobs)
- **`.claude/skills/`** — local workflow skills (run `ls .claude/skills/` to discover; each has a `SKILL.md`)
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — deployment documentation

## Overall Instructions

- Always ask before editing, creating, or closing a GitHub issue or PR.
- When continuing from a previous session: explicitly state what was previously decided/approved, confirm the continuation context, and proceed with implementation only if intent is clear.
- Prefer specialized MCP tools when researching: `mcp__cloudflare-docs__*` for Cloudflare, `mcp__sentry__*` for Sentry, `mcp__github__*` for GitHub. Use WebFetch only for sites without MCP coverage.
- **Payload docs**: use the `payload` skill first (local quick-reference + `.claude/skills/payload/reference/*.md` covers ~80% of common Q&A). For anything not in the skill — newer features, edge cases, exact API signatures — call `mcp__payloadcms-docs__list_doc_sources` → `mcp__payloadcms-docs__fetch_docs` (live docs via the `llms.txt` sitemap). Don't WebFetch `payloadcms.com` directly; the MCP returns cleaner markdown. **Context guard**: MCP responses land in the main thread (5–20KB per page). For single targeted lookups, call the MCP directly. For multi-page research (3+ pages, or unsure which page) — dispatch an `Explore` subagent and let _it_ call the MCP, so the main thread only receives the synthesized answer.

## Project Overview

A **Next.js 15** application integrated with **Payload CMS 3.0** — a headless content management system. TypeScript, SQLite (Cloudflare D1), configured for both development and production.

## Admin Access

Username: contact@sydevelopers.com
Password: evk1VTH5dxz_nhg-mzk

Admin panel at `http://localhost:{PORT}/admin/login` once the dev server is running.

## Essential Commands

### Development

Use the dev-server skill for a shared dev server across Claude sessions:

- `.claude/skills/dev-server/dev-server.sh` — start + tail logs (default)
- `.claude/skills/dev-server/dev-server.sh status|restart|stop`

The skill ensures a single shared instance, preventing port conflicts. Default port 3000; override with `PORT=4000 .claude/skills/dev-server/dev-server.sh`. `SAHAJCLOUD_URL` is derived from `PORT` via `src/lib/serverUrl.ts`.

Manual fallback: `pnpm dev` (start), `pnpm devsafe` (clean dev — removes `.next`), `pnpm build`, `pnpm start`.

### Code Quality, Types, Testing

- `pnpm lint` — ESLint
- `pnpm generate:types` — TypeScript types from Payload schema (after schema changes)
- `pnpm generate:importmap` — admin-panel import map
- `pnpm test:unit` — fast unit lane (~1–2 s, no Payload bootstrap)
- `pnpm test` / `pnpm test:int` / `pnpm test:e2e` — full / integration / E2E

**Local vs CI**: GitHub Actions runs the **full test suite + the Cloudflare build** on every PR (see [Continuous Integration](#continuous-integration)). Locally, default to **targeted** validation — lint, `pnpm test:unit`, and the specific integration spec(s) for the area you touched: `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts`. Don't routinely run the full `pnpm test:int` locally or `check.sh --full` / `validate.sh --full` — let CI catch the less-common, cross-cutting failures. Run them only to reproduce a red CI check or when explicitly asked.

If wrapping any of these in `timeout` (only when actually needed — most one-shot runs don't need it), use these canonical values; other values will trigger a permission prompt:

- `timeout 600 pnpm build:*` — Next.js + Cloudflare adapter cold builds
- `timeout 300 pnpm test:*` — full integration/E2E suites
- `timeout 120 pnpm generate:*` — `generate:types` / `generate:importmap`

CPU resource management for tests: see `.claude/rules/testing-reqs.md` (never run multiple test commands or test+build in parallel).

## Code Editing

After changes: lint and fix all TypeScript errors. Run `pnpm generate:types` after schema changes.

### File Naming Conventions

macOS is case-insensitive but TypeScript/Webpack builds are case-sensitive. Always verify exact file casing when importing.

| Directory          | Convention | Examples                               |
| ------------------ | ---------- | -------------------------------------- |
| `src/collections/` | PascalCase | `Managers.ts`, `Pages.ts`              |
| `src/fields/`      | camelCase  | `permissionsField.ts`, `slugField.ts`  |
| `src/lib/`         | camelCase  | `accessControl.ts`, `serverUrl.ts`     |
| `src/components/`  | PascalCase | `Dashboard.tsx`, `ProjectSelector.tsx` |
| `src/types/`       | camelCase  | `roles.ts`, `users.ts`                 |
| `src/blocks/`      | PascalCase | `TextBoxBlock.ts`, `GalleryBlock.ts`   |

Type organization: see `.claude/rules/types.md` (auto-loaded for TypeScript files).

## Quick Reference

### Rich Text Editor

- **Basic** (`basicRichTextEditor`): Bold, Italic, Link, InlineToolbar
- **Full** (`fullRichTextEditor`): Basic + Lists, Blockquote, Headings, Relationships, Blocks

Configuration: `src/lib/richEditor.ts`.

### Key Configuration Files

- `src/payload.config.ts` — main Payload CMS configuration
- `next.config.mjs` — Next.js configuration
- `src/payload-types.ts` — auto-generated types (do not edit)
- `tsconfig.json` — TypeScript path aliases
- `wrangler.toml` — Cloudflare deployment configuration

### Data Seed Scripts

See [seeds/AGENTS.md](seeds/AGENTS.md). Available: Storyblok, WeMeditate, Meditations, Tags. Run via `pnpm seed <script>` or `pnpm seed:<script>`. All scripts support `--dry-run` and `--clear-cache`.

Schema migrations live in `src/migrations/` — see `.claude/rules/migrations.md`. Operator scripts in `scripts/` — see `.claude/rules/scripts.md`.

## Development Workflow

1. **Schema changes**: `pnpm generate:types` after modifying collections.
2. **Database**: SQLite (Cloudflare D1), managed by migrations in `src/migrations/`. Push mode is disabled — see `.claude/rules/migrations.md` for the rationale.
3. **Admin Access**: `/admin`.
4. **API Access**: REST API at `/api/*` (GraphQL disabled).
5. **Migrations**: `pnpm payload migrate` to apply. **Ask the user to create migrations** — `pnpm db:migrations:create` prompts interactively and hangs when piped/backgrounded. See `.claude/rules/migrations.md`.

### Git Commands

- Prefer working-directory commands (`git status`, `git add`, ...) from the project root. Avoid `git -C <path>` unless absolutely necessary.
- Commit messages use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`. Examples: `feat(lectures): split into Lectures + LectureClips`, `fix(e2e): reset SQLite DB at setup`. Common types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`. Match the style of recent `git log` when in doubt.

## PR Requirements

Every PR is gated by CI (see [Continuous Integration](#continuous-integration)): it runs lint, the full `pnpm test` suite, and the Cloudflare build. Before marking a PR ready, validate **locally** with the lean gate — lint + `pnpm test:unit` + the targeted integration spec(s) for what you changed. Use the `/pr-prep` skill (`.claude/skills/pr-prep/`) for that workflow (its `--full` flag reproduces the CI checks locally when you need to debug a red run, and it documents handling pre-existing failures). Don't block on a local full-suite/build run — that's CI's job.

## Continuous Integration

GitHub Actions runs on every pull request (`.github/workflows/ci.yml`), in two parallel jobs:

- **Lint & Test** — `pnpm lint`, then `pnpm test` (unit + integration). Vitest injects its own env, so no secrets are needed.
- **Cloudflare Build** — `wrangler types`, then `wrangler deploy --dry-run --env=""` (runs the OpenNext build and final Wrangler packaging without publishing). Uses non-sensitive dummy env values — no GitHub Secrets.

PR-only triggers; `concurrency: cancel-in-progress` cancels superseded runs on the same branch. CI **reports** status but does not block merges unless a branch-protection rule on `main` requires the `Lint & Test` and `Cloudflare Build` checks to pass.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive documentation.

- **Platform**: Cloudflare Workers + D1 + R2
- **Production URL**: https://cloud.sydevelopers.com
- **Deploy**: `pnpm run deploy:prod` (migrations + app)
- **Monitor**: `wrangler tail sahajcloud --format pretty`
- `wrangler.toml` uses environments (`[env.dev]` for development). Set secrets via `wrangler secret put PAYLOAD_SECRET`, `SENTRY_DSN`, `RESEND_API_KEY`. Production migrations require `remote = true` in the D1 binding.

## Project Structure

Standard Next.js + Payload layout under `src/` (collections, components, globals, lib, types, blocks, fields, app routes, migrations). Tests live under `tests/{int,e2e,utils}/`. Path-scoped rules in `.claude/rules/` document the subsystems Claude is editing.
