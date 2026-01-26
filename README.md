# Sahaj Cloud CMS

A headless content management system built with **Next.js 15** and **PayloadCMS 3.0**, deployed on Cloudflare Workers with D1 database and R2 storage.

## Prerequisites

- **Node.js**: `^18.20.2` or `>=20.9.0`
- **pnpm**: `^9` or `^10`

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

   Edit `.env` and set `PAYLOAD_SECRET` to a string of at least 32 characters:
   ```
   PAYLOAD_SECRET=your-secret-key-here-at-least-32-chars
   ```

4. **Start development server**
   ```bash
   pnpm dev
   ```

5. **Access the admin panel**

   Open http://localhost:3000/admin and follow the on-screen instructions to create your first admin user.

## Key Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm devsafe` | Clean start (removes `.next` cache first) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run all tests |
| `pnpm test:int` | Run integration tests (Vitest) |
| `pnpm test:e2e` | Run E2E tests (Playwright) |
| `pnpm generate:types` | Generate TypeScript types from Payload schema |
| `pnpm generate:importmap` | Generate import map for admin components |
| `pnpm payload migrate` | Run database migrations |
| `pnpm deploy:prod` | Deploy to production (migrations + app) |

## Environment Configuration

For local development, only `PAYLOAD_SECRET` is required. The application automatically uses:
- Local SQLite database
- Local file storage (no Cloudflare credentials needed)
- Ethereal Email for testing (captures outbound emails)

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

This project uses symlinks (`CLAUDE.md` → `AGENTS.md`) for AI coding agent compatibility.
Windows users need to enable symlink support:

1. **Enable Developer Mode**: Settings → Privacy & Security → For developers
2. **Configure Git**: `git config --global core.symlinks true`
3. **Re-clone the repository** (existing clones won't have symlinks)

If symlinks don't work, AI agents will still function via the `@import` syntax.

## Further Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Cloudflare deployment configuration and troubleshooting
- **[AGENTS.md](AGENTS.md)** - Detailed architecture, patterns, and development guidelines (also accessible via `CLAUDE.md` symlink)
