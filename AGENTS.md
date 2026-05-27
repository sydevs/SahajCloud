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
- Prefer specialized MCP tools when researching: `payloadcms-docs` MCP for PayloadCMS, `mcp__cloudflare-docs__*` for Cloudflare, `mcp__sentry__*` for Sentry, `mcp__github__*` for GitHub. Use WebFetch only for sites without MCP coverage.

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
- `pnpm test` / `pnpm test:int` / `pnpm test:e2e` — full / integration / E2E

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

Before creating or marking a PR ready for review: full test suite passes, build succeeds, lint passes. Use the `/pr-prep` skill (`.claude/skills/pr-prep/`) for the full pre-PR validation workflow including handling pre-existing failures.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive documentation.

- **Platform**: Cloudflare Workers + D1 + R2
- **Production URL**: https://cloud.sydevelopers.com
- **Deploy**: `pnpm run deploy:prod` (migrations + app)
- **Monitor**: `wrangler tail sahajcloud --format pretty`
- `wrangler.toml` uses environments (`[env.dev]` for development). Set secrets via `wrangler secret put PAYLOAD_SECRET`, `SENTRY_DSN`, `RESEND_API_KEY`. Production migrations require `remote = true` in the D1 binding.

## Project Structure

Standard Next.js + Payload layout under `src/` (collections, components, globals, lib, types, blocks, fields, app routes, migrations). Tests live under `tests/{int,e2e,utils}/`. Path-scoped rules in `.claude/rules/` document the subsystems Claude is editing.
