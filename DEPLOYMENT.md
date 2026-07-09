# Deployment Documentation

This document provides comprehensive deployment procedures, troubleshooting, and production configuration for the SY Developers CMS deployed on Railway.

**Production URL**: https://cloud.sydevelopers.com

**Platform**: Railway Node.js server + PostgreSQL + R2 (S3-compatible) + Cloudflare edge (reverse proxy, Images, Stream, rate limiting, caching)

---

## Table of Contents

1. [Infrastructure Overview](#infrastructure-overview)
2. [Deployment Commands](#deployment-commands)
3. [Database Migrations](#database-migrations)
4. [Environment Variables](#environment-variables)
5. [Deployment Workflow](#deployment-workflow)
6. [Verifying Deployments](#verifying-deployments)
7. [Troubleshooting](#troubleshooting)
8. [Cost Monitoring](#cost-monitoring)
9. [Preview Environment](#preview-environment)

---

## Infrastructure Overview

### Railway + PostgreSQL Platform

The application is deployed to **Railway**, a modern platform for building and deploying applications. The app runs as a long-lived Node.js server.

**Components**:

- **Compute**: Railway (Node.js 22+)
- **Database**: Railway PostgreSQL 18 (latest major)
- **Storage**: Cloudflare R2 (S3-compatible object storage via `@aws-sdk/client-s3`)
- **CDN/Edge**: Cloudflare reverse proxy (rate limiting, Images, Stream, cache rules)

**Build & Start**:

- **Railpack** (Railway's native builder): Railway detects Node.js project and builds automatically
- `railway.toml`: `[build] builder = "RAILPACK"` and `[deploy] startCommand = "pnpm start"`
  - `pnpm build` → `next build` (emits a self-contained `.next/standalone`, `output: 'standalone'`) followed by a postbuild step (`scripts/standalone-postbuild.mjs`) that copies `.next/static` + `public/` next to `server.js` — Next does not copy these automatically
  - `pnpm start` → `node .next/standalone/server.js` (`HOSTNAME=0.0.0.0`): ships only traced production deps + a minimal server, not the full `node_modules` (much smaller runtime image)
- Migrations applied **in-process on server boot** via Payload `prodMigrations` hook (see [Database Migrations](#database-migrations)) — the migration files are statically imported, so they trace into the standalone bundle and still run on boot
- `Sentry` via `@sentry/nextjs` (wraps `next.config.mjs` with `withSentryConfig`)

**Health Check**:

- Railway pings `/api/health` during deploy to verify readiness
- Startup takes ~5–10 seconds after container init

### Edge Cache (Cloudflare Cache Rule)

Client-facing API reads are made edge-cacheable **at the app layer**: the app emits
`Cache-Control: public, s-maxage=…` + `Vary: Authorization` (+ `Cache-Tag`) for cacheable reads
(policy in `src/plugins/cache/` — the `cachePlugin` module registered in
`src/payload.config.ts` + the `/api/**` middleware in `src/middleware.ts`). These headers are
**inert on their own**: Cloudflare treats any request carrying an `Authorization` header as
private and serves it `cf-cache-status: DYNAMIC` unless a **Cache Rule** marks the path "Eligible
for cache". Caching therefore only activates once the rule below exists — **absent or disabled,
nothing is cached (fail-safe: no cross-client leak, just no edge HITs).**

**Required Cache Rule** (Cloudflare dashboard → Caching → Cache Rules) — the same rule #552
introduced for the custom client endpoints, broadened by #555 to the built-in REST collection
reads:

- **Match**: the cacheable API paths — custom client endpoints (`/api/audiences/for-user`,
  `/api/*/for-audience`, `/api/*/related-*`, `/api/*/songs`, `/api/events/geojson`) and built-in
  collection reads (`/api/{meditations,lectures,albums,images,songs,audiences,app-cards,events,regions,pages}`
  and their `/…/:id` form). A single `/api/*` match is also safe — the app only emits `public` on
  the cacheable subset, so writes and non-cacheable paths stay `DYNAMIC` regardless.
- **Eligible for cache**: ON (respect the origin `Cache-Control`).
- **`vary.authorization = passthrough`** — **critical**: this is what makes Cloudflare key a
  separate cached variant per API key. Without it (or with a shared/normalized cache key) one
  client could be served another client's cached response. Set `vary.default = passthrough` too,
  **not `bypass`**: Next.js also stamps `rsc` / `next-router-*` / `Sec-CH-Prefers-Color-Scheme`
  onto `Vary`, and a `bypass` default would bypass on those before `Authorization` is considered.
- **Preview bypass**: a condition that bypasses cache when the `x-sahajcloud-preview-secret`
  request header is present, so draft-bearing live-preview reads are never cached (the app also
  emits `private, no-store` for those as defense-in-depth).

**Purge-on-write** (optional): set `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_CACHE_PURGE_TOKEN` to enable
best-effort `Cache-Tag` purge when a cached collection is written (Cloudflare Enterprise tag-purge;
on the Free plan the per-collection `s-maxage` TTL is the invalidation path). Unset → purge is a
no-op, so this is safe to leave unconfigured.

### Configuration Files

**next.config.mjs**:

- `output: 'standalone'` — self-contained server bundle (see Build & Start above)
- `outputFileTracingExcludes` — keeps dev-only `media/`/`seeds/`/tests out of the trace (same intent as `.railwayignore`, different mechanism); without it a local `pnpm build` balloons `.next/standalone` to many GB
- Wrapped with `withSentryConfig` from `@sentry/nextjs`
- Next.js configured with Cloudflare integration for image optimization

**railway.toml**:

```toml
[build]
builder = "RAILPACK"

[start]
cmd = "pnpm start"
```

- Railway uses Railpack (native builder) — no Dockerfile needed
- Exposes port 3000 via Railway `PORT` env var

---

## Deployment Commands

### Production Deployment

```bash
# Build locally
pnpm build

# Push to Railway via git (triggers automatic build & deploy)
git push origin main  # (or your configured Railway deploy branch)
```

**Note**: Migrations are applied **automatically on server boot** via Payload's `prodMigrations` hook — there is no separate migration step or preDeployCommand.

### Monitoring

```bash
# View Railway deployment logs
railway logs -s sahajcloud --tail

# Check deployment status in Railway dashboard
# https://railway.app/project/[project-id]

# Tail live logs (development)
railway logs --tail
```

---

## Database Migrations

### Migration Workflow

Migrations are managed via Payload CMS and Drizzle ORM. The workflow differs between development and production:

**Development** (`DATABASE_URL` points to local Postgres):

- `push: true` — schema is auto-synced (no migration files needed for rapid iteration)
- Run `pnpm payload migrate` to apply any checked-in migration files

**Production** (`DATABASE_URL` points to Railway Postgres):

- `push: false` — schema changes require explicit migration files
- Migrations are applied **in-process on server boot** via Payload's `prodMigrations` hook in `src/payload.config.ts`
- No preDeployCommand or separate migration step needed
- All 36 legacy SQLite/D1 migrations were deleted; the Postgres baseline is generated fresh on first Railway deploy

### Creating New Migrations

```bash
# Ask the user to run this interactively (it prompts for a name)
pnpm db:migrations:create

# This creates a migration file in src/migrations/

# Apply locally to verify
pnpm payload migrate

# Commit both the .ts and .json files
git add src/migrations/
git commit -m "migration: <description>"
```

### Applying Migrations

**Locally**:

```bash
pnpm payload migrate          # apply pending
pnpm payload migrate:down     # roll back last (dev/test only)
```

**Production**:

- Migrations are applied **in-process on server boot** via Payload's `prodMigrations` hook
- No manual intervention needed; migrations are atomic via Postgres transactions

### Verifying Migrations

```bash
# Check applied migrations
SELECT * FROM payload_migrations ORDER BY id DESC;

# Verify table structure
\d <table_name>  -- psql

# Check specific table row count
SELECT COUNT(*) FROM managers;
```

### Postgres Advantages Over D1

- **Transactional DDL**: all migrations are ACID — if one statement fails, the whole transaction rolls back
- **Deferrable foreign keys**: Postgres can defer FK checks within a transaction, eliminating the D1 `PRAGMA foreign_keys=OFF` cascade-null gotcha
- **Real ALTER TABLE**: column renames, type changes, and constraint updates are standard SQL
- **No connection pooling quirks**: unlike D1's per-call statement boundary

---

## Environment Variables

### Production Secrets

Set via Railway service settings (encrypted at rest):

```bash
# In Railway dashboard:
# Service → Variables → Add variable
PAYLOAD_SECRET=<secret>
RESEND_API_KEY=<key>
DATABASE_URL=postgres://...
R2_BUCKET=<bucket>
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
CLOUDFLARE_ACCOUNT_ID=<id>
CLOUDFLARE_API_KEY=<token>
CLOUDFLARE_IMAGES_DELIVERY_URL=<url>
CLOUDFLARE_STREAM_DELIVERY_URL=<url>
CLOUDFLARE_STREAM_WEBHOOK_SECRET=<secret>
CLOUDFLARE_R2_DELIVERY_URL=<url>
NEXT_PUBLIC_SENTRY_DSN=<dsn>
SENTRY_AUTH_TOKEN=<token>
```

### Required Variables

**Core Configuration**:

- `PAYLOAD_SECRET` - Payload authentication secret (min 32 chars)
- `DATABASE_URL` - PostgreSQL connection string (Railway Postgres)
  - Format: `postgres://user:password@host:5432/dbname`

**Database (Railway Postgres)**:

- `DATABASE_URL` - the only **required** database variable
- No SQLite, no D1 configuration
- `DATABASE_POOL_MAX` _(optional, default 10)_ - node-postgres `pool.max`. Size
  to the **Railway Postgres connection limit ÷ running instances** (e.g. a
  20-connection limit across 2 instances → `max` ≈ 8–10 each, leaving headroom
  for in-process migrations and psql). Capping the pool stops bursts of parallel
  admin work (a bulk publish runs its per-doc queries concurrently) from
  exhausting connections.
- `DB_QUERY_LOGGING` _(optional, default false; **local dev only**)_ - set to
  `true` to log Drizzle SQL + params. Force-disabled when `NODE_ENV=production`
  (which Railway builds — staging previews included — always set). ⚠️ It logs
  bound params (emails, tokens, API keys), so **never enable it in any env with
  real or cloned prod data** — use Railway `log_min_duration_statement` for
  server-side query timings there instead.

**Storage (R2 S3-compatible API)**:

- `R2_BUCKET` - R2 bucket name (e.g., `sahajcloud`)
- `R2_ACCESS_KEY_ID` - R2 API access key
- `R2_SECRET_ACCESS_KEY` - R2 API secret key
- `CLOUDFLARE_ACCOUNT_ID` - for R2 endpoint derivation
- `CLOUDFLARE_R2_DELIVERY_URL` - public delivery URL (e.g., `https://assets.sydevelopers.com`)

**Cloudflare Services** (unchanged):

- `CLOUDFLARE_IMAGES_DELIVERY_URL` - Images delivery base URL
- `CLOUDFLARE_STREAM_DELIVERY_URL` - Stream video base URL
- `CLOUDFLARE_STREAM_WEBHOOK_SECRET` - webhook signature secret
- `CLOUDFLARE_API_KEY` - API token for Images + Stream

**Error Monitoring (Sentry)**:

- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN (public; client + server)
- `SENTRY_AUTH_TOKEN` - for source maps upload (optional)
- `SENTRY_TRACES_SAMPLE_RATE` _(optional, default 0.1)_ - performance-tracing
  sample rate (0–1). A low non-zero rate samples admin transactions (bulk edits,
  admin API reads) with their DB-span breakdown; set `0` to disable tracing.

**Email (Resend)**:

- `RESEND_API_KEY` - transactional email API key

**Frontend URLs**:

- `WEMEDITATE_WEB_URL` - We Meditate Web frontend URL
- `SAHAJATLAS_URL` - Sahaj Atlas frontend URL

---

## Deployment Workflow

### Step-by-Step Production Deployment

1. **Verify Local Changes**:

   ```bash
   # Run tests
   pnpm test

   # Run linting
   pnpm lint

   # Generate types
   pnpm generate:types

   # Build locally
   pnpm build
   ```

2. **Create Migration** (if schema changed):

   ```bash
   pnpm db:migrations:create   # ask user to run interactively
   ```

3. **Deploy to Production**:

   ```bash
   # Push to Railway's deploy branch (usually main)
   # Migrations will run automatically on server boot
   git push origin main
   ```

4. **Monitor Deployment**:

   ```bash
   # Watch logs in Railway
   railway logs -s sahajcloud --tail

   # Or in the Railway dashboard:
   # https://railway.app/project/[project-id]/services/sahajcloud/logs
   ```

5. **Verify Deployment**:

   ```bash
   # Health check
   curl https://cloud.sydevelopers.com/api/health

   # Test API
   curl https://cloud.sydevelopers.com/api/meditations
   ```

### Railway Deploy Sequence

Railway automatically:

1. Detects a git push to the deploy branch
2. Builds the app via Railpack (`pnpm build` → `.next/standalone` + asset copy)
3. Starts the app: `pnpm start` → `node .next/standalone/server.js`
4. Payload **applies all pending migrations in-process on server boot** (via `prodMigrations` hook in `src/payload.config.ts`)
5. Monitors `/api/health` until the server is ready (health checks passing)
6. Routes traffic from Cloudflare edge proxy to the new instance
7. Keeps previous instance running until new instance fully ready (zero-downtime deploy)

### Deployment Warnings (Expected & Safe)

The Next.js build may produce warnings for:

- **Dynamic imports**: Payload CMS's dynamic migration loading
- **Optimizations**: Sentry source map processing

These are expected and do not affect functionality.

---

## Verifying Deployments

### Browser Tests

Visit the production site:

- [ ] Access admin: https://cloud.sydevelopers.com/admin
- [ ] Login with credentials
- [ ] Create test record in each collection
- [ ] Upload test file (verify R2 integration)
- [ ] Trigger password reset (verify email via Resend)
- [ ] Check Sentry for errors
- [ ] Check Railway deployment logs

### API Tests

```bash
# Health check
curl https://cloud.sydevelopers.com/api/health

# Test REST API
curl https://cloud.sydevelopers.com/api/meditations
```

### Sentry Error Tracking Tests

Test Sentry error capture in production:

```bash
# Test error capture
curl https://cloud.sydevelopers.com/api/test-sentry?type=error

# Test message capture
curl https://cloud.sydevelopers.com/api/test-sentry?type=message

# Expected response (production only):
# {
#   "success": true,
#   "message": "Test error captured successfully",
#   "eventId": "abc123...",
#   "testType": "error"
# }
```

**Verification**:

1. Visit Sentry dashboard: https://sentry.io/organizations/your-org/issues/
2. Check for test events with tags:
   - `test: true`
   - `endpoint: /api/test-sentry`
3. Verify event details include:
   - Stack trace (for error type)
   - Environment: production
   - Timestamp and context

**Note**: Test endpoint only works in production (`NODE_ENV=production`). In development, it returns a 503 error.

### Monitoring (First 24 Hours)

- [ ] Monitor Railway deployment logs for errors
- [ ] Monitor Sentry for exceptions
- [ ] Check Railway PostgreSQL usage in dashboard
- [ ] Check R2 storage usage
- [ ] Verify email deliverability (Resend dashboard)
- [ ] Test frontend integration

---

## Troubleshooting

### Railway Deployment Fails

**Symptoms**:

- Deployment hangs or shows red status in Railway dashboard
- Logs show build or startup errors

**Solutions**:

1. Check Railway logs:

   ```bash
   railway logs -s sahajcloud --tail
   ```

2. Verify environment variables are set in Railway:

   ```bash
   railway variables list
   ```

3. Verify DATABASE_URL is correct:

   ```bash
   railway variables get DATABASE_URL
   ```

4. Redeploy after fixing issues:
   ```bash
   git push origin main   # re-trigger deploy
   ```

### Database Connection Fails

**Symptoms**:

- `Error: ENOTFOUND` or `connect ECONNREFUSED`
- Admin page shows database error

**Solutions**:

1. Verify DATABASE_URL format:

   ```
   postgres://user:password@host:5432/dbname
   ```

2. Check Railway PostgreSQL service is running:

   ```bash
   railway services list
   ```

3. Verify credentials:

   ```bash
   railway variables get DATABASE_URL
   psql $DATABASE_URL -c "SELECT 1;"  # test connection
   ```

4. Check network connectivity — if Railway app is in a private network, ensure the Postgres service is accessible.

### Migrations Don't Run

**Symptoms**:

- Tables not created after deploy
- `payload_migrations` table empty
- Server boots but admin panel shows schema errors

**Solutions**:

1. Check migration files exist in `src/migrations/`:

   ```bash
   ls src/migrations/
   ```

2. Verify `src/payload.config.ts` includes `prodMigrations` in the adapter config:

   ```typescript
   postgresAdapter({
     prodMigrations: migrations, // <- should be present
     // ...
   })
   ```

3. Check Railway logs for migration output:

   ```bash
   railway logs -s sahajcloud --tail | grep -i migrat
   ```

4. If migrations fail on boot, check the error:
   - Server will not fully start until migrations succeed
   - Review Railway logs for Drizzle/Payload migration errors

### Email Not Sending

**Symptoms**:

- Password reset emails not received
- No errors in Resend dashboard

**Solutions**:

1. Verify API key is set in Railway:

   ```bash
   railway variables get RESEND_API_KEY
   ```

2. Test Resend API directly:

   ```bash
   curl https://api.resend.com/emails \
     -H "Authorization: Bearer $RESEND_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "from": "contact@sydevelopers.com",
       "to": "test@example.com",
       "subject": "Test",
       "html": "<p>Test</p>"
     }'
   ```

3. Check Resend dashboard for:
   - API usage
   - Bounces/complaints
   - Rate limits

### High Error Rate

**Diagnosis**:

```bash
# Check Sentry for patterns
# Visit Sentry dashboard

# Check Railway logs
railway logs -s sahajcloud --tail

# Filter by error messages
railway logs -s sahajcloud --tail | grep -i error
```

**Solutions**:

1. Review error messages in Sentry
2. Check for recent code changes
3. Verify environment variables are set correctly
4. Test affected functionality locally
5. Consider rolling back deployment if critical

---

## Cost Monitoring

### Expected Monthly Costs

| Service      | Plan             | Expected Cost |
| ------------ | ---------------- | ------------- |
| **Railway**  | Standard usage   | $5–20/month   |
| **Postgres** | Railway built-in | included      |
| **R2**       | 10GB+ storage    | $1–5/month    |
| **Resend**   | 3k emails/month  | $0/month      |
| **Sentry**   | Free tier        | $0/month      |
| **Total**    | N/A              | **$6–25/mo**  |

Railway pricing is per-minute resource usage (CPU, memory, bandwidth). Production typically uses ~$10–15/month for a small-to-medium workload.

### Monitoring Usage

**Railway Dashboard**:

1. Visit https://railway.app/project/[project-id]
2. Check:
   - Resource usage (CPU, memory, bandwidth)
   - Postgres disk usage
   - Deploy history and logs

**Set Billing Alerts**:

1. Railway Account → Billing → Cost limits
2. Set threshold (e.g., $50/month)

**R2 Usage**:

1. Cloudflare Dashboard → R2 → Analytics
2. Check storage size and operation counts

**Optimization Tips**:

- Cache frequently accessed data via Cloudflare edge rules
- Use connection pooling (Railway Postgres includes it)
- Batch database operations where possible
- Optimize expensive queries
- Archive old media files in R2 lifecycle rules

---

## Migration status — Cloudflare Workers + D1 → Railway + Postgres

The migration is **complete and live**: `cloud.sydevelopers.com` is served from Railway behind the Cloudflare edge (proxied).

### Done

- **Provisioning** — Railway Postgres 18 + the app service (Railpack native builder); `DATABASE_URL` set via a Railway reference variable; CI runs a `postgres:18` service container.
- **Schema** — the legacy SQLite/D1 migrations were removed and a fresh Postgres baseline (`src/migrations/`) was applied to Railway (117 tables).
- **Data ETL** — `scripts/etl-d1-to-postgres.ts` copies all data from the production D1 (read-only) into Railway Postgres: type-aware coercion, FK triggers deferred during load, sequences reset. Verified **111 tables / 7,980 rows**, and **202 FK constraints with 0 orphans**.
- **Storage** — R2 reached via the S3 API (`@aws-sdk/client-s3`); Cloudflare Images + Stream kept. Uploads verified end-to-end (R2 + Images).
- **Cutover** — `cloud.sydevelopers.com` repointed to Railway and **proxied** through Cloudflare (edge cache + WAF retained; SSL Full). The Stream webhook was re-registered to the Railway URL and its secret set.
- **Per-PR previews** — Railway PR environments with CI smoke tests; `scripts/get-railway-preview-url.ts` discovers the preview URL from the Railway-posted GitHub commit status (via `GITHUB_TOKEN`) and the smoke specs self-seed the admin. Validated end-to-end.
- **Preview storage isolation** — Cloudflare Images, Stream, and R2 are shared across every environment, so non-production deploys namespace uploads with a `preview-` marker (Stream uses `meta.env=preview`) and refuse to delete any unmarked (cloned-from-prod) asset. A daily `cleanup-preview-assets` workflow reaps old preview-marked assets; it needs the GitHub secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Detail: `.claude/rules/storage.md` § "Preview / non-production isolation" (#432).

### Remaining (gated)

- [ ] **Verify Railway Postgres automated backups are enabled** (Railway → Postgres → Backups).
- [ ] **Decommission the Cloudflare Worker + D1** after a soak, and disable the Cloudflare "Workers Builds" check. Note: the Worker **custom domain** was removed during cutover, so a rollback to the Worker would require re-adding it; the D1 data remains as a read-only fallback in the meantime.
- [ ] **Merge PR #468.**
- [ ] (Optional) Move Cloudflare SSL from **Full** to **Full (strict)** once Railway's own origin cert is issued.

### Deferred cleanup (dead Cloudflare-artifact references)

These still reference `.wrangler/`, `.open-next/`, and `worker-configuration.d.ts` (none of which exist anymore). Harmless, left in place — remove in a follow-up:

- `eslint.config.mjs` — ignore patterns (~lines 120–121, 139)
- `.gitignore` — Wrangler/OpenNext/SQLite entries (~lines 58–63)
- `.dockerignore` — `.open-next`, `.wrangler` entries

---

## Related Documentation

- **Main Project Docs**: [CLAUDE.md](CLAUDE.md)
- **Database Migrations**: [.claude/rules/migrations.md](./.claude/rules/migrations.md)
- **Storage**: [.claude/rules/storage.md](./.claude/rules/storage.md)
- **API Clients & Rate Limiting**: [.claude/rules/api-clients.md](./.claude/rules/api-clients.md)
- **Railway Documentation**: https://docs.railway.app/
- **Cloudflare R2**: https://developers.cloudflare.com/r2/
- **Cloudflare Images**: https://developers.cloudflare.com/images/
- **Cloudflare Stream**: https://developers.cloudflare.com/stream/
- **Resend Documentation**: https://resend.com/docs

---

**Last Updated**: 2026-06-06
**Production URL**: https://cloud.sydevelopers.com
**Platform**: Railway + PostgreSQL + Cloudflare (Images, Stream, edge cache, rate limiting, WAF)
