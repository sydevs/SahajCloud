# Railway + PostgreSQL Operations Runbook

Complete guide for managing and monitoring this Next.js + Payload CMS application deployed on Railway + PostgreSQL.

**Note**: This application has successfully migrated from Cloudflare Workers + D1 to Railway + PostgreSQL. This runbook documents the production setup, operational procedures, and rollback/disaster recovery plans.

**Scope**: Deployment verification, environment variables, database operations, monitoring, troubleshooting, and rollback procedures.

**Expected time for common tasks**: 10–30 minutes depending on the operation.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Managing Database & Migrations](#managing-database--migrations)
3. [Disaster Recovery & Database Backups](#disaster-recovery--database-backups)
4. [Cloudflare Reverse Proxy & DNS (Reference)](#cloudflare-reverse-proxy--dns-reference)
5. [CI + Per-PR Preview Environments](#ci--per-pr-preview-environments)
6. [Ongoing Monitoring & Maintenance](#ongoing-monitoring--maintenance)
7. [Disaster Recovery & Rollback](#disaster-recovery--rollback)
8. [Pre-Deployment Checklist](#pre-deployment-checklist-for-any-major-changes)
9. [Troubleshooting](#troubleshooting)
10. [References](#references)

---

## Quick Start

**The production infrastructure is live and stable.**

For common tasks:

- **Deploy a change**: Push to `main` → Railway auto-builds and deploys → migrations apply on boot
- **Create a schema migration**: `pnpm db:migrations:create` (local, interactive)
- **Apply schema changes**: Commit the migration, push, Railway applies it automatically
- **View logs**: `railway logs -s <app-service-name> --tail`
- **Monitor metrics**: https://railway.app/project/[id] (CPU, memory, database pool)
- **Check errors**: https://sentry.io/ (production error tracking)

For full reference material (Postgres client setup, environment variables, advanced troubleshooting), see the remaining sections.

---

## Prerequisites & Accounts

Before starting, ensure you have access to:

- **Railway account** (https://railway.app) — free or Pro plan ($20/month)
  - Free Hobby plan: 128 MB RAM (insufficient); upgrade to Pro for production
  - Pro plan: Pay-as-you-go; recommended for this app (~500 MB–1 GB baseline)
- **Railway CLI** installed locally:

  ```bash
  bash <(curl -fsSL railway.com/install.sh) --agents -y
  railway login
  ```

- **GitHub repository access** — for connecting to Railway and CI/CD
- **Cloudflare account access** (for Images, Stream, R2, DNS configuration)
  - Account ID and API tokens (Cloudflare Workers/D1 have been decommissioned)
- **PostgreSQL 18 client** installed locally (for local database operations and `psql` commands):

  ```bash
  brew install postgresql@16  # macOS
  # or
  sudo apt-get install postgresql-client  # Ubuntu/Debian
  ```

- **Production credentials** (saved in password manager):
  - Payload admin email & password
  - All Cloudflare API keys
  - All third-party service keys (Resend, Sentry, Nirmala Vidya)

---

## Railway Provisioning & Configuration (Reference)

**This section documents how the production Railway project was set up. It is provided for reference in case you need to recreate or troubleshoot the configuration.**

### Step 1: Create a Railway Project

#### Via Dashboard (Recommended for First Time)

1. Visit https://railway.app and log in
2. Click **"New Project"** (top right)
3. Select **"GitHub repo"**
4. Authorize Railway to access GitHub (if not already linked)
5. Search for and select `sy-devs-cms` repository
6. Select the branch: `chore/railway-postgres-migration` (or your deployment branch)
7. Click **"Deploy Now"**

Railway uses Railpack (native builder) and auto-detects `railway.toml` to create the app service.

#### Via CLI (Alternative)

```bash
railway init
# Prompted for project name (e.g., "sy-devs-cms")
# Creates .railway/ directory with project metadata
```

### Step 2: Verify App Service Was Created

The dashboard will show an app service (named after your repo or custom name). If not auto-created:

```bash
railway add --repo devindra/sy-devs-cms --branch chore/railway-postgres-migration
```

### Step 3: Add PostgreSQL Database Service

#### Via Dashboard

1. On your project's **Canvas**, click **`+ New`** (or **`+ New`** in the top right)
2. Select **"PostgreSQL"** from the templates
3. Railway creates a Postgres 16 service with auto-generated credentials:
   - `PGHOST`
   - `PGPORT` (default 5432)
   - `PGUSER`
   - `PGPASSWORD`
   - `DATABASE_URL` (full connection string, preferred)

#### Via CLI

```bash
railway add --template postgres
```

### Step 4: Link Database to App Service

1. In **Project Canvas**, click the **app service tile** (your repo name)
2. Click the **Variables** tab
3. Click **Add Variable** and create a reference:

   ```
   DATABASE_URL=${{ Postgres.DATABASE_URL }}
   ```

   **Note on service names**: The exact service name appears in the Railway dashboard → Project Canvas. Default names after `railway init`: `app` and `Postgres`. Substitute `<app-service-name>` and `<postgres-service-name>` with your actual service names in all commands below. If you don't know the name, run:

   ```bash
   railway services list
   ```

4. Verify the reference resolves:
   ```bash
   railway variables list -s <app-service-name>
   ```

### Step 5: Enable Automated Backups

1. In **Project Canvas**, click the **Postgres service tile**
2. Click **Settings** → **Backups**
3. Click **Add Backup Schedule** and select:
   - **Daily**: Retained 6 days
   - **Weekly**: Retained 1 month
   - **Monthly**: Retained 3 months
4. Save

Automated backups replace D1 Time Travel and are essential for production.

### Step 6: Set All Required Environment Variables

In the **app service** → **Variables** tab, click **Add Variable** for each:

#### Build-Time Variable Injection (Critical)

**IMPORTANT**: The following 5 variables **must be set in Railway BEFORE you push the branch**, as they are embedded into the Docker image during `next build`. If you set these after pushing, the build will fail with validation errors during the `pnpm build` stage:

1. `PAYLOAD_SECRET`
2. `DATABASE_URL`
3. `WEMEDITATE_WEB_URL`
4. `SAHAJATLAS_URL`
5. `SAHAJCLOUD_PREVIEW_SECRET`

Railway's Railpack builder injects these as environment variables during the build. If missing, the build will fail during the `pnpm build` stage.

#### Setting Variables

**Core** (required):

| Variable         | Value            | Notes                                     |
| ---------------- | ---------------- | ----------------------------------------- |
| `PAYLOAD_SECRET` | ≥32 random chars | Generate: `openssl rand -base64 24`       |
| `NODE_ENV`       | `production`     | Auto-set by Railway; confirm in dashboard |

**Database** (auto-linked in Step 4):

| Variable       | Value                          |
| -------------- | ------------------------------ |
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` |

**Cloudflare Services** (unchanged from D1):

| Variable                           | Value                                          | Where to find                                                                         |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`            | Your account ID (hex)                          | Cloudflare dashboard → Account Home                                                   |
| `CLOUDFLARE_API_KEY`               | Unified API token                              | Cloudflare → Account Settings → API Tokens                                            |
| `CLOUDFLARE_IMAGES_DELIVERY_URL`   | `https://imagedelivery.net/<hash>`             | Cloudflare Images dashboard                                                           |
| `CLOUDFLARE_STREAM_DELIVERY_URL`   | `https://customer-<code>.cloudflarestream.com` | Cloudflare Stream dashboard                                                           |
| `CLOUDFLARE_R2_DELIVERY_URL`       | `https://assets.sydevelopers.com`              | CDN domain in front of R2                                                             |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | ≥32 chars                                      | Generate: `openssl rand -hex 32`; configure webhook URL in Cloudflare Stream settings |

**R2 S3-Compatible Storage**:

| Variable               | Value                              | Where to find                                         |
| ---------------------- | ---------------------------------- | ----------------------------------------------------- |
| `R2_BUCKET`            | `sahajcloud` (or your bucket name) | Cloudflare R2 dashboard                               |
| `R2_ACCESS_KEY_ID`     | S3 access key                      | Cloudflare → R2 → Manage R2 API Tokens → Create Token |
| `R2_SECRET_ACCESS_KEY` | S3 secret key                      | (Displayed once; save securely)                       |

**Email** (Resend):

| Variable         | Value               |
| ---------------- | ------------------- | --------------------------- |
| `RESEND_API_KEY` | Your Resend API key | Resend dashboard → API Keys |

**Error Tracking** (Sentry):

| Variable                 | Value                     | Notes                                                   |
| ------------------------ | ------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN` | Your Sentry project DSN   | **BUILD-time** (prefixed `NEXT_PUBLIC_*`); also runtime |
| `SENTRY_AUTH_TOKEN`      | Optional; for source maps | Optional; runtime-only (for post-deploy source maps)    |

**Frontend URLs**:

| Variable                    | Value                            |
| --------------------------- | -------------------------------- | ----------------------------------------- |
| `WEMEDITATE_WEB_URL`        | `https://wemeditate.com`         |
| `SAHAJATLAS_URL`            | `https://atlas.sydevelopers.com` |
| `SAHAJCLOUD_PREVIEW_SECRET` | ≥16 random chars                 | Shared with frontend for preview requests |

**Optional**:

| Variable                | Value                 | When needed                   |
| ----------------------- | --------------------- | ----------------------------- |
| `NIRMALA_VIDYA_API_KEY` | API key               | If using Vimeo lecture import |
| `DOCS_PASSWORD`         | ≥8 chars              | If protecting `/api/docs`     |
| `NEXT_PUBLIC_LOG_LEVEL` | `'error'` or `'warn'` | For log filtering (optional)  |

**How to Set Secrets Safely**:

- Never paste in plain text to git/email
- Use 1Password, LastPass, or Railway CLI:
  ```bash
  railway variables --set PAYLOAD_SECRET="$(openssl rand -base64 24)"
  railway variables --set RESEND_API_KEY="<your-key>"
  ```
- Or paste directly in Railway UI (encrypted at rest; not displayed again)

### Step 7: Choose Deployment Region

1. In **Project Canvas**, click the **app service**
2. In **Settings**, find **Region**
3. Select a region close to your users:
   - **us-west** (recommended for US-based users)
   - **us-east** (alternative)
   - **eu-west** (Europe)
   - **ap** (Asia-Pacific)
4. Apply the region change

Both app and database should be in the **same region** to minimize latency.

### Step 8: Verify Build & Deploy Configuration

Ensure `railway.toml` is correct in your repository (should already be in place):

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

**What each setting does**:

- **builder = "RAILPACK"**: Use Railway's native Railpack builder (detects Node.js automatically, builds via `pnpm build`)
- **startCommand**: Start the app via `pnpm start` (runs `next start`)
- **healthcheckPath**: Railway polls this endpoint to confirm readiness (verify `/api/health` exists and returns 200; if not, adjust to an endpoint you know exists)
- **healthcheckTimeout**: Wait up to 300s for the app to be healthy
- **restartPolicy**: Auto-restart on failure (up to 3 retries)

**Migrations**: Migrations are applied **in-process on server boot** via Payload's `prodMigrations` (configured in `src/payload.config.ts`). There is **no preDeployCommand** — migrations run automatically when the app starts, ensuring zero-downtime deploys.

### Step 9: Ready for Deployment

The Railway project is now fully configured. All environment variables are set, and the app service is ready to deploy. Migrations will apply automatically on server boot via Payload's `prodMigrations` configuration — no manual migration step is required.

---

## Environment Variables & Secrets (Reference)

**This section documents all environment variables used in the application. Use this for troubleshooting or adding new integrations.**

### Complete Inventory

| Variable                           | Required | Build/Runtime | Format             | Notes                                                        |
| ---------------------------------- | -------- | ------------- | ------------------ | ------------------------------------------------------------ |
| `PAYLOAD_SECRET`                   | Yes      | BUILD         | ≥32 chars          | Payload encryption key; needed during `next build`           |
| `DATABASE_URL`                     | Yes      | BUILD         | `postgresql://...` | Postgres connection; needed during `next build` + at runtime |
| `WEMEDITATE_WEB_URL`               | Yes      | BUILD         | URL                | Frontend URL; needed during `next build`                     |
| `SAHAJATLAS_URL`                   | Yes      | BUILD         | URL                | Frontend URL; needed during `next build`                     |
| `SAHAJCLOUD_PREVIEW_SECRET`        | Yes      | BUILD         | ≥16 chars          | Shared with frontend; needed during `next build`             |
| `NEXT_PUBLIC_SENTRY_DSN`           | No       | BUILD+Runtime | URL                | Error tracking; embedded in client bundle at build time      |
| `NODE_ENV`                         | No       | Runtime       | `production`       | Auto-set; confirm in Railway                                 |
| `CLOUDFLARE_ACCOUNT_ID`            | No       | Runtime       | Hex string         | For Images/Stream/R2 APIs                                    |
| `CLOUDFLARE_API_KEY`               | No       | Runtime       | ≥20 chars          | Unified token for Images + Stream                            |
| `CLOUDFLARE_IMAGES_DELIVERY_URL`   | No       | Runtime       | URL                | Images delivery domain                                       |
| `CLOUDFLARE_STREAM_DELIVERY_URL`   | No       | Runtime       | URL                | Stream delivery domain                                       |
| `CLOUDFLARE_R2_DELIVERY_URL`       | No       | Runtime       | URL                | R2 delivery CDN domain                                       |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | No       | Runtime       | ≥32 chars          | Stream webhook signature key; see Step 1 note below          |
| `R2_BUCKET`                        | No       | Runtime       | String             | R2 bucket name                                               |
| `R2_ACCESS_KEY_ID`                 | No       | Runtime       | ≥27 chars          | R2 S3 API access key                                         |
| `R2_SECRET_ACCESS_KEY`             | No       | Runtime       | String             | R2 S3 API secret key                                         |
| `RESEND_API_KEY`                   | No       | Runtime       | ≥20 chars          | Transactional email API                                      |
| `SENTRY_AUTH_TOKEN`                | No       | Runtime       | Token              | Optional; source maps upload post-deploy                     |
| `NIRMALA_VIDYA_API_KEY`            | No       | Runtime       | ≥20 chars          | Vimeo lecture import (optional)                              |
| `DOCS_PASSWORD`                    | No       | Runtime       | ≥8 chars           | API docs protection (optional)                               |
| `NEXT_PUBLIC_LOG_LEVEL`            | No       | Runtime       | Enum               | Log level; defaults to 'silent' (client)                     |

### Build-Time Variables

These **must** be set when `pnpm build` runs during Docker build:

- `PAYLOAD_SECRET`
- `DATABASE_URL`
- `WEMEDITATE_WEB_URL`
- `SAHAJATLAS_URL`
- `SAHAJCLOUD_PREVIEW_SECRET`

Railway's Railpack builder injects these as environment variables during the build stage, making them available to `pnpm build` and at runtime.

### How to Obtain Secrets

#### PAYLOAD_SECRET (≥32 characters)

```bash
# Generate locally
openssl rand -base64 24

# Example output: 7k3x9mK+8p/L4qY2vN5wZ=
```

#### DATABASE_URL

From Railway Postgres service:

```bash
# Via CLI
railway variables get DATABASE_URL -s Postgres

# Via dashboard: Postgres service → Settings → Connection string
```

Format: `postgresql://user:password@hostname:port/dbname`

#### Cloudflare API Key

1. Log in to https://cloudflare.com
2. Go to **Account Settings** → **API Tokens**
3. Create a token with:
   - Permissions: `Account.Cloudflare Images:Edit` + `Account.Stream:Edit`
   - TTL: 1 year or longer
4. Copy the token; Railway stores it encrypted

#### R2 S3 Credentials

1. Cloudflare Dashboard → **R2** → **Settings**
2. Click **Manage R2 API Tokens**
3. Click **Create API Token**:
   - Token name: e.g., `sy-devs-cms-s3`
   - Permissions: Object Read & Write (for the target bucket)
   - TTL: No expiration (for production CI/CD)
4. Copy **Access Key ID** and **Secret Access Key** (displayed once)

S3 endpoint is auto-derived: `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`

#### Resend API Key

1. Log in to https://resend.com
2. Go to **API Keys** (top right)
3. Create a new key (default scope: all)
4. Copy and paste into Railway

#### Sentry DSN

1. Log in to https://sentry.io
2. Go to **Projects** → Select your project
3. Click **Settings** → **Client Keys (DSN)**
4. Copy the DSN (format: `https://key@sentry.io/12345`)
5. Paste as `NEXT_PUBLIC_SENTRY_DSN` (it's public; safe in client code)

---

## Managing Database & Migrations

### Overview

Migrations are managed via Payload's `prodMigrations` configuration in `src/payload.config.ts`. On every app boot (including deploys), Payload automatically:

1. Detects which migrations have been applied (by checking the `payload_migrations` table)
2. Runs all pending migrations in order
3. Updates the migrations table

This ensures zero-downtime deploys — the new app instance applies migrations before serving traffic.

**For local development**, use:

```bash
# Generate a new migration interactively
pnpm db:migrations:create

# Apply migrations to your local Postgres
pnpm db:migrate
```

**For production**, simply push to `main` and deploy. Migrations apply automatically on boot.

### Creating a Migration (Local Development)

```bash
# Run LOCALLY where you can respond to interactive prompts
# The pnpm db:migrations:create command is interactive and requires terminal input
pnpm db:migrations:create

# Interactive prompt (requires terminal input):
# ? Name of migration: add_new_field
# ✓ Created src/migrations/1701234567890_add_new_field.ts
# ✓ Created src/migrations/1701234567890_add_new_field.json
```

**Important**: This command is interactive and cannot run in CI/CD or piped contexts. Always run it locally.

### Applying Migrations to Local Postgres

```bash
# Apply all pending migrations to your local database
pnpm db:migrate

# Expected output:
# ✓ Applied 1701234567890_add_new_field
```

### Viewing Migrations on Production

```bash
# See which migrations have been applied to the production database
railway run psql -c "SELECT * FROM payload_migrations ORDER BY id DESC LIMIT 10;"
```

### Verifying Production Deployment

```bash
# Monitor the deploy logs (migrations apply automatically)
railway logs -s <app-service-name> --tail

# Expected output:
# [start] pnpm start
# [start] > next start
# [start] Payload migrations starting...
# [start] ✓ Applied 1701234567890_add_new_field
# [start] ready - started server on 0.0.0.0:3000
# [health] GET /api/health ✓ 200 OK
# [success] Deployment complete
```

---

## Disaster Recovery & Database Backups

### Automated Backups

Railway Postgres automatically creates backups on a schedule configured in the dashboard:

- **Daily**: Retained for 6 days
- **Weekly**: Retained for 1 month
- **Monthly**: Retained for 3 months

These are managed in **Project Canvas** → **Postgres service** → **Settings** → **Backups**.

### Manual Backup (Before Major Changes)

```bash
# Export the production database to a local SQL file
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql

# Or via Railway CLI:
railway run pg_dump > backup-$(date +%Y%m%d-%H%M%S).sql
```

### Restoring from Backup

If you need to restore from a backup:

```bash
# Connect to the backup file
psql -f backup-20260605-123456.sql $DATABASE_URL

# Or via Railway CLI:
railway run psql -f backup-20260605-123456.sql
```

### Checking Database Connection Pool Health

```bash
# View active connections and their state
railway run psql -c "
  SELECT
    datname,
    usename,
    application_name,
    state,
    COUNT(*) as count
  FROM pg_stat_activity
  WHERE datname = 'sahajcloud'
  GROUP BY datname, usename, application_name, state
  ORDER BY count DESC;
"

# Expected: Most connections idle or active, <95% of pool utilized
```

---

## Cloudflare Reverse Proxy & DNS (Reference)

**This section describes the Cloudflare proxy configuration. The DNS and cache rules are already in place in production. Update this section only if you need to modify Cloudflare settings.**

### Verifying the Current Setup

Confirm the current DNS and cache configuration:

```bash
# Verify DNS points to Cloudflare
dig cloud.sydevelopers.com +short
# Expected: Cloudflare IP (e.g., 104.16.x.x)

# Check that the domain works end-to-end
curl -I https://cloud.sydevelopers.com/api/health
# Expected: 200 OK with CF-Cache-Status and CF-Ray headers

# Verify cache is working for static assets
curl -I https://cloud.sydevelopers.com/_next/static/chunks/main.js
# Second request should show: CF-Cache-Status: HIT
```

### Updating Custom Domain (If Needed)

If the Railway app URL changes or you need to add a new domain:

1. In **Project Canvas**, click the **app service**
2. Click **Settings** → **Domains**
3. Click **`+ Add Domain`** (if not already added)
4. Enter the domain name
5. Railway generates a **CNAME target** (e.g., `cname-prod.railway.app.`)
6. **Copy this CNAME target** — you'll use it in Cloudflare DNS

7. Log in to https://cloudflare.com → **sydevelopers.com** zone
8. Go to **DNS**
9. Find the `cloud` record:
   - **Type**: CNAME
   - **Name**: `cloud`
   - **Target**: Railway CNAME target (e.g., `cname-prod.railway.app.`)
   - **Proxy status**: **Proxied** (orange cloud icon)
10. If updating the target, edit and **Save**

After DNS changes, verify propagation (1–2 minutes):

```bash
dig cloud.sydevelopers.com +short
# Expected: Cloudflare IP (e.g., 104.16.x.x)
```

### Cloudflare SSL/TLS Configuration

Cloudflare SSL/TLS is already set to **Full (strict)**, which enforces HTTPS between Cloudflare and Railway. No changes needed unless troubleshooting.

### Cache Rules (Already Configured)

Cache rules are already configured in Cloudflare to control caching, reduce origin load, and bypass routes that shouldn't be cached. **Rules are evaluated in order; the first matching rule applies.**

Current rules (do not modify unless needed for troubleshooting):

1. Cache Next.js static assets (1 year TTL)
2. Bypass admin panel
3. Bypass authenticated routes
4. Cache GET API responses (5 minutes TTL)
5. Bypass webhooks

For the current rule details, check the Cloudflare dashboard: **Caching** → **Cache Rules**. Only modify if you need to exclude new routes or adjust TTLs.

### Rate Limiting (Already Configured)

Cloudflare rate limiting rules are already in place to replace the removed in-Worker rate limiter. They protect against abuse while exempting webhooks.

**Rule 1**: General API rate limit (500 requests/60s, excludes `/api/webhooks/`)
**Rule 2**: Auth endpoint protection (10 requests/60s per IP)

Webhooks are exempted because external services (Cloudflare Stream, Resend) retry on 429 responses.

For the current rate limiting rules, check the Cloudflare dashboard: **Security** → **Rate limiting rules**. Only modify if you need to adjust thresholds.

### WAF (Web Application Firewall)

WAF is enabled with the Cloudflare Managed Ruleset (OWASP). Check **Security** → **WAF** in the Cloudflare dashboard for the current configuration.

### Verifying Cloudflare Configuration is Live

```bash
# Test via Cloudflare edge
curl -I https://cloud.sydevelopers.com/api/health
# Should return 200 with Cloudflare headers (CF-Cache-Status, CF-Ray, etc.)

# Test static asset caching
curl -I https://cloud.sydevelopers.com/_next/static/chunks/main.js
# On second request, should show: CF-Cache-Status: HIT

# Test admin route (should bypass cache)
curl -I https://cloud.sydevelopers.com/admin
# Should show: Cache-Control: no-store, no-cache, must-revalidate
```

---

## CI + Per-PR Preview Environments

### Step 1: Existing CI Pipeline (No Changes Needed)

The GitHub Actions workflow in `.github/workflows/ci.yml` already:

- Spins up a `postgres:18` service for each PR
- Runs lint + unit + integration tests against the ephemeral Postgres
- **Skips smoke specs** until `RAILWAY_PREVIEW_URL` is set (see Step 2)

No changes to the test infrastructure required.

### Step 2: Set RAILWAY_PREVIEW_URL (Enable Smoke Tests)

Each PR gets its own Railway preview environment with a unique URL.

#### Option A: Manual Setup (First Time)

1. Create a new branch for the PR: `feature/my-feature`
2. Push the branch to GitHub
3. In Railway dashboard → **Project Canvas** → Click `+ New` → **GitHub Repo**
4. Configure the preview service (Railpack builder + railway.toml, same as production)
5. Wait for Railway to assign a preview URL (e.g., `https://sahajcloud-pr-123.railway.app`)
6. In GitHub repo settings, add a **Repository Variable** (or **Environment Variable**):
   - Name: `RAILWAY_PREVIEW_URL`
   - Value: `https://sahajcloud-pr-123.railway.app`
7. The next CI run will automatically run smoke specs

#### Option B: Automated (Predictable URL Pattern)

If preview URLs follow a pattern (e.g., `https://sahajcloud-pr-<PR_NUMBER>.railway.app`), update `.github/workflows/ci.yml`:

```yaml
- name: Run smoke specs against the Railway preview
  if: ${{ github.event_name == 'pull_request' }}
  env:
    PREVIEW_URL: https://sahajcloud-pr-${{ github.event.pull_request.number }}.railway.app
  run: pnpm test:smoke
```

### Step 3: Automated Preview Database Restoration (Weekly)

Keep preview environments in sync with production data (minus PII):

**Create `.github/workflows/preview-db-restore.yml`**:

```yaml
name: Restore Preview Database

on:
  schedule:
    # Every Monday at 02:00 UTC
    - cron: '0 2 * * 1'
  workflow_dispatch: # Manual trigger

jobs:
  restore:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - name: Download latest production backup
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          # Download the latest Postgres backup from production
          railway db:backup:download \
            --latest \
            --output prod-backup.sql

      - name: Sanitize dump (strip PII)
        run: |
          # Use the existing sanitize script (adapted for Postgres)
          pnpm tsx scripts/sanitize-preview-dump.ts \
            prod-backup.sql \
            sanitized-preview.sql

      - name: Restore to preview environments
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          # For each active preview environment, restore the sanitized dump
          # (Assumes Railway API / CLI supports iterating environments)
          for env_id in $(railway environment list --json | jq -r '.[] | select(.name | startswith("pr-")) | .id'); do
            PREVIEW_DB_URL=$(railway variable get DATABASE_URL --environment "$env_id")
            psql "$PREVIEW_DB_URL" < sanitized-preview.sql
          done
```

**Required Secrets** (add to GitHub repo settings):

- `RAILWAY_TOKEN` — Railway API token (from Railway dashboard → Account → API Tokens)

### Step 4: Test the Smoke Suite Against Preview

After the preview database is restored:

```bash
# Manually trigger smoke tests
gh workflow run ci.yml -f preview_url="https://sahajcloud-pr-123.railway.app"

# Or let the automatic CI run trigger them:
# Push a commit to your feature branch → CI runs → smoke specs execute
```

---

## Ongoing Monitoring & Maintenance

### Monitoring (First 24 Hours After Major Changes)

| Metric                     | Expected           | Action if not met                |
| -------------------------- | ------------------ | -------------------------------- |
| **Error rate** (Sentry)    | <0.5% new errors   | Check logs; may need rollback    |
| **Railway CPU**            | <50%               | Scale up if sustained >70%       |
| **Railway memory**         | <70%               | Check for leaks; restart if >85% |
| **DB connection pool**     | <95% used          | Increase if >90%                 |
| **Cache hit ratio**        | >80% for `/static` | Review cache rules if <50%       |
| **Response time** (p95)    | <500ms             | Expected; compare to D1 baseline |
| **DNS resolution latency** | <100ms             | Normal; Cloudflare caches        |

**Dashboard Checklist**:

- [ ] Railway Metrics: https://railway.app/project/[id]
- [ ] Sentry Issues: https://sentry.io/organizations/your-org/issues/
- [ ] Cloudflare Analytics: https://dash.cloudflare.com/[account]/sydevelopers.com/analytics
- [ ] Railway Logs: `railway logs -s <app-service-name> --tail`

### Functional Verification (24 Hours)

- [ ] Admin panel loads: https://cloud.sydevelopers.com/admin
- [ ] Login works (test with your credentials)
- [ ] Create a test record in any collection; verify it persists
- [ ] Upload a large file (>100MB) to test R2 integration
- [ ] Verify Cloudflare Images delivery: upload an image, check CDN
- [ ] Test email delivery: trigger a password reset, check inbox (Resend dashboard)
- [ ] Verify no data loss: spot-check a few production records

### Production Database Maintenance

The application uses Railway Postgres 18 with automated backups. Maintenance consists primarily of:

1. **Monitor connection pool health** — check `pg_stat_activity` weekly
2. **Review slow query logs** — use Railway's metrics dashboard
3. **Vacuum & analyze** — Railway runs these automatically; no manual intervention needed
4. **Scale compute if needed** — increase CPU/RAM in Railway service settings if metrics exceed thresholds

D1 has been decommissioned. All data lives in Railway Postgres with automated backups.

### Long-Term Monitoring

- **Monthly**: Review Railway cost vs. baseline
- **Weekly**: Check Sentry for trends
- **Daily** (via Alerts): CPU >70%, Memory >85%, Error rate >1%

Set up Sentry/Railway alerts:

- Sentry: https://sentry.io/organizations/your-org/alerts/
- Railway: Project → Settings → Alerts (if available in your plan)

---

## Disaster Recovery & Rollback

If critical issues arise in production, you can rollback quickly:

### Immediate Rollback (5 minutes)

1. **Revert the problematic code change**:

   ```bash
   git revert HEAD
   git push origin main
   ```

   Railway will automatically detect the push and deploy the reverted version.

2. **Monitor the rollback**:

   ```bash
   railway logs -s <app-service-name> --tail

   # Watch for:
   # - Successful deployment
   # - Migrations applying (if any new migrations were in the reverted code)
   # - Health checks passing
   ```

3. **Verify traffic is restored**:

   ```bash
   curl https://cloud.sydevelopers.com/api/health
   # Expected: 200 OK
   ```

### Investigating Root Cause

If you need to understand what went wrong before rolling back again:

```bash
# Check Railway logs for errors
railway logs -s <app-service-name> --tail -n 1000

# Check Sentry for new errors
# https://sentry.io/organizations/your-org/issues/

# Check Postgres connection pool
railway run psql -c "SELECT * FROM pg_stat_activity WHERE datname = 'sahajcloud';"

# Check migration status (if a migration was the problem)
railway run psql -c "SELECT * FROM payload_migrations ORDER BY id DESC LIMIT 5;"

# Check for database locks
railway run psql -c "SELECT * FROM pg_locks WHERE NOT granted;"
```

### Database Rollback (If Data Was Corrupted)

If the issue is data corruption, restore from backup:

```bash
# List available backups in Railway dashboard
# Project → Postgres service → Backups

# Restore to a point-in-time (via Railway dashboard or CLI)
# This creates a new Postgres instance; you must update DATABASE_URL after

# After restore, update the DATABASE_URL in Railway variables:
railway variables --set DATABASE_URL='${{ <new-postgres-service>.DATABASE_URL }}'

# Redeploy the app to use the restored database:
git push origin main
```

---

## Pre-Deployment Checklist (For Any Major Changes)

### Before Deploying to Production

- [ ] Code changes tested locally: `pnpm lint && pnpm test:unit`
- [ ] Migration tested locally (if schema changes): `pnpm db:migrate`
- [ ] All required environment variables verified in Railway
- [ ] Backup exists (automated backups run daily)
- [ ] Sentry is set up and receiving events from staging
- [ ] Cloudflare cache rules are appropriate for the change

### After Deploying to Production

- [ ] `curl https://cloud.sydevelopers.com/api/health` → 200 OK
- [ ] Admin login works via https://cloud.sydevelopers.com/admin
- [ ] Logs are clean: `railway logs -s <app-service-name> --tail -n 50` (no errors)
- [ ] Sentry shows no new error spikes: https://sentry.io/
- [ ] Response times remain normal (check Railway metrics dashboard)
- [ ] Database connection pool healthy (<95% used)

---

## Troubleshooting

### Deployment Fails During Migration Application

**Cause**: A migration has a syntax error, or there's a data constraint violation.

**Fix**:

```bash
# Check the deployment logs
railway logs -s <app-service-name> --tail -n 200

# Look for the migration error; fix it in src/migrations/<timestamp>.ts

# Test the migration locally before re-deploying
pnpm db:migrate

# If the migration partially applied, you may need to manually rollback
# (consult src/migrations/AGENTS.md for migration rollback procedures)

# After fixing, commit and push
git add src/migrations/
git commit -m "fix: correct migration syntax"
git push origin main
```

### Health Check Timeout (300s)

**Cause**: App takes >300s to start, or `/api/health` doesn't exist.

**Fix**:

1. Verify `/api/health` endpoint exists and responds with 200
2. Increase `healthcheckTimeout` in `railway.toml` if cold start is slow
3. Check logs: `railway logs -s <app-service-name> --tail`

### "PAYLOAD_SECRET must be at least 32 characters"

**Cause**: Secret is too short in Railway environment.

**Fix**:

```bash
# Generate a 32+ character secret
openssl rand -base64 24

# Set it in Railway
railway variables --set PAYLOAD_SECRET="$(openssl rand -base64 24)"
```

### Postgres Connection Refused

**Cause**: DATABASE_URL is invalid, or Postgres service isn't running.

**Fix**:

```bash
# Verify Postgres service is running
railway services list

# Verify DATABASE_URL format
railway variables get DATABASE_URL -s Postgres
# Should be: postgresql://user:password@host:5432/dbname

# Test connection locally
psql "$DATABASE_URL" -c "SELECT 1;"
```

### Database Table Doesn't Exist

**Cause**: Migrations were never applied (shouldn't happen in production, but can occur in development).

**Fix**:

```bash
# Check if migrations were applied
railway run psql -c "SELECT * FROM payload_migrations;"

# If the table is completely missing, check the deployment logs
railway logs -s <app-service-name> --tail -n 500

# Migrations should run automatically on every app boot
# If they haven't, check that prodMigrations is configured in src/payload.config.ts
```

### Memory Limit Exceeded (Hobby Plan)

**Cause**: Free Hobby plan has 128 MB RAM (insufficient for this app).

**Solution**: Upgrade to **Pro plan** ($20/month, pay-as-you-go, no hard RAM cap).

### "DATABASE_URL not resolved"

**Cause**: Variable reference `${{ Postgres.DATABASE_URL }}` is incorrect, or Postgres service name is different.

**Fix**:

```bash
# List all services to find the exact Postgres name
railway services list

# Update the app variable to match
railway variables --set DATABASE_URL='${{ <exact-postgres-service-name>.DATABASE_URL }}'
```

---

## References

- **Railway Documentation**: https://docs.railway.app/
  - [Railpack builder](https://docs.railway.app/deployment/builds)
  - [Environment variables](https://docs.railway.app/guides/variables)
  - [Health checks](https://docs.railway.app/guides/healthchecks)
  - [Backups](https://docs.railway.app/volumes/backups)
  - [Custom domains](https://docs.railway.app/guides/custom-domains)

- **PostgreSQL**: https://www.postgresql.org/
  - [PostgreSQL 18 docs](https://www.postgresql.org/docs/18/index.html)

- **Cloudflare Docs**: https://developers.cloudflare.com/
  - [Cloudflare DNS](https://developers.cloudflare.com/dns/)
  - [Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)
  - [Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
  - [Cloudflare R2](https://developers.cloudflare.com/r2/)

- **This Project**:
  - [Payload CMS Config](./src/payload.config.ts)
  - [Railway Config](./railway.toml)
  - [Environment Variables](./src/lib/env/)
  - [Migrations](./src/migrations/README.md)
  - [Deployment Docs](./DEPLOYMENT.md)

---

**Last Updated**: 2026-06-08  
**Status**: Production — D1 migrated, Railway + PostgreSQL live
