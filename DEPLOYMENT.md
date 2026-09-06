# Deployment Documentation

How Sahaj Cloud runs today on Railway: infrastructure, the edge cache rule, environment
variables, the deploy workflow, and day-to-day troubleshooting. For provisioning a Railway
project from scratch, or for disaster recovery, see [RAILWAY_RUNBOOK.md](RAILWAY_RUNBOOK.md).

**Production URL**: https://cloud.sydevelopers.com

**Platform**: Railway Node.js server + PostgreSQL + R2 (S3-compatible) + Cloudflare edge (reverse proxy, Images, Stream, rate limiting, caching)

---

## Table of Contents

1. [Infrastructure Overview](#infrastructure-overview)
2. [Edge Cache (Cloudflare Cache Rule)](#edge-cache-cloudflare-cache-rule)
3. [Database Migrations](#database-migrations)
4. [Environment Variables](#environment-variables)
5. [Deployment Workflow](#deployment-workflow)
6. [Verifying Deployments](#verifying-deployments)
7. [Troubleshooting](#troubleshooting)
8. [Cost Monitoring](#cost-monitoring)

---

## Infrastructure Overview

**Components**:

- **Compute**: Railway (Node.js 22+)
- **Database**: Railway PostgreSQL 18
- **Storage**: Cloudflare R2 (S3-compatible, via `@aws-sdk/client-s3`)
- **CDN/Edge**: Cloudflare reverse proxy (rate limiting, Images, Stream, cache rules)

**Build & Start**:

- **Railpack** (Railway's native builder) detects the Node.js project and builds it — no Dockerfile.
- `pnpm build` runs `next build` (emits a self-contained `.next/standalone`, `output: 'standalone'`), then `scripts/standalone-postbuild.mjs` copies `.next/static` and `public/` next to `server.js` — Next does not copy these on its own.
- `pnpm start` runs `node .next/standalone/server.js` (`HOSTNAME=0.0.0.0`). It ships only the traced production dependencies, not the full `node_modules`.
- Migrations apply **in-process on server boot**, via Payload's `prodMigrations` hook (see [Database Migrations](#database-migrations)). The migration files import statically, so they trace into the bundle and still run at boot.
- `@sentry/nextjs` wraps `next.config.mjs` via `withSentryConfig`.

**Health Check**: Railway pings `/api/health` during a deploy. Startup takes about 5–10 seconds after the container starts.

**railway.toml**:

```toml
[build]
builder = "RAILPACK"

[deploy]
startCommand = "pnpm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

Railway builds with Railpack and exposes port 3000 through its own `PORT` variable.
`next.config.mjs`'s `outputFileTracingExcludes` keeps dev-only `media/`, `seeds/`, and tests out
of the trace — without it, a local `pnpm build` balloons `.next/standalone` to many GB.

---

## Edge Cache (Cloudflare Cache Rule)

The app makes client-facing API reads edge-cacheable **at the app layer**: it emits
`Cache-Control: public, s-maxage=…`, `Vary: Authorization`, and `Cache-Tag` for cacheable reads
(policy in `src/plugins/cache/`, applied by the `/api/**` middleware in `src/middleware.ts`).
These headers do nothing on their own — Cloudflare treats any request carrying an `Authorization`
header as private and serves it `cf-cache-status: DYNAMIC`, unless a **Cache Rule** marks the
path "Eligible for cache". Caching activates only once the rule below exists. Absent or disabled,
nothing is cached — that is a fail-safe, not a leak.

**Required Cache Rule** (Cloudflare dashboard → Caching → Cache Rules) — **live** on the
`sydevelopers.com` zone as the enabled rule *"Client read edge cache (Vary: Authorization)"*. It
covers both the custom client endpoints and the built-in REST collection reads:

- **Match** — a `GET` that **(a)** carries a non-empty `Authorization` header, **(b)** does
  **not** carry `x-sahajcloud-preview-secret`, and **(c)** has a cacheable-read path:
  `/api/<slug>` (list) or `/api/<slug>/…` (findByID and the custom sub-endpoints) for
  `slug ∈ {meditations, lectures, songs, app-cards, regions, audiences, events, pages, images,
  albums}`, plus root endpoints named individually (see the note below). Enumerated with `eq` /
  `starts_with`, since the Free plan has no regex `matches` operator.
- **⚠️ The `Authorization`-present condition is mandatory — never match a bare `/api/*`.**
  `Vary: Authorization` partitions the cache per API-key *value*, but it does not isolate the
  *absent*-header case. Without requiring `Authorization` present, Cloudflare serves the cached
  **authed** response to an **unauthenticated** request — `cf-cache-status: HIT`, `200` — even
  though the origin returns **403** for it. That is a verified production access-control bypass,
  and it also skips edge rate limiting and usage tracking. Requiring the header makes unauth
  reads fall through to the origin instead, matching the app's own middleware.
- **Eligible for cache**: ON. **Edge TTL**: Respect origin (honor the origin `s-maxage`).
- **`vary.authorization = passthrough`** — critical: this is what makes Cloudflare key a
  separate cached variant per API key, so one client is never served another's cached response.
  Set `vary.default = passthrough` too, **not `bypass`** — Next.js also stamps `rsc` /
  `next-router-*` / `Sec-CH-Prefers-Color-Scheme` onto `Vary`, and a `bypass` default would
  bypass on those before `Authorization` is even considered.
- **Preview bypass**: excluding requests that carry `x-sahajcloud-preview-secret` keeps
  draft-bearing live-preview reads out of cache. The app also emits `private, no-store` for
  those, as defense in depth.

Everything else stays `cf-cache-status: DYNAMIC` at the origin: writes, unauthenticated or
invalid-key reads (→ `403`), preview reads, and non-cacheable collections (`clients`, `managers`,
`users`, …).

> **⚠️ A root endpoint's path names no collection, so the slug list does not cover it by
> default.** `GET /api/atlas/seo` emits the same cacheable headers as any other client read, but
> `atlas` is not a collection slug, so it stayed `cf-cache-status: DYNAMIC` until
> `http.request.uri.path eq "/api/atlas/seo"` was added **to this rule's own path group**. Add a
> new root endpoint the same way — one more `eq` term on the existing rule, never a second rule.
> A separate rule would not carry the `Authorization`-present condition, and would reopen the
> same bypass.

**Purge-on-write** (optional): set `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_CACHE_PURGE_TOKEN` to
enable best-effort `Cache-Tag` purge when a cached collection is written (Cloudflare Enterprise
tag-purge). Unset, purge is a no-op — on the Free plan, the per-collection `s-maxage` TTL is the
invalidation path, so this is safe to leave unconfigured.

---

## Database Migrations

**Development** (local Postgres): `push: true` auto-syncs the schema — no migration files
needed. **Production** (Railway Postgres): `push: false`, so every schema change needs an
explicit migration file, applied **in-process on server boot** via Payload's `prodMigrations`
hook in `src/payload.config.ts`. There is no separate migration step or `preDeployCommand`.

**Creating a migration**:

```bash
# Ask the user to run this interactively — it can prompt for a name
pnpm db:migrations:create

# Apply locally to verify
pnpm payload migrate

# Commit both the .ts and .json files
git add src/migrations/
git commit -m "migration: <description>"
```

**Applying migrations** locally: `pnpm payload migrate` (apply pending), `pnpm payload
migrate:down` (roll back the last one — dev/test only). In production, migrations apply
automatically on boot, inside a Postgres transaction. No manual step is needed.

**Verifying**:

```sql
SELECT * FROM payload_migrations ORDER BY id DESC;  -- applied migrations
\d <table_name>                                     -- table structure (psql)
```

See [`src/migrations/AGENTS.md`](./src/migrations/AGENTS.md) for the full workflow: the
non-interactive attempt sequence, the outcome table, the out-of-order snapshot trap, and how to
reshape a migration that has already deployed to a PR preview.

---

## Environment Variables

Set production values in Railway: **Service → Variables → Add variable** (encrypted at rest).
Never paste a secret into git or email.

### Core

| Variable | Notes |
| --- | --- |
| `PAYLOAD_SECRET` | ≥32 chars. Payload's authentication and encryption secret. |
| `DATABASE_URL` | `postgres://user:password@host:5432/dbname` — the only required database variable. |
| `DATABASE_POOL_MAX` | Optional, default 10. `node-postgres` `pool.max`. Size it to the Railway Postgres connection limit divided by running instances, leaving headroom for in-process migrations and `psql`. |
| `DB_QUERY_LOGGING` | Optional, default false, **local dev only** — force-disabled when `NODE_ENV=production` (every Railway build, previews included). Logs Drizzle SQL and bound params. ⚠️ It logs bound params — emails, tokens, API keys. Never enable it against real or cloned production data. Use Railway's `log_min_duration_statement` for server-side timings there instead. |

### Storage and Cloudflare services

- `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — R2 (S3-compatible)
- `CLOUDFLARE_ACCOUNT_ID` — derives the R2 endpoint
- `CLOUDFLARE_R2_DELIVERY_URL` — public delivery URL, e.g. `https://assets.sydevelopers.com`
- `CLOUDFLARE_IMAGES_DELIVERY_URL`, `CLOUDFLARE_STREAM_DELIVERY_URL`, `CLOUDFLARE_STREAM_WEBHOOK_SECRET`
- `CLOUDFLARE_API_KEY` — one token for Images and Stream
- `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_CACHE_PURGE_TOKEN` — optional, enable purge-on-write (see [Edge Cache](#edge-cache-cloudflare-cache-rule))

### Sentry and Resend

- `NEXT_PUBLIC_SENTRY_DSN` — public, needed at build time and runtime
- `SENTRY_AUTH_TOKEN` — optional, for source-map upload
- `SENTRY_TRACES_SAMPLE_RATE` — optional, default 0.1. A low non-zero rate samples admin
  transactions with their DB-span breakdown. `0` disables tracing.
- `RESEND_API_KEY` — transactional email API key

### Captcha (Cloudflare Turnstile)

- `TURNSTILE_SECRET_KEY` — **required in production**. Server-side secret the write-guard plugin
  checks on `POST /api/user-messages` and `POST /api/event-submissions` (token in the
  `x-turnstile-token` header). Validated at point of use, not at boot, so a missing key cannot
  take the app or a PR preview down — but the verifier then **fails closed**: it refuses the
  write with `500` and logs `antiSpamGuard: Turnstile verification could not be completed`,
  `reason: "not-configured"`. It never lets a message through unverified. Pair it with the
  matching **site key** in the client widget (a different value, held by SahajAtlasWeb and
  WeMeditateWeb). Non-production can use Cloudflare's test keys —
  `1x0000000000000000000000000000000AA` always passes, `2x0000000000000000000000000000000AA`
  always fails — never in production. See [Turnstile
  testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

### Frontend URLs

- `WEMEDITATE_WEB_URL`, `SAHAJATLAS_URL` — build-time. `SAHAJATLAS_URL` feeds only the
  live-preview `frame-src` CSP and the `csrf` allowlist, not a canonical base — the Atlas host is
  `noindex` on three layers (#634).
- `WEMEDITATE_ATLAS_BASE_PATH` — optional, default `/map`. Every region no client owns resolves
  its canonical `webUrl` to `WEMEDITATE_WEB_URL + WEMEDITATE_ATLAS_BASE_PATH + webPath`, so this
  path must exist on We Meditate (#634).

---

## Deployment Workflow

1. **Verify locally**:

   ```bash
   pnpm test && pnpm lint && pnpm generate:types && pnpm build
   ```

2. **Create a migration**, if the schema changed:

   ```bash
   pnpm db:migrations:create   # ask the user to run this interactively
   ```

3. **Deploy**:

   ```bash
   git push origin main   # Railway builds and deploys, then runs migrations on boot
   ```

4. **Monitor**:

   ```bash
   railway logs -s sahajcloud --tail
   ```

5. **Verify**:

   ```bash
   curl https://cloud.sydevelopers.com/api/health
   curl https://cloud.sydevelopers.com/api/meditations
   ```

**Railway's deploy sequence**: detect the push → build via Railpack → start the app → Payload
applies pending migrations in-process on boot → Railway polls `/api/health` until ready → traffic
routes to the new instance → the previous instance keeps running until the new one is healthy
(zero-downtime).

The Next.js build can warn about Payload's dynamic migration loading and Sentry's source-map
processing — both are expected and do not affect the app.

## Verifying Deployments

Beyond the health and API checks in step 5 above: log in to the admin panel, create a test
record in a collection, upload a test file (R2), and trigger a password reset (Resend). To test
Sentry capture (production only — `503` in development):

```bash
curl https://cloud.sydevelopers.com/api/test-sentry?type=error
```

Verify the event in Sentry, tagged `test: true`, `endpoint: /api/test-sentry`, with a stack
trace and the right environment. For the first 24 hours after a major change, watch Railway logs
and Sentry for new errors, and watch Postgres and R2 usage.

---

## Troubleshooting

| Symptom | Diagnose | Fix |
| --- | --- | --- |
| Deploy fails or hangs | `railway logs -s sahajcloud --tail`, `railway variables list` | Fix the reported error, then `git push origin main` to redeploy |
| DB connection fails (`ENOTFOUND` / `ECONNREFUSED`) | `railway services list`, `psql "$DATABASE_URL" -c "SELECT 1;"` | Fix `DATABASE_URL` (`postgres://user:password@host:5432/dbname`) or, on a private network, verify Postgres is reachable |
| Migrations don't run (tables missing, `payload_migrations` empty) | `ls src/migrations/`, verify `prodMigrations` is in `src/payload.config.ts`, `railway logs -s sahajcloud --tail \| grep -i migrat` | A failed migration stops the server. Read the Drizzle/Payload error in the logs and fix it |
| Email not sending | `railway variables get RESEND_API_KEY`, then test the Resend API directly with `curl` | Review the Resend dashboard for bounces and rate limits |
| High error rate | Sentry, then `railway logs -s sahajcloud --tail \| grep -i error` | Review recent changes and env vars. Roll back if critical (see [RAILWAY_RUNBOOK.md § Disaster Recovery & Rollback](./RAILWAY_RUNBOOK.md#disaster-recovery--rollback)) |

---

## Cost Monitoring

| Service | Plan | Expected cost |
| --- | --- | --- |
| Railway | Standard usage | $5–20/month |
| Postgres | Railway built-in | included |
| R2 | 10GB+ storage | $1–5/month |
| Resend | 3k emails/month | $0/month |
| Sentry | Free tier | $0/month |
| **Total** | | **$6–25/mo** |

Railway bills per-minute resource usage (CPU, memory, bandwidth). Production typically runs
$10–15/month. Watch usage in the Railway dashboard (resource usage, Postgres disk, deploy
history) and set a cost-limit alert under **Billing → Cost limits**. Watch R2 usage under
**Cloudflare Dashboard → R2 → Analytics**.

---

## Related Documentation

- **Provisioning & disaster recovery**: [RAILWAY_RUNBOOK.md](./RAILWAY_RUNBOOK.md)
- **Main project docs**: [AGENTS.md](./AGENTS.md)
- **Database migrations**: [src/migrations/AGENTS.md](./src/migrations/AGENTS.md)
- **Storage**: [docs/rules/storage.md](./docs/rules/storage.md)
- **API clients & rate limiting**: [docs/rules/api-clients.md](./docs/rules/api-clients.md)
- **Railway docs**: https://docs.railway.app/
- **Cloudflare R2 / Images / Stream**: https://developers.cloudflare.com/r2/, /images/, /stream/
- **Resend docs**: https://resend.com/docs
