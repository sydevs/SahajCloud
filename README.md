# Sahaj Cloud CMS

A headless content management system built with **Next.js 15** and **PayloadCMS 3.0**. It runs on
**Railway** with **PostgreSQL** and Cloudflare R2 (S3 API) for storage, behind Cloudflare's edge
(Images, Stream, rate limiting, caching).

## Prerequisites

- **Node.js**: 22.17.0 (see `.node-version`)
- **pnpm**: `^11` (see `packageManager` in `package.json`)
- **PostgreSQL**: a local instance for development

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SahajCloud
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up the environment**
   ```bash
   cp .env.example .env
   ```

   Set at minimum:
   ```
   PAYLOAD_SECRET=your-secret-key-here-at-least-32-chars
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sahajcloud
   ```

4. **Start the development server**
   ```bash
   pnpm dev
   ```

5. **Open the admin panel**

   Go to http://localhost:3000/admin. Outside production and E2E runs, Payload auto-logs-in as
   `contact@sydevelopers.com` — there is no password to enter. On an empty database, follow the
   on-screen prompt to create the first admin.

## Key Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the development server |
| `pnpm devsafe` | Clean start (removes the `.next` cache first) |
| `pnpm build` | Build for production |
| `pnpm start` | Start the production server |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Check types in `src/` (`tsc --noEmit`) |
| `pnpm test` | Run unit and integration tests |
| `pnpm test:unit` | Run the fast unit lane (no Payload bootstrap) |
| `pnpm test:int` | Run integration tests against Postgres (Vitest) |
| `pnpm test:smoke` | Run smoke specs against a deployed preview (Playwright) |
| `pnpm generate:types` | Generate TypeScript types from the Payload schema |
| `pnpm db:migrate` | Apply pending database migrations |
| `pnpm seed` | Seed local data |

## Environment Configuration

Local development needs only `PAYLOAD_SECRET` and `DATABASE_URL`. Everything else defaults to
local Postgres (schema auto-synced by Drizzle `push`), local file storage, and Mailpit for
outbound email. See `.env.example` for the full list of variables and validation rules.

## Project Structure

Next.js and Payload share `src/`: `app/` for routes (frontend + admin/API), `collections/` and
`globals/` for the Payload schema, `components/`, `lib/`, and `migrations/`. Tests live under
`tests/`. See **[src/AGENTS.md](src/AGENTS.md)** for the full layout and the rules for where new
code belongs, and **[tests/AGENTS.md](tests/AGENTS.md)** for the test lanes.

## Windows Setup for Symlinks

This project uses symlinks (`CLAUDE.md` → `AGENTS.md`) for AI coding agent compatibility, at the
repository root and in every subdirectory with its own guide. To enable them on Windows:

1. Turn on **Developer Mode**: Settings → Privacy & Security → For developers
2. Run `git config --global core.symlinks true`
3. Re-clone the repository — existing clones keep plain files, not symlinks

If symlinks do not work, AI agents still work through the `@import` syntax.

## Further Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** — how the app runs on Railway today: infrastructure, the edge cache rule, environment variables, troubleshooting
- **[RAILWAY_RUNBOOK.md](RAILWAY_RUNBOOK.md)** — provisioning the Railway project from scratch, plus disaster recovery
- **[AGENTS.md](AGENTS.md)** — architecture, patterns, and development guidelines (also `CLAUDE.md`)
- **[docs/](docs/)** — architecture overview, environment variables, code style, MCP setup
- **Nested `AGENTS.md` guides** — subsystem rules, in the directory each one governs. Run `find src tests scripts seeds -name AGENTS.md` for the list.
