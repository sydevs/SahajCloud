# AGENTS.md

This file provides guidance to AI coding agents when working with this repository.

**Supported agents**: Claude Code, OpenAI Codex, Cursor, and other AGENTS.md-compatible tools.

> **Note**: `CLAUDE.md` is a symlink to this file for Claude Code compatibility.
> Claude-specific features (rules, hooks, skills) remain in the `.claude/` folder.

## Documentation Structure

This project uses a distributed documentation structure to optimize context loading:

- **Root AGENTS.md** (this file) - Essential commands, quick references, and project overview
- **Auto-loaded Rules** (`.claude/rules/`) - Path-scoped rules that load automatically when working with specific file types (Claude Code only)
- **Reference Documentation** (`.claude/docs/`) - In-depth architecture, patterns, and guides loaded via @import (Claude Code only)

### Auto-Loaded Rules (`.claude/rules/`)

Rules are automatically loaded based on which files you're editing:

| Rule File | Applies When Working With |
|-----------|---------------------------|
| `components.md` | `src/components/**/*.tsx` |
| `admin-ui.md` | `src/components/admin/**/*.tsx`, `src/globals/**/*.ts` |
| `types.md` | `src/types/**/*.ts`, `**/*.ts` |
| `collections.md` | `src/collections/**/*.ts`, `src/fields/**/*.ts` |
| `tests.md` | `tests/**/*.spec.ts` |
| `endpoints.md` | `src/endpoints/**/*.ts` |
| `code-style.md` | All files (global) |
| `pr-requirements.md` | All files (global) |
| `testing-reqs.md` | All files (global) |

### Reference Documentation

Architecture & Configuration:
- @.claude/docs/environment.md - Environment variables and Wrangler configuration
- @.claude/docs/architecture.md - Collections, routes, logging, Sentry integration, and system overview
- @.claude/docs/localization.md - 16-locale internationalization system
- @.claude/docs/globals.md - Global configuration (project-based config and translations)

Access Control & Security:
- @.claude/docs/rbac.md - Role-based access control system (managers and clients)
- @.claude/docs/api-auth.md - API authentication and usage tracking

UI & Admin Components:
- @.claude/docs/components/custom-components.md - Server vs client components, performance patterns
- @.claude/docs/styling.md - PayloadCMS CSS variables reference
- @.claude/docs/components/navigation.md - Project-focused navigation and dashboards
- @.claude/docs/components/branding.md - Project-based branding and theming
- @.claude/docs/components/project-visibility.md - Collection visibility filtering by project
- @.claude/docs/components/frame-editor.md - Audio-synchronized frame editor component
- @.claude/docs/components/blocks.md - Custom block icons for Lexical editor

Collections & Features:
- @.claude/docs/collections/pages.md - Pages collection with Lexical blocks
- @.claude/docs/collections/lessons.md - Lessons (Path Steps) collection
- @.claude/docs/video-thumbnails.md - Automatic video thumbnail generation

Integrations:
- @.claude/docs/plugins.md - SEO, Form Builder plugins, and built-in slug generation
- @.claude/docs/email.md - Email providers (Ethereal, Resend)
- @.claude/docs/openapi.md - OpenAPI/Scalar API documentation with branding and role filtering

Development:
- @.claude/docs/patterns.md - Common code patterns (file upload, trash, custom endpoints)
- @.claude/docs/refactoring.md - Refactoring patterns (collection renames)
- @.claude/docs/testing.md - Testing strategy with in-memory SQLite
- @.claude/docs/decisions/ffmpeg.md - Architectural decision: FFmpeg deprecation

