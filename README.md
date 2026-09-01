# Sahaj Cloud CMS

A headless content management system built with **Next.js 15** and **PayloadCMS 3.0**, deployed on
**Railway** with **PostgreSQL** and Cloudflare R2 (S3 API) for storage, behind Cloudflare's edge
services (Images, Stream, rate limiting, caching).

## Prerequisites

- **Node.js**: 22.17.0 (see `.node-version`)
- **pnpm**: `^11` (see `packageManager` in `package.json`)
- **PostgreSQL**: a local instance for development

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sy-devs-cms
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at minimum:
   ```
   PAYLOAD_SECRET=your-secret-key-here-at-least-32-chars
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sahajcloud
   ```

4. **Start development server**
   ```bash
   pnpm dev
   ```

5. **Access the admin panel**

   Open http://localhost:3000/admin. Outside production and E2E runs Payload auto-logs-in as
   `contact@sydevelopers.com`, so there is no password to enter; on an empty database, follow the
   on-screen prompt to create the first admin.

## Key Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm devsafe` | Clean start (removes `.next` cache first) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Type-check `src/` (`tsc --noEmit`) |
| `pnpm test` | Run unit + integration tests |
| `pnpm test:unit` | Fast unit lane (no Payload bootstrap) |
| `pnpm test:int` | Integration tests against Postgres (Vitest) |
| `pnpm test:smoke` | Smoke specs against a deployed preview (Playwright) |
| `pnpm generate:types` | Generate TypeScript types from Payload schema |
| `pnpm generate:importmap` | Generate import map for admin components |
| `pnpm db:migrate` | Apply pending database migrations |
| `pnpm seed` | Seed local data |

## Environment Configuration

For local development, `PAYLOAD_SECRET` and `DATABASE_URL` are required. The application otherwise
defaults to:
- Local Postgres, with the schema auto-synced by Drizzle `push` (migrations run in production only)
- Local file storage (no Cloudflare credentials needed)
- Mailpit for capturing outbound email in development and PR previews (7-day retention, shareable links)

See `.env.example` for the full list of available environment variables and their validation requirements.

## Project Structure

```
src/
├── app/
│   ├── (frontend)/     # Public Next.js pages
│   └── (payload)/      # Payload admin & API routes
├── collections/        # Payload CMS collections
│   ├── access/         # Managers, Clients
│   ├── content/        # Pages, Meditations, Songs, etc.
│   ├── resources/      # Authors, Narrators, Images
│   └── tags/           # MeditationTags, SongTags
├── components/         # React components
├── globals/            # Global configurations
├── lib/                # Utilities and helpers
└── migrations/         # Database migrations

tests/
├── int/                # Integration tests
├── e2e/                # E2E tests (Playwright)
└── utils/              # Test helpers
```

## Windows Setup for Symlinks

This project uses symlinks (`CLAUDE.md` → `AGENTS.md`) for AI coding agent compatibility —
at the repository root and in every subdirectory that carries its own guide.
Windows users need to enable symlink support:

1. **Enable Developer Mode**: Settings → Privacy & Security → For developers
2. **Configure Git**: `git config --global core.symlinks true`
3. **Re-clone the repository** (existing clones won't have symlinks)

If symlinks don't work, AI agents will still function via the `@import` syntax.

## Further Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Railway deployment configuration and troubleshooting
- **[RAILWAY_RUNBOOK.md](RAILWAY_RUNBOOK.md)** - Operational runbook for the Railway service
- **[AGENTS.md](AGENTS.md)** - Detailed architecture, patterns, and development guidelines (also accessible via `CLAUDE.md` symlink)
- **[docs/](docs/)** - Architecture overview, environment variables, code style, and MCP setup
- **Nested `AGENTS.md` guides** - subsystem rules stored in the directory they govern (`src/collections/`, `src/plugins/storage/`, `tests/`, …); AI agents pick them up when reading files there. `find src tests scripts seeds -name AGENTS.md` lists them.
