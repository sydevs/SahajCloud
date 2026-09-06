# Environment Setup

## Required Environment Variables

Copy `.env.example` and configure it.

### Core

- `PAYLOAD_SECRET` — secret key for authentication (min 32 chars).
- `DATABASE_URL` — PostgreSQL connection string: `postgres://user:password@host:5432/dbname`.
- `NEXT_PUBLIC_LOG_LEVEL` — `silent` | `error` | `warn` | `info` | `debug`, for the server Pino logger and the client logger.
- `RESEND_API_KEY` — Resend API key. Falls back to a mock in dev.

### Storage (R2, S3-compatible)

R2 is used in both dev and prod. Local file storage applies automatically when credentials are unset.

- `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — bucket and credentials, under R2 → Buckets.
- `CLOUDFLARE_ACCOUNT_ID` (Account Home) — derives the S3 endpoint: `https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `auto`.
- `CLOUDFLARE_R2_DELIVERY_URL`, `CLOUDFLARE_IMAGES_DELIVERY_URL`, `CLOUDFLARE_STREAM_DELIVERY_URL` — public delivery base URLs (copy the base from any existing delivery or player URL, drop the id).
- `CLOUDFLARE_API_KEY` — token with Images + Stream edit scope.
- `CLOUDFLARE_STREAM_WEBHOOK_SECRET` — HMAC secret for the Stream webhook (production only).

### Claude-usable credentials (`.env.claude.local`)

Separate from `.env`, gitignored, and never committed. It lets an agent operate infrastructure directly.

| Key | What it opens |
| --- | --- |
| `CLOUDFLARE_CLAUDE_KEY` | Cloudflare API token — Cache Rules on the `sydevelopers.com` zone. |
| `ADMIN_PASSWORD` | `contact@sydevelopers.com` on production, via `POST /api/managers/login`. |

```bash
set -a; . ./.env.claude.local; set +a
```

Never echo these values, redact anything derived from them, and delete any scratch token when done.

**Check here before you report a credential unavailable.** The `CLOUDFLARE_*` variables in `.env` are runtime config only and cannot edit a Cache Rule. That, plus an unauthenticated Railway CLI, does not mean no usable token exists.

The "Admin Access" credentials in `AGENTS.md` are the local dev admin, unrelated to the production password above.

### Live Preview URLs

- `WEMEDITATE_WEB_URL` — required. We Meditate preview URL, for Pages/Meditations live preview and the CSP `frame-src`.
- `SAHAJATLAS_URL` — required. Sahaj Atlas preview URL, for the same purposes plus the `csrf` allowlist. Not a canonical base — the Atlas host is `noindex`, so `webUrl` never points at it.
- `WEMEDITATE_ATLAS_BASE_PATH` — optional, default `/map`. Feeds the fallback `webUrl` for a region no client owns: `WEMEDITATE_WEB_URL + WEMEDITATE_ATLAS_BASE_PATH + webPath`.

Neither URL takes a trailing slash, since both are used as prefixes and compared against `Origin` headers. **Restart `next dev` after you change these** — `next.config.mjs` bakes the CSP allowlist at boot, so a stale server blocks the preview iframe (`ERR_BLOCKED_BY_CSP`).

## Environment Variable Validation

Zod validates every variable at module load, in `src/lib/env.ts`, into `serverEnv` (secrets, API keys) and `clientEnv` (`NEXT_PUBLIC_*` only, exposed to the browser). To add one: add it to the right schema with a Zod rule, update `.env.example`, and run `pnpm generate:types` if needed.

A missing `PAYLOAD_SECRET` or `DATABASE_URL` stops the app from starting. A missing Cloudflare credential in dev falls back to local storage. Production requires all four: `PAYLOAD_SECRET`, `DATABASE_URL`, the Cloudflare credentials, and `RESEND_API_KEY`.

## Railway Configuration

`railway.toml` uses Railpack, with `start.command = 'pnpm start'`. Migrations apply automatically on boot, via `prodMigrations`.

### Preview environments provision their own admin

`PREVIEW_ADMIN_PASSWORD` is set on Railway's preview environments, and passed to the smoke lane as a CI secret. On every boot, `onInit` reconciles the admin account to the current value (`src/plugins/previewAdmin`), so rotating the secret takes effect on the next deploy.

Production is detected by Railway's environment name, never `NODE_ENV`. Previews also run `NODE_ENV=production` — the same trap that once sent preview mail through Resend to real addresses. The gate also requires a Railway environment name at all. This keeps `onInit` inert in local dev, CI, and both test lanes. CI does hold the password as a secret, so a gate reading only that would write an admin into the integration lane's database.

`PREVIEW_ADMIN_EMAIL` overrides the account address, defaulting to `contact@sydevelopers.com`. Environments forked before 2026-08-27 never got the variable, and keep whatever admin an early smoke run seeded.

### Local Development

```env
DATABASE_URL=postgres://user:password@localhost:5432/sy_devs_cms
PAYLOAD_SECRET=your-secret-here
R2_BUCKET=sahajcloud
R2_ACCESS_KEY_ID=your-key
R2_SECRET_ACCESS_KEY=your-secret
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_KEY=your-token
CLOUDFLARE_IMAGES_DELIVERY_URL=https://imagedelivery.net/hash
CLOUDFLARE_STREAM_DELIVERY_URL=https://customer-code.cloudflarestream.com
CLOUDFLARE_R2_DELIVERY_URL=https://assets.sydevelopers.com
NEXT_PUBLIC_LOG_LEVEL=debug
WEMEDITATE_WEB_URL=http://localhost:5173
WEMEDITATE_ATLAS_BASE_PATH=/map
SAHAJATLAS_URL=http://localhost:5173
```

### Production (Railway)

Set variables in the Railway Dashboard (Service → Variables). They are encrypted at rest and injected at build and runtime. `SAHAJCLOUD_URL` must equal the public origin (`https://cloud.sydevelopers.com`) — it feeds CSP, CORS, and CSRF validation.

See [DEPLOYMENT.md](../DEPLOYMENT.md) for the full deployment configuration and troubleshooting.
