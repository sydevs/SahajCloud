# Sahaj Cloud CMS

A headless content management system built with **Next.js 16** and **PayloadCMS 3.0**. It runs on
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
| `pnpm db:refresh-from-prod` | Replace the local dev database with a copy of production (dry run without `--force`) |

## Environment Configuration

Local development needs only `PAYLOAD_SECRET` and `DATABASE_URL`. Everything else defaults to
local Postgres (schema auto-synced by Drizzle `push`), local file storage, and Mailpit for
outbound email. See `.env.example` for the full list of variables and validation rules.

### Working on a copy of production data

`pnpm db:refresh-from-prod --force` replaces the database `DATABASE_URL` resolves to (shell, then
`.env.local`, then `.env`) with a read-only `pg_dump` of production. It refuses a non-local target,
restores beside the old database and swaps only on success, clears the jobs production had queued,
and deletes the dump. Run it when you want fresh data, then restart the dev server — the schema
push on boot brings the copy up to your branch.

Before running the app on it:

- Point `DATABASE_URL` at your own database in `.env.local`, not the tracked `.env`. With the
  `/workflow:dev-server` skill, use the per-worktree name it prints (`sahajcloud_dev_<slug>`), so
  the server and the CLI share one database.
- Set `JOBS_AUTORUN_ENABLED=false` in `.env.local`. The scheduled queues and the screening kick
  that follows a new submission both mail real people and call real mailing-list APIs, with the
  keys copied from production. `--force` refuses to run until this is off.
- Install Postgres client tools at least as new as production's server (macOS: `brew install
  libpq`, then put `/opt/homebrew/opt/libpq/bin` on `PATH`) and log in with `railway login`.

The flag is not the whole guard. These reach production from your machine with it off, and no
code stops any of them:

- **`SMTP_URL`** — leave it unset, or point it at a Mailpit you run yourself, never the shared
  Railway one (`docs/rules/email.md`). Unset, mail is disabled with a warning, which is what keeps
  a sign-in link or a manager invitation from reaching the real person in the copy.
- **`CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_CACHE_PURGE_TOKEN`** — `purgeCloudflareCache` fires
  whenever both are present (`src/plugins/cache/purge.ts`). There is no environment check, so a
  local save would purge the production edge cache.
- **`railway run`** — never start the app with it on a prod copy. It injects production's
  environment name, which turns off the storage isolation that keeps a local delete away from
  production assets, and `RESEND_API_KEY`, which sends real mail.
- **A run you ask for ignores the flag**, by design: `pnpm payload jobs:run --queue nightly` and
  the admin's run-jobs endpoint. Four job docblocks suggest that exact command.
- **Saving a `clients` document** validates its mailing-list key against the real provider, with
  the key copied from production (`src/collections/Clients/hooks/validateMailingList.ts`). Read-only,
  so it spends somebody else's rate limit rather than their data.

Two more things to know:

- **Jobs queued while the flag was off still run when you turn it back on.** Payload schedules the
  cron rows before it checks `shouldAutoRun`, so they accumulate. Refresh again before re-enabling
  it, or the backlog delivers.
- A copy the dev server has already pushed is fine for exploring, but it is not evidence that a
  migration works: rehearse a migration on a fresh restore with `pnpm db:migrate`, never
  `pnpm dev`.

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
