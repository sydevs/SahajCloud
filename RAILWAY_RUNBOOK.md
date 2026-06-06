# Railway Provisioning & Configuration Runbook

Complete, step-by-step guide for migrating this Next.js + Payload CMS application from Cloudflare Workers + D1 to Railway + PostgreSQL.

**Scope**: Provisioning, environment variables, baseline migration, first deployment, data ETL, DNS cutover, CI/preview configuration, monitoring, and rollback procedures.

**Estimated time**: 2–4 hours (depending on data size and team familiarity with Railway/PostgreSQL).

---

## Table of Contents

1. [Prerequisites & Accounts](#prerequisites--accounts)
2. [Railway Provisioning & Configuration](#railway-provisioning--configuration)
3. [Environment Variables & Secrets](#environment-variables--secrets)
4. [Postgres Baseline Migration & First Deploy](#postgres-baseline-migration--first-deploy)
5. [1:1 Data ETL (D1 → Postgres)](#11-data-etl-d1--postgres)
6. [Cloudflare Reverse Proxy & DNS Cutover](#cloudflare-reverse-proxy--dns-cutover)
7. [CI + Per-PR Preview Environments](#ci--per-pr-preview-environments)
8. [Post-Cutover Monitoring & Decommissioning](#post-cutover-monitoring--decommissioning)
9. [Rollback Procedure](#rollback-procedure)

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
  - Account ID and API tokens (to remain unchanged)
- **Production D1 database access** — for exporting data
  ```bash
  wrangler d1 export sahajcloud --remote --output prod-dump.sql
  ```
- **PostgreSQL 18 client (or any recent libpq)** installed locally (for psql commands):

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

## Railway Provisioning & Configuration

### Step 1: Create a Railway Project

#### Via Dashboard (Recommended for First Time)

1. Visit https://railway.app and log in
2. Click **"New Project"** (top right)
3. Select **"GitHub repo"**
4. Authorize Railway to access GitHub (if not already linked)
5. Search for and select `sy-devs-cms` repository
6. Select the branch: `chore/railway-postgres-migration` (or your deployment branch)
7. Click **"Deploy Now"**

Railway auto-detects the `Dockerfile` and `railway.toml`, creating an app service.

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

Railway's environment injection **overwrites the Dockerfile's build-time placeholders** with real values. If these are missing during `docker build`, the container image will fail to build.

#### Setting Variables

**Core** (required):

| Variable         | Value            | Notes                               |
| ---------------- | ---------------- | ----------------------------------- |
| `PAYLOAD_SECRET` | ≥32 random chars | Generate: `openssl rand -base64 24` |
| `NODE_ENV`       | `production`     | Already set by Docker, but confirm  |

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
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
preDeployCommand = "pnpm db:migrate"
startCommand = "pnpm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

**What each setting does**:

- **builder = "DOCKERFILE"**: Use your Dockerfile (not a buildpack)
- **dockerfilePath**: Path to Dockerfile
- **preDeployCommand**: Run migrations **before** the new app starts (zero-downtime deploys)
- **startCommand**: Start the app on port 3000
- **healthcheckPath**: Railway polls this endpoint to confirm readiness (verify `/api/health` exists and returns 200; if not, adjust to an endpoint you know exists)
- **healthcheckTimeout**: Wait up to 300s for the app to be healthy
- **restartPolicy**: Auto-restart on failure (up to 3 retries)

### Step 9: (HOLD — Do Not Push Yet)

**IMPORTANT ORDERING HAZARD**: Do **NOT** push your branch to GitHub yet. The baseline migration **must exist in `src/migrations/`** before the first deploy, or `preDeployCommand: pnpm db:migrate` will fail and the app will crash.

**→ Skip to Section 4 (Postgres Baseline Migration & First Deploy) and complete it locally first. Return here after you have committed the migration.**

---

## Environment Variables & Secrets

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

The `Dockerfile` injects placeholders for these during the build stage; Railway's environment injection **overwrites** them with real values at runtime.

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

## Postgres Baseline Migration & First Deploy

### Step 1: Provision Railway Postgres (Already Done)

Your Railway Postgres instance is running and accessible via `DATABASE_URL` (from environment variables above).

### Step 2: Generate Baseline Migration Against Live Postgres

**Critical**: The baseline migration must be generated **before** the first production deploy. It creates the schema snapshot that migrations apply.

#### Using Railway CLI (Recommended)

```bash
# Run LOCALLY (not piped or in CI) where you can respond to interactive prompts
# The pnpm db:migrations:create command uses prompts() and cannot run in automated contexts
pnpm db:migrations:create

# Interactive prompt (requires terminal input):
# ? Name of migration: initial_schema
# ✓ Created src/migrations/1701234567890_initial_schema.ts
# ✓ Created src/migrations/1701234567890_initial_schema.json
```

**CRITICAL**: This command is **interactive** — it uses `prompt()` and **cannot run in Railway, CI/CD, or piped contexts**. You must run it locally on your machine where you can respond to prompts. After generating the migration, commit it locally and push to GitHub, then Railway will apply it during deploy.

**Postgres 16 Compatibility Check**: If the migration generation fails with syntax errors, verify your schema doesn't use SQLite-specific functions (e.g., `json1`, `date('now')`). Payload's `postgresAdapter` handles SQL dialect automatically, but verify by checking the generated migration for any `PRAGMA` or SQLite-only functions. If found, report to the development team before proceeding.

#### Using Environment Variable (Alternative)

```bash
# Get Railway's DATABASE_URL
railway variables get DATABASE_URL -s Postgres

# Export it locally (temporary, this shell session only)
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# Run the migration generator
pnpm db:migrations:create

# Then unset it when done
unset DATABASE_URL
```

### Step 3: Verify Baseline Migration

```bash
# Apply the migration to the live Postgres
railway run pnpm db:migrate

# Expected output:
# ✓ Applied 1701234567890_initial_schema

# Verify schema was created
railway run psql -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
  LIMIT 5;
"
```

### Step 4: Commit & Push

```bash
git add src/migrations/
git commit -m "feat: generate Postgres baseline migration

- Create initial schema snapshot for Railway Postgres
- Generated interactively against live DB
- Baseline ready for first production deploy"

git push origin chore/railway-postgres-migration
```

### Step 5: Deploy to Railway

Push your branch to trigger the Railway build + deploy:

```bash
# Already pushed above, but if needed:
git push origin chore/railway-postgres-migration

# Monitor the deploy
railway logs -s <app-service-name> --tail

# Expected output:
# [build] Docker building...
# [build] ✓ Build successful (pnpm build completed)
# [deploy] Running preDeployCommand: pnpm db:migrate
# [deploy] ✓ Applied 1701234567890_initial_schema
# [start] pnpm start
# [start] > next start
# [start] ready - started server on 0.0.0.0:3000
# [health] GET /api/health ✓ 200 OK
# [success] Deployment complete
```

### Step 6: Verify Initial Deployment

```bash
# Health check on Railway's *.railway.app domain
curl https://sahajcloud-prod.railway.app/api/health
# Expected: { "status": "ok", ... }

# API test
curl https://sahajcloud-prod.railway.app/api/meditations
# Expected: JSON array (empty, since data hasn't been migrated yet)

# Check logs for errors
railway logs -s <app-service-name> --tail | grep -i error
```

The app is now running on Railway with an empty database. Next: migrate production data.

---

## 1:1 Data ETL (D1 → Postgres)

### Step 1: Export Data from Production D1

```bash
# Export the live production D1 database
pnpm exec wrangler d1 export sahajcloud --remote --output prod-dump.sql

# Verify the dump
wc -l prod-dump.sql
head -50 prod-dump.sql
```

This produces a SQLite `.dump` SQL file with all `CREATE TABLE` and `INSERT` statements.

### Step 2: Load into Local SQLite (for inspection)

```bash
# Create a local working copy
sqlite3 local-working-copy.sqlite < prod-dump.sql

# Verify tables
sqlite3 local-working-copy.sqlite "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# Count rows in key tables
sqlite3 local-working-copy.sqlite << 'EOF'
SELECT 'pages' as table_name, COUNT(*) FROM pages
UNION ALL SELECT 'meditations', COUNT(*) FROM meditations
UNION ALL SELECT 'managers', COUNT(*) FROM managers
UNION ALL SELECT 'images', COUNT(*) FROM images
UNION ALL SELECT 'videos', COUNT(*) FROM videos
UNION ALL SELECT 'albums', COUNT(*) FROM albums
UNION ALL SELECT 'songs', COUNT(*) FROM songs
UNION ALL SELECT 'lectures', COUNT(*) FROM lectures
UNION ALL SELECT 'lessons', COUNT(*) FROM lessons
ORDER BY 1;
EOF
```

### Step 3: Migrate Using pgloader (Recommended for Most Data)

**Install pgloader**:

```bash
brew install pgloader  # macOS
# or
sudo apt-get install pgloader  # Ubuntu/Debian
```

**Create migration control file** (`migrate.load`):

```pgloader
LOAD DATABASE
    FROM sqlite:///path/to/local-working-copy.sqlite
    INTO $DATABASE_URL

WITH include drop, create tables, no truncate, reset sequences

CAST
    column managers.active from boolean to boolean,
    column managers.deleted from boolean to boolean,
    column managers.created_at from text to timestamptz
        using pgloader.transforms:sqlite-to-timestamp,
    column managers.updated_at from text to timestamptz
        using pgloader.transforms:sqlite-to-timestamp,
    column pages.content from text to jsonb
        using pgloader.transforms:sqlite-text-to-jsonb,
    column meditations.snapshot from text to jsonb
        using pgloader.transforms:sqlite-text-to-jsonb

BEFORE LOAD DO
  $$ ALTER TABLE IF EXISTS pages_rels DISABLE TRIGGER ALL $$
AFTER LOAD DO
  $$ ALTER TABLE IF EXISTS pages_rels ENABLE TRIGGER ALL $$;
```

**Run pgloader**:

```bash
pgloader \
  --verbose \
  --on-error-resume next \
  migrate.load

# Monitor progress (check row counts)
# Expected: "Migrated N tables, M million rows, X time"
```

**Verify Foreign Key Constraints**

PostgreSQL enforces foreign key constraints by default (unlike SQLite, which requires `PRAGMA foreign_keys=ON`). If the D1 dump contains any orphaned foreign key references, the pgloader migration will fail.

```bash
# Before loading, check the D1 dump for FK violations
sqlite3 local-working-copy.sqlite << 'EOF'
-- Check for orphaned meditations_rels
SELECT COUNT(*) as orphaned_refs
FROM meditations_rels m
WHERE parent_id NOT IN (SELECT id FROM meditations)
  AND parent_collection = 'meditations';
EOF

# If violations exist, either:
# 1. Manually remove orphaned rows before loading, OR
# 2. Add a BEFORE LOAD clause to pgloader that disables triggers:
#    BEFORE LOAD DO $$ ALTER TABLE meditations_rels DISABLE TRIGGER ALL $$
```

**Reset Postgres Sequences**

After pgloader loads data with explicit IDs, Postgres sequences need to be reset:

```bash
psql $DATABASE_URL << 'EOF'
-- Reset all auto-increment sequences
SELECT setval(
  pg_get_serial_sequence('pages', 'id'),
  (SELECT COALESCE(MAX(id), 0) FROM pages) + 1
);

SELECT setval(
  pg_get_serial_sequence('meditations', 'id'),
  (SELECT COALESCE(MAX(id), 0) FROM meditations) + 1
);

SELECT setval(
  pg_get_serial_sequence('managers', 'id'),
  (SELECT COALESCE(MAX(id), 0) FROM managers) + 1
);

-- Repeat for all other tables with auto-increment IDs
-- (albums, songs, lectures, lessons, images, videos, files, etc.)

-- Verify sequences are synchronized
SELECT sequencename, last_value FROM pg_sequences ORDER BY sequencename;
EOF
```

### Step 4: Alternative — Custom Node.js Migration Script

If pgloader isn't available or you need custom logic:

**Create `scripts/migrate-d1-to-postgres.ts`** (see the full implementation in the project's scripts folder for details on batching, error handling, and Payload-specific data handling).

**Run the script**:

```bash
pnpm tsx scripts/migrate-d1-to-postgres.ts

# With explicit env vars:
LOCAL_SQLITE=./prod-dump.sqlite \
  DATABASE_URL="postgresql://user:pass@host:5432/sahajcloud" \
  pnpm tsx scripts/migrate-d1-to-postgres.ts
```

### Step 5: Verification Gates (Must Pass Before Cutover)

#### 5.1 Row-Count Parity

```bash
# Compare SQLite and Postgres row counts
echo "=== SQLite ===" && sqlite3 local-working-copy.sqlite << 'EOF'
SELECT 'pages' as table_name, COUNT(*) FROM pages
UNION ALL SELECT 'meditations', COUNT(*) FROM meditations
UNION ALL SELECT 'managers', COUNT(*) FROM managers
UNION ALL SELECT 'images', COUNT(*) FROM images
UNION ALL SELECT 'videos', COUNT(*) FROM videos
UNION ALL SELECT 'albums', COUNT(*) FROM albums
UNION ALL SELECT 'songs', COUNT(*) FROM songs
UNION ALL SELECT 'lectures', COUNT(*) FROM lectures
ORDER BY 1;
EOF

echo "=== Postgres ===" && psql $DATABASE_URL << 'EOF'
SELECT 'pages' as table_name, COUNT(*) FROM pages
UNION ALL SELECT 'meditations', COUNT(*) FROM meditations
UNION ALL SELECT 'managers', COUNT(*) FROM managers
UNION ALL SELECT 'images', COUNT(*) FROM images
UNION ALL SELECT 'videos', COUNT(*) FROM videos
UNION ALL SELECT 'albums', COUNT(*) FROM albums
UNION ALL SELECT 'songs', COUNT(*) FROM songs
UNION ALL SELECT 'lectures', COUNT(*) FROM lectures
ORDER BY 1;
EOF
```

**Expected result**: All row counts match exactly (or within 1 row for transient records).

#### 5.2 Referential Integrity (No Orphaned Foreign Keys)

```bash
psql $DATABASE_URL << 'EOF'
-- Check for orphaned meditations_rels
SELECT COUNT(*) as orphaned_refs
FROM meditations_rels m
WHERE parent_id NOT IN (SELECT id FROM meditations)
  AND parent_collection = 'meditations';
-- Expected: 0

-- Check all FK constraints
SELECT tc.constraint_name, tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;
EOF
```

#### 5.3 Admin Spot-Checks

```bash
# Test in the Railway app via admin UI (next step)
# Or verify via direct queries:

psql $DATABASE_URL << 'EOF'
-- Check key collections
SELECT
  'Pages' as entity,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM pages
WHERE _status = 'published'

UNION ALL SELECT
  'Meditations',
  COUNT(*),
  MAX(created_at)
FROM meditations

UNION ALL SELECT
  'Managers',
  COUNT(*),
  MAX(created_at)
FROM managers
WHERE deleted IS NOT TRUE;
EOF

# Sample relationship data
psql $DATABASE_URL -c "
  SELECT p.id, p.title, JSON_ARRAY_LENGTH(p.content->'root'->'children') as block_count
  FROM pages
  WHERE content IS NOT NULL
  LIMIT 5;
"
```

### Step 6: Deploy and Test the Migrated Data

Once verification passes, the data is ready for production traffic:

```bash
# Health check
curl https://cloud.sydevelopers.com/api/health

# API test (should now return production data)
curl https://cloud.sydevelopers.com/api/meditations | jq '.[] | {id, title}' | head -20

# Test admin login
# Visit https://cloud.sydevelopers.com/admin in a browser
# Log in with your Payload credentials
```

---

## Cloudflare Reverse Proxy & DNS Cutover

### Step 1: Verify Railway App is Fully Operational

Before touching DNS, confirm the Railway app works end-to-end:

```bash
# Health check
curl https://sahajcloud-prod.railway.app/api/health

# API
curl https://sahajcloud-prod.railway.app/api/meditations

# Admin (via browser)
# https://sahajcloud-prod.railway.app/admin
```

### Step 2: Add Custom Domain to Railway

1. In **Project Canvas**, click the **app service**
2. Click **Settings** → **Domains**
3. Click **`+ Add Domain`**
4. Enter `cloud.sydevelopers.com`
5. Railway generates a **CNAME target** (e.g., `cname-prod.railway.app.`)
6. **Copy this CNAME target** — you'll use it in Cloudflare DNS

### Step 3: Update Cloudflare DNS

1. Log in to https://cloudflare.com → **sydevelopers.com** zone
2. Go to **DNS**
3. Find or create the `cloud` record:
   - **Type**: CNAME
   - **Name**: `cloud`
   - **Target**: (the Railway CNAME target from Step 2, e.g., `cname-prod.railway.app.`)
   - **Proxy status**: **Proxied** (orange cloud icon)
   - **TTL**: Auto
4. Click **Save**

### Step 4: Verify DNS Propagation

```bash
# Wait 1–2 minutes, then:
dig cloud.sydevelopers.com +short
# Expected: Points to Cloudflare IP (e.g., 104.16.x.x)

# Verify CNAME chain
nslookup cloud.sydevelopers.com
# Should show: cloud.sydevelopers.com → Railway CNAME
```

### Step 5: Configure Cloudflare SSL/TLS

1. In **Cloudflare Dashboard** → **SSL/TLS** (left menu)
2. Click **Overview**
3. Set **SSL/TLS encryption mode** to **Full (strict)**
   - This enforces HTTPS between Cloudflare and Railway
   - Railway's certificate (_.railway.app) is valid for both _.railway.app and custom domains

### Step 6: Configure Cache Rules

Cache rules control what Cloudflare caches, reducing origin load. **Rules are evaluated in order; the first matching rule applies.**

1. Go to **Caching** → **Cache Rules**
2. Create rules (in order):

**Rule 1: Cache Next.js static assets** (aggressive caching)

```
Matching conditions:
  - URI Path: matches regex → ^/(_next/static|public)/.*

Then:
  - Cache status: Cache
  - Cache TTL: 1 year (31536000)
  - Browser TTL: 1 year
```

**Rule 2: Bypass admin panel** (no cache)

```
Matching conditions:
  - URI Path: starts with → /admin

Then:
  - Cache status: Bypass
```

**Rule 3: Bypass authenticated routes** (no cache)

```
Matching conditions:
  - URI Path: starts with → /api/users/me
  - Request Header: authorization, contains, (any value)

Then:
  - Cache status: Bypass
```

**Rule 4: Cache GET API responses** (short TTL)

```
Matching conditions:
  - URI Path: matches regex → ^/api/(meditations|users|managers|posts)$
  - Request Method: equals → GET

Then:
  - Cache status: Cache
  - Cache TTL: 5 minutes (300)
  - Browser TTL: 1 minute (60)
```

**Rule 5: Bypass webhooks** (no cache)

```
Matching conditions:
  - URI Path: matches regex → ^/api/webhooks/.*

Then:
  - Cache status: Bypass
```

### Step 7: Configure Rate Limiting

Replace the removed in-Worker rate limiter with Cloudflare rate limiting rules:

1. Go to **Security** → **Rate limiting rules**
2. Create rules:

**Rule 1: General API rate limit** (excludes webhooks)

```
Matching conditions:
  - Request Path: matches regex → ^/api/.*
  - Request Path: does not match → ^/api/webhooks/.*
  - Request Method: POST, PUT, PATCH, DELETE

Rate limiting:
  - Requests: 500
  - Per: 60 seconds
  - Counting expression: cf.colo (per Cloudflare data center)

Then:
  - Action: Block
  - Response: 429 Too Many Requests
  - Duration: 1 minute
```

**Why exclude `/api/webhooks/`**: Webhooks are triggered by external services (Cloudflare Stream, Resend) that retry on 429 responses. Excluding them ensures external retries aren't rate-limited.

**Rule 2: Auth endpoint protection**

```
Matching conditions:
  - Request Path: matches regex → ^/api/auth/(login|register|reset-password)$
  - Request Method: POST

Rate limiting:
  - Requests: 10
  - Per: 60 seconds
  - Counting expression: cf.client.ip (per client IP)

Then:
  - Action: Block
  - Response: 429 Too Many Requests
  - Duration: 5 minutes
```

### Step 8: Enable WAF (Web Application Firewall)

1. Go to **Security** → **WAF** (or **Firewall** → **Managed rules**)
2. Enable **Cloudflare Managed Ruleset** (OWASP)
3. Enable **Cloudflare Rate Limiting Ruleset**
4. Set action to **Challenge** (medium severity) or **Block** (high severity)

### Step 9: Final Verification (Before Going Live)

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

# Verify cache headers
curl -I https://cloud.sydevelopers.com/api/meditations
# Should show: Cache-Control: public, max-age=300 (if rule applied)
```

### Step 10: Go Live (DNS Cutover is Complete)

**Announcement**: "DNS cutover in progress — zero downtime expected due to Cloudflare + Railway zero-downtime deploys."

Traffic now routes: Cloudflare edge → Railway origin.

```bash
# Confirm traffic is routing
dig cloud.sydevelopers.com +short
# Should resolve to Cloudflare IP

# Monitor for 30 minutes
railway logs -s <app-service-name> --tail | head -100
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
4. Configure the preview service (same Dockerfile + railway.toml as production)
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

## Post-Cutover Monitoring & Decommissioning

### Monitoring (First 24 Hours)

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

### Decommissioning D1 (After 48 Hours of Stable Operation)

Once Railway + Postgres is stable:

```bash
# 1. Final backup of D1 (for archival)
wrangler d1 export sahajcloud --remote --output d1-final-backup.sql

# 2. Delete the D1 instance from wrangler.toml
# Remove the binding: [[d1_databases]]

# 3. Remove D1-specific environment variables
# (None remain; Cloudflare now only hosts Images, Stream, R2)

# 4. Verify Workers/D1 are no longer in use
# (If the app still uses a Cloudflare Worker, keep it as a fallback)

# 5. Archive the backup
# Store d1-final-backup.sql in your backup system (AWS S3, B2, etc.)

# 6. Commit & deploy
git add -A
git commit -m "chore: decommission D1, finalize Railway migration"
git push origin main
```

### Long-Term Monitoring

- **Monthly**: Review Railway cost vs. baseline
- **Weekly**: Check Sentry for trends
- **Daily** (via Alerts): CPU >70%, Memory >85%, Error rate >1%

Set up Sentry/Railway alerts:

- Sentry: https://sentry.io/organizations/your-org/alerts/
- Railway: Project → Settings → Alerts (if available in your plan)

---

## Rollback Procedure

If critical issues arise post-cutover, rollback takes ~5 minutes:

### Rollback Steps

1. **In Cloudflare DNS**:
   - Go to **DNS → Records**
   - Change the `cloud` CNAME **back to the Cloudflare Worker route** (if still deployed as fallback)
   - Or change it to a known-good revision of Railway
   - Click **Save**

2. **Verify traffic is back on the fallback**:

   ```bash
   curl https://cloud.sydevelopers.com/api/health
   # Should respond with the fallback's response (or show the Worker is no longer available)
   ```

3. **Investigate root cause**:

   ```bash
   # Check Railway logs for crashes
   railway logs -s <app-service-name> --tail -n 1000

   # Check Sentry for new errors
   # https://sentry.io/organizations/your-org/issues/

   # Check Postgres connection pool
   psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity WHERE datname = 'sahajcloud';"

   # Check if migrations failed
   railway run psql -c "SELECT * FROM payload_migrations ORDER BY id DESC LIMIT 5;"
   ```

4. **Fix the issue**:
   - Revert the problematic change
   - Deploy a fixed version to Railway
   - Re-apply the DNS change to point back to Railway

5. **Re-attempt cutover** once root cause is resolved

### Keeping the Fallback Alive (Optional)

To ensure a fast rollback, keep the old Cloudflare Worker deployed as a live fallback:

- The Worker remains deployed on the `main` branch (or a specific `worker-fallback` branch)
- DNS points to Railway in normal operation
- If needed, revert DNS CNAME to the Worker's route in <1 minute
- No data loss (D1 remains available alongside Postgres for the rollback window)

---

## Pre-Cutover Checklist

### 24 Hours Before

- [ ] Railway project created and service deployed
- [ ] Postgres 16 instance running with backups enabled
- [ ] All 18+ environment variables set in Railway
- [ ] Baseline migration generated: `src/migrations/<timestamp>_initial_schema.ts + .json`
- [ ] First deploy successful; app is healthy on \*.railway.app domain
- [ ] All tests pass: `pnpm lint && pnpm test`

### Data Migration (Before DNS Cutover)

- [ ] D1 data exported: `prod-dump.sql`
- [ ] pgloader (or custom script) completed without errors
- [ ] Row-count parity verified (SQLite vs. Postgres)
- [ ] Referential integrity checks passed (no orphaned FKs)
- [ ] Spot-checks passed (admin login, data visible, file uploads work)
- [ ] Sentry is receiving events from Railway

### Cloudflare Configuration (Before DNS Cutover)

- [ ] Custom domain added to Railway (`cloud.sydevelopers.com` → Railway CNAME target)
- [ ] Cloudflare DNS updated (CNAME record created, proxied)
- [ ] DNS propagation verified (dig confirms Cloudflare IP)
- [ ] SSL/TLS set to "Full (strict)"
- [ ] Cache Rules configured (bypass admin + auth, cache statics)
- [ ] Rate Limiting Rules active
- [ ] WAF enabled

### Final Smoke Tests (Right Before Going Live)

- [ ] `curl https://cloud.sydevelopers.com/api/health` → 200 OK
- [ ] Admin login works via https://cloud.sydevelopers.com/admin
- [ ] API returns production data: `curl https://cloud.sydevelopers.com/api/meditations`
- [ ] Large file upload works (R2 integration)
- [ ] Email delivery works (Resend)
- [ ] Sentry receives events
- [ ] Logs are clean (no error spikes in `railway logs`)

### Post-Cutover Checklist (First 24 Hours)

- [ ] Error rate stable (<0.5% new errors in Sentry)
- [ ] Response times acceptable (p95 <500ms)
- [ ] Cache hit ratio good (>80% for static assets)
- [ ] Database connection pool healthy (<95% used)
- [ ] Admin can create/edit records
- [ ] File uploads complete successfully
- [ ] No data loss (spot-check key records)

---

## Troubleshooting

### Deployment Hangs on "Running preDeployCommand"

**Cause**: Migrations aren't in `src/migrations/`, or DATABASE_URL is invalid.

**Fix**:

```bash
# Verify baseline migration exists
ls -la src/migrations/
# Should show: <timestamp>_initial_schema.ts + .json

# Verify DATABASE_URL is correct
railway variables get DATABASE_URL -s Postgres

# Re-generate if missing
railway run pnpm db:migrations:create
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

**Cause**: Baseline migration was never applied.

**Fix**:

```bash
# Check if migrations were applied
railway run psql -c "SELECT * FROM payload_migrations;"

# If empty, re-generate and apply
railway run pnpm db:migrations:create
railway run pnpm db:migrate
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
  - [Dockerfile builder](https://docs.railway.app/deployment/builds#dockerfile)
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
  - [Dockerfile](./Dockerfile)
  - [Environment Variables](./src/lib/env/)
  - [Migrations](./src/migrations/README.md)
  - [Deployment Docs](./DEPLOYMENT.md)

---

**Last Updated**: 2026-06-06  
**Status**: Ready for implementation