**See also**: [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive deployment documentation

## Claude Code Plugin

This project uses the **SY Developers Toolkit** plugin which provides slash commands, MCP servers, and development workflows.

### Plugin Features
- GitHub, Sentry, Puppeteer, and Serena MCP integrations
- Slash commands for code implementation, debugging, and reviews
- Automated hook setup via `/meta:setup-hooks`

### Available Commands
- `/code:implement-issue <number>` - Implement GitHub issues end-to-end
- `/code:draft-ticket [description]` - Draft detailed GitHub issues
- `/review:review-pr <number>` - Comprehensive PR reviews
- `/debug:fix-bug [description]` - Systematic bug fixing
- `/meta:setup-hooks` - Configure development hooks

For full documentation, see: https://github.com/sydevs/claude-plugins

## Overall Instructions
- Always ask me before editing, creating, or closing a GitHub issue or PR
- When continuing from a previous session:
  - Explicitly state what was previously decided/approved
  - Confirm understanding of the continuation context
  - If a conversation summary is provided, acknowledge key decisions from it
  - Proceed with implementation only if continuation intent is clear
- When researching or fetching documentation, prefer specialized MCP tools over generic tools:
  - Use `payloadcms-docs` MCP server for PayloadCMS documentation (fetch_docs, list_doc_sources)
  - Use `mcp__plugin_sydevs-web_cloudflare-docs__search_cloudflare_documentation` for Cloudflare documentation (not WebFetch)
  - Use Sentry MCP tools for Sentry-related queries (not WebFetch)
  - Use GitHub MCP tools for GitHub operations (not gh CLI or WebFetch)
  - Only use WebFetch for websites without dedicated MCP integrations

## Project Overview

This is a **Next.js 15** application integrated with **Payload CMS 3.0**, providing a headless content management system. The project uses TypeScript, SQLite (Cloudflare D1), and is configured for both development and production deployment.

### PayloadCMS Documentation

Use the `payloadcms-docs` MCP server for PayloadCMS documentation:
- `list_doc_sources` - List available documentation sections
- `fetch_docs` - Fetch specific documentation pages

The MCP server caches documentation from https://payloadcms.com/llms.txt to avoid rate limiting.

## Admin Access
Username: contact@sydevelopers.com
Password: evk1VTH5dxz_nhg-mzk

Access admin panel at http://localhost:{PORT}/admin/login once dev server is running.

## Essential Commands

### Development

**Dev Server Management:**
Use the dev-server skill to manage a shared development server across all Claude sessions:
- `.claude/skills/dev-server/dev-server.sh` - Start + tail logs (default)
- `.claude/skills/dev-server/dev-server.sh status` - Check if running
- `.claude/skills/dev-server/dev-server.sh restart` - Restart server
- `.claude/skills/dev-server/dev-server.sh stop` - Stop server

The skill ensures a single server instance is shared, preventing port conflicts.

**Port Configuration:**
- Default port: 3000 (managed by dev-server skill)
- Dynamic port: Set `PORT` env var (e.g., `PORT=4000 .claude/skills/dev-server/dev-server.sh`)
- `SAHAJCLOUD_URL` is automatically derived from `PORT` via `src/lib/serverUrl.ts`

**Manual Commands** (use dev-server skill instead when possible):
- `pnpm dev` - Start development server
- `pnpm devsafe` - Clean dev start (removes .next)
- `pnpm build` - Production build
- `pnpm start` - Start production server

### Code Quality & Types
- `pnpm lint` - Run ESLint
- `pnpm generate:types` - Generate TypeScript types from Payload schema (run after schema changes)
- `pnpm generate:importmap` - Generate import map for admin panel

### Testing
- `pnpm test` - Run all tests (integration + E2E)
- `pnpm test:int` - Run integration tests (Vitest)
- `pnpm test:e2e` - Run E2E tests (Playwright)

**IMPORTANT - CPU Resource Management:**
- **Never run multiple test commands in parallel** - Always wait for one test run to complete before starting another
- **Don't run tests concurrently with builds** - `pnpm build` and `pnpm test` should not run simultaneously
- **Single test process only** - Run `pnpm test` or `pnpm test:int` as a single sequential operation
- Vitest handles internal parallelization efficiently - external parallelization causes CPU overload

## Code Editing

After making changes to the codebase, always lint the code and fix all TypeScript errors.

If necessary, run `pnpm generate:types` after schema changes.

### File Naming Conventions

**IMPORTANT**: macOS is case-insensitive but TypeScript/Webpack builds are case-sensitive. Always verify exact file casing when importing.

| Directory | Convention | Examples |
|-----------|------------|----------|
| `src/collections/` | PascalCase | `Managers.ts`, `Pages.ts` |
| `src/fields/` | camelCase | `permissionsField.ts`, `slugField.ts` |
| `src/lib/` | camelCase | `accessControl.ts`, `serverUrl.ts` |
| `src/components/` | PascalCase | `Dashboard.tsx`, `ProjectSelector.tsx` |
| `src/types/` | camelCase | `roles.ts`, `users.ts` |
| `src/blocks/` | PascalCase | `TextBoxBlock.ts`, `GalleryBlock.ts` |

**Import Verification**: Before importing a file, check the actual filename casing to avoid build failures like:
```
Type error: File name 'PermissionsField.ts' differs from already included file name 'permissionsField.ts' only in casing.
```

**Note**: Type organization guidelines are in `.claude/rules/types.md` (auto-loaded when working with TypeScript files).

## Quick Reference

### Rich Text Editor Configuration

- **Basic Editor** (`basicRichTextEditor`): Bold, Italic, Link, InlineToolbar
- **Full Editor** (`fullRichTextEditor`): Basic + Lists, Blockquote, Headings, Relationships, Blocks

Configuration: `src/lib/richEditor.ts`

### Key Configuration Files
- `src/payload.config.ts` - Main Payload CMS configuration
- `next.config.mjs` - Next.js configuration
- `src/payload-types.ts` - Auto-generated types (do not edit)
- `tsconfig.json` - TypeScript configuration with path aliases
- `wrangler.toml` - Cloudflare deployment configuration

### Data Seed Scripts
- See [seeds/AGENTS.md](seeds/AGENTS.md) for detailed documentation
- Available: Storyblok, WeMeditate, Meditations, Tags seeds
- Run via `pnpm seed <script>` or `pnpm seed:<script>`
- All scripts support `--dry-run` and `--clear-cache` flags

**Note**: Database schema migrations are in `src/migrations/` - these seed scripts are for data migration only.

### Operator Scripts (`scripts/`)

One-off operator scripts (NOT seeds — seeds live in `seeds/`). Use for tasks an operator runs manually from their machine: external API registration, one-time backfills, deployment helpers, etc.

- **Location**: `scripts/<name>.ts` (TypeScript, run via `pnpm tsx scripts/<name>.ts`)
- **Env access**: Read `process.env` directly, NOT the validated `serverEnv` module — the script runs from a local shell and shouldn't require unrelated env vars to be set
- **Safety**: For destructive or state-changing scripts, add a `--force` flag guard and print a warning before making mutations
- **Example**: [scripts/setup-stream-webhook.ts](scripts/setup-stream-webhook.ts) — registers the Cloudflare Stream webhook and prints the signing secret

## Development Workflow

1. **Schema Changes**: Run `pnpm generate:types` after modifying collections
2. **Database**: SQLite (Cloudflare D1) managed by migration files in `src/migrations/` (push mode is disabled; see below)
3. **Admin Access**: Available at `/admin` route
4. **API Access**: REST API at `/api/*` (GraphQL disabled)
5. **Migrations**: `pnpm payload migrate` to run database migrations

### Database Migrations
- **Location**: `src/migrations/`
- **Local dev uses migrations, not push-sync.** The D1 adapter is configured with `push: false` in `src/payload.config.ts`, so the local dev DB is shaped by the same migration files that run in production. Drizzle's push mode silently skips some SQLite ALTER TABLE rebuilds (notably polymorphic-FK renames — see below), which caused an invisible dev/prod drift that bit us in PR #292. Never flip this back to push mode without replacing this guidance.
- **First-time dev setup (or after `pnpm reset --local`)**: run `pnpm payload migrate` before the dev server can boot. The server doesn't auto-apply migrations on start.
- **Creating**: **Ask the user to run `pnpm db:migrations:create` for you — do not run it yourself.** The command prompts interactively for a migration name and hangs silently when backgrounded or piped (the shell's stdout buffering hides the prompt). Agents that attempt it end up with a frozen shell and waste real time before being interrupted. Pause, describe the schema changes you made, and ask the user to run the command and confirm the new `.ts` + `.json` pair exists. Then augment the `.ts` if needed (see below) and commit both files.
- **Running**: `pnpm payload migrate`. Never pipe through `| tail` or background — the output is buffered and you lose visibility into progress + any interactive prompts.
- **Rolling Back**: `pnpm payload migrate:down`

**Important**: Both `.ts` and `.json` files are required for each migration:
- The `.ts` file contains the migration logic (SQL statements or Payload operations)
- The `.json` file is the Drizzle schema snapshot used for rollback

**Data-only migrations** (no schema changes): If a migration only modifies data (e.g., deleting records, updating values) without changing the schema, copy the previous migration's `.json` file and rename it to match your new migration timestamp. This ensures the schema snapshot chain remains intact.

**Known Drizzle bug — polymorphic relationship rename**: When a polymorphic relationship's `relationTo` changes (e.g. `'lectures'` → `'lecture-clips'`), Drizzle emits a table rebuild like `INSERT INTO __new_foo_rels(..., "lecture_clips_id", ...) SELECT ..., "lecture_clips_id", ... FROM foo_rels` — but the old `foo_rels` only has `lectures_id`, so SQLite throws `no such column: lecture_clips_id` at migration time. Fix by dropping the new column from both sides of the INSERT/SELECT (the typical "don't rewrite polymorphic FKs" decision). Scan the generated `_rels` rebuilds for this whenever you rename a polymorphic relationTo.

**Augmenting generated migrations**: **Default: don't.** Leave the output of `pnpm db:migrations:create` exactly as generated. Hand-editing has repeatedly caused FK / table-rebuild bugs (polymorphic FK renames, `_rels` rebuilds, versioned-table companion drift), so the cost of a clean post-deploy resync is lower than the risk of a broken migration. Augment only when (a) the migration fails without the edit (e.g. the Drizzle polymorphic-FK rewrite bug above), or (b) the user has explicitly asked for the augmentation. If an issue spec calls for a data backfill inside the migration, **surface the trade-off to the user** ("spec asks for backfill; doing so historically causes FK issues — prefer a post-deploy sync/job?") rather than deciding unilaterally. When you do edit, change only what's necessary — no defensive NULL-ing, no redundant cleanups FK cascade already handles. Features should also be designed so an unpopulated new column degrades gracefully (endpoints skip rows with a missing field) until a follow-up sync/job hydrates it.

### Git Commands
- **Prefer working directory commands** - Use `git status`, `git add`, etc. from the project root
- **Avoid `git -C <path>`** - Only use the `-C` flag when absolutely necessary (e.g., operating on a different repository)
- **Commit message style** - This project uses [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`, e.g. `feat(lectures): split into Lectures + LectureClips`, `fix(e2e): reset SQLite DB at setup`, `refactor(tests): split unit/int lanes`. Common types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`. Match the style of recent `git log` output when in doubt.

## PR Completion Requirements

**IMPORTANT**: Before creating or marking a PR as ready for review, ensure:

1. **Full test suite passes**: Run `pnpm test` (or `pnpm test:int` + `pnpm test:e2e` separately)
   - All tests must pass (0 failures)
   - No skipped tests allowed - fix them or remove them with justification
   - If pre-existing failures exist on `main`, fix them as part of the PR

2. **Build succeeds**: Run `pnpm build` to verify production build works

3. **Linting passes**: Run `pnpm lint` with no errors

4. **Types check**: Run `pnpm tsc --noEmit` if you've made type changes

### Handling Pre-existing Test Failures

If you create a feature branch from `main` and discover failing tests:
- **Do not ignore them** - fix them as part of your PR
- If the fix is unrelated to your feature, create a separate commit explaining the fix
- Document in the PR description that pre-existing failures were fixed

### Test Results in PR Description

Include test results summary in PR description:
```
## Test Results
- Integration tests: X passed
- E2E tests: X passed
- Build: ✓ Success
```

## Deployment

**For comprehensive deployment documentation**, see [DEPLOYMENT.md](DEPLOYMENT.md).

**Quick Reference**:
- **Platform**: Cloudflare Workers with D1 database and R2 storage
- **Production URL**: https://cloud.sydevelopers.com
- **Deploy**: `pnpm run deploy:prod` (migrations + app)
- **Monitor**: `wrangler tail sahajcloud --format pretty`

**Critical Notes**:
- `wrangler.toml` uses environments pattern (`[env.dev]` for development)
- Set secrets via `wrangler secret put PAYLOAD_SECRET`, `SENTRY_DSN`, `RESEND_API_KEY`
- Production migrations require `remote = true` in D1 binding

## Project Structure Overview

```
src/
├── app/
│   ├── (frontend)/          # Public Next.js pages
│   └── (payload)/           # Payload CMS admin & API
├── collections/             # Payload CMS collections
│   ├── access/             # Managers, Clients
│   ├── content/            # Pages, Meditations, Songs, Albums, Videos, Lessons
│   ├── resources/          # Authors, Narrators, Lectures, Images
│   ├── system/             # Frames, Files
│   └── tags/               # MeditationTags, SongTags
├── components/             # React components
├── globals/                # Global configurations
├── types/                  # TypeScript type definitions
├── lib/                    # Utilities and helpers
└── migrations/             # Database migrations

tests/
├── int/                    # Integration tests (Vitest)
├── e2e/                    # E2E tests (Playwright)
└── utils/                  # Test helpers & factories
```

---

**Note**: For detailed architecture, patterns, and implementation guides, see the @import references at the top of this file.

## Windows Setup for Symlinks

This project uses symlinks (`CLAUDE.md` → `AGENTS.md`) for Claude Code compatibility.
Windows users need to enable symlink support:

1. **Enable Developer Mode**: Settings → Privacy & Security → For developers
2. **Configure Git**: `git config --global core.symlinks true`
3. **Re-clone the repository** (existing clones won't have symlinks)

If symlinks don't work, Claude Code will still function - it will just see a text file containing the symlink target path, which it can follow via `@import`.
