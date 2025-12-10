# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation Structure

This project uses a distributed documentation structure to optimize context loading:

- **Root CLAUDE.md** (this file) - Essential commands, quick references, and project overview
- **Detailed Documentation** (`.claude/docs/`) - In-depth architecture, patterns, and guides loaded via @import

### Available Documentation

Architecture & Configuration:
- @.claude/docs/environment.md - Environment variables and Wrangler configuration
- @.claude/docs/architecture.md - Collections, routes, logging, Sentry integration, and system overview
- @.claude/docs/localization.md - 16-locale internationalization system
- @.claude/docs/globals.md - Global configuration (WeMeditate Web Settings)

Access Control & Security:
- @.claude/docs/rbac.md - Role-based access control system (managers and clients)
- @.claude/docs/api-auth.md - API authentication and usage tracking

UI & Admin Customization:
- @.claude/docs/custom-components.md - Server vs client components, performance patterns
- @.claude/docs/styling.md - PayloadCMS CSS variables reference
- @.claude/docs/navigation.md - Project-focused navigation and dashboards
- @.claude/docs/branding.md - Project-based branding and theming
- @.claude/docs/project-visibility.md - Collection visibility filtering by project

Collections & Features:
- @.claude/docs/collections/pages.md - Pages collection with Lexical blocks
- @.claude/docs/collections/lessons.md - Lessons (Path Steps) collection
- @.claude/docs/frame-editor.md - Audio-synchronized frame editor component
- @.claude/docs/video-thumbnails.md - Automatic video thumbnail generation

Integrations:
- @.claude/docs/plugins.md - SEO, Form Builder, and Better Fields plugins
- @.claude/docs/email.md - Email providers (Ethereal, Resend)

Development:
- @.claude/docs/patterns.md - Common code patterns and best practices
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
  - Use `mcp__plugin_sydevs-web_cloudflare-docs__search_cloudflare_documentation` for Cloudflare documentation (not WebFetch)
  - Use Sentry MCP tools for Sentry-related queries (not WebFetch)
  - Use GitHub MCP tools for GitHub operations (not gh CLI or WebFetch)
  - Only use WebFetch for websites without dedicated MCP integrations

## Project Overview

This is a **Next.js 15** application integrated with **Payload CMS 3.0**, providing a headless content management system. The project uses TypeScript, SQLite (Cloudflare D1), and is configured for both development and production deployment.

### PayloadCMS Documentation

**IMPORTANT**: The comprehensive PayloadCMS documentation for LLMs is available at:
**https://payloadcms.com/llms-full.txt**

Consult this documentation for detailed information about Payload CMS features, APIs, and best practices.

## Admin Access
Username: contact@sydevelopers.com
Password: evk1VTH5dxz_nhg-mzk

Access admin panel at http://localhost:{PORT}/admin/login once dev server is running.

## Essential Commands

### Development

**IMPORTANT - Development Server Port:**
- **ALWAYS** start dev server with explicit PORT between 4000-4999
- **NEVER** use port 3000 (causes conflicts)
- Example: `PORT=4237 pnpm dev` or `PORT=4891 pnpm devsafe`

Commands:
- `PORT={random 4000-4999} pnpm dev` - Start development server
- `PORT={random 4000-4999} pnpm devsafe` - Clean dev start (removes .next)
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

## Code Editing

After making changes to the codebase, always lint the code and fix all TypeScript errors.

If necessary, run `pnpm generate:types` after schema changes.

### Type Organization Best Practices

**When to Create Separate Type Files** (`src/types/`):
- Complex type hierarchies with 3+ related types
- Types used across multiple implementation files
- Types that form a cohesive domain (e.g., roles, users, permissions)

**When to Keep Types Inline**:
- Simple one-off types used in a single file
- Component-specific prop types
- Types tightly coupled to a specific implementation

**Type Organization Pattern**:
```
src/types/
├── [domain].ts  # Domain-specific types (e.g., roles.ts, users.ts)
├── [shared].ts  # Cross-cutting types (e.g., api.ts, common.ts)
└── index.ts     # Optional: Re-export all types
```

**Import Order for Types**:
1. External package types (from 'payload', 'react', etc.)
2. Internal type imports from `@/types/`
3. Internal type imports from other `@/` paths
4. Relative type imports

**Separation of Types from Data**:
- Type definitions go in `src/types/`
- Data/constants remain in implementation files
- Example: Role TYPES in `src/types/roles.ts`, role DATA (MANAGER_ROLES) in `src/fields/PermissionsField.ts`

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

### Data Import Scripts
- See [imports/README.md](imports/README.md) for detailed documentation
- Available: Storyblok, WeMeditate, Meditations, Tags imports
- Run via `pnpm import <script>` or `pnpm import:<script>`
- All scripts support `--dry-run`, `--reset`, and `--clear-cache` flags

**Note**: Database schema migrations are in `src/migrations/` - these import scripts are for data migration only.

## Development Workflow

1. **Schema Changes**: Run `pnpm generate:types` after modifying collections
2. **Database**: SQLite (Cloudflare D1) with auto-generated schema
3. **Admin Access**: Available at `/admin` route
4. **API Access**: REST API at `/api/*` (GraphQL disabled)
5. **Migrations**: `pnpm payload migrate` to run database migrations

### Database Migrations
- **Location**: `src/migrations/`
- **Running**: `pnpm payload migrate`
- **Rolling Back**: `pnpm payload migrate:down`

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
│   ├── content/            # Pages, Meditations, Music, Lessons
│   ├── resources/          # Media, Authors, Narrators, ExternalVideos
│   ├── system/             # Frames, Files
│   └── tags/               # MediaTags, MeditationTags, MusicTags, PageTags
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
