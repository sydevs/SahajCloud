# Deployment Documentation

This document provides comprehensive deployment procedures, troubleshooting, and production configuration for the SY Developers CMS deployed on Cloudflare Workers.

**Production URL**: https://cloud.sydevelopers.com

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

### Cloudflare Workers Platform

The application is deployed to **Cloudflare Workers** using **@opennextjs/cloudflare** adapter for serverless edge deployment.

**Components**:

- **Platform**: Cloudflare Workers (paid plan required for 10MB limit)
- **Database**: Cloudflare D1 (serverless SQLite)
- **Storage**: Cloudflare R2 (S3-compatible object storage)
- **CDN**: Cloudflare Assets binding for static files

**Bundle Size**:

- Compressed: 4.15 MB (well under 10 MB paid plan limit)
- Uncompressed: 19.5 MB
- Worker Startup Time: ~26 ms

### Configuration Files

**next.config.mjs**:

- Must include `output: 'standalone'` for OpenNext compatibility

**wrangler.toml**:

- `workers_dev = false` - Disable \*.workers.dev subdomain (use custom domains)
- `preview_urls = false` - Disable preview URLs for production
- D1 database binding
- R2 storage binding
- Assets binding for static files

---

## Deployment Commands

### Production Deployment

```bash
# Full deployment (migrations + app)
pnpm run deploy:prod

# Deploy database migrations only
pnpm run deploy:database

# Deploy application only
pnpm run deploy:app
```

### Monitoring

```bash
# Tail production logs
wrangler tail sahajcloud --format pretty

# View recent deployments
wrangler deployments list

# Check deployment status
wrangler deployments view <deployment-id>
```

---

## Database Migrations

### Critical Configuration

**IMPORTANT**: For PayloadCMS migrations to work in production, you MUST add `remote = true` to your D1 binding in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "D1"
database_name = "sahajcloud"
database_id = "2ff069c0-a98b-4a6c-94eb-fe199f969c8b"
remote = true  # REQUIRED for production migrations
```

**Why This Matters**:

- Without `remote = true`, PayloadCMS migrations create a local `.wrangler` database instead of connecting to production D1
- This will cause your production database to remain empty even after running migrations
- The `remote = true` flag enables Wrangler's remote bindings feature

### Migration Workflow

The production deployment follows this sequence:

```bash
pnpm run deploy:prod
```

This runs two commands in order:

1. **deploy:database** - Runs migrations against remote D1 database:

   ```bash
   cross-env NODE_ENV=production PAYLOAD_SECRET=ignore payload migrate && \
   wrangler d1 execute sahajcloud --command 'PRAGMA optimize' --remote
   ```

2. **deploy:app** - Deploys the Worker application:

   ```bash
   pnpm exec wrangler deploy --experimental-autoconfig=false --env=""
   ```

   The explicit `--env=""` targets Wrangler's top-level production configuration.
   `--experimental-autoconfig=false` keeps Wrangler on the configured Worker path so the
   `[build]` command in `wrangler.toml` runs `opennextjs-cloudflare build` before upload.

### How Migrations Work

1. **PayloadCMS Migration Execution**:
   - When `NODE_ENV=production`, the payload config uses `getPlatformProxy()` with `remoteBindings: true`
   - With `remote = true` in wrangler.toml, this connects to the actual Cloudflare D1 database
   - Migrations are read from `migrations/` directory and executed against the remote database
   - Migration records are stored in the `payload_migrations` table

2. **Database Optimization**:
   - After migrations, `PRAGMA optimize` is run to optimize the D1 database
   - This improves query performance in production

### Verifying Migrations

```bash
# Check migration records
wrangler d1 execute sahajcloud --remote --command \
  "SELECT name FROM payload_migrations;"

# Verify table existence
wrangler d1 execute sahajcloud --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# Check specific table
wrangler d1 execute sahajcloud --remote --command \
  "SELECT COUNT(*) FROM managers;"
```

### Creating New Migrations

```bash
# Generate migration from Payload schema
pnpm payload migrate:create

# This creates a migration file in src/migrations/

# Apply migrations to production
pnpm run deploy:database
```

### Resetting Migrations (Fresh Start)

**WARNING**: This procedure deletes ALL data in the production database.

Use this when you need to consolidate migrations into a single initial migration or fix migration state issues.

**Note**: The `payload migrate:fresh` command does not work with Cloudflare D1 adapter. You must manually drop tables using wrangler.

**Automated Script** (recommended):

```bash
# Preview what will happen (no changes made)
./seeds/reset-migrations.sh --dry-run

# Execute full reset
./seeds/reset-migrations.sh
```

**Manual Steps** (if script fails):

1. **Delete existing migration files**:

   ```bash
   rm src/migrations/*.ts src/migrations/*.json
   ```

2. **Reset migrations index** (`src/migrations/index.ts`):

   ```typescript
   export const migrations = []
   ```

3. **Generate SQL to drop all tables** - Create `drop_all_tables.sql`:

   ```bash
   # First, list all tables
   wrangler d1 execute sahajcloud --remote --command \
     "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';"

   # Create a SQL file with DROP statements for each table
   # Include: PRAGMA foreign_keys=OFF; at the start
   # Include: DROP TABLE IF EXISTS "table_name"; for each table
   # Include: PRAGMA foreign_keys=ON; at the end
   ```

4. **Drop all tables in production**:

   ```bash
   wrangler d1 execute sahajcloud --remote --file=drop_all_tables.sql
   ```

5. **Verify database is empty**:

   ```bash
   wrangler d1 execute sahajcloud --remote --command \
     "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';"
   ```

6. **Generate fresh initial migration**:

   ```bash
   pnpm payload migrate:create
   ```

7. **Rename migration file** (optional, for clarity):

   ```bash
   mv src/migrations/[timestamp].ts src/migrations/[timestamp]_initial_schema.ts
   mv src/migrations/[timestamp].json src/migrations/[timestamp]_initial_schema.json
   # Update src/migrations/index.ts to match new filename
   ```

8. **Apply to production**:

   ```bash
   pnpm run deploy:database
   ```

9. **Verify**:
   ```bash
   wrangler d1 execute sahajcloud --remote --command "SELECT * FROM payload_migrations;"
   ```

### Squashing Migrations (Preserve Data)

**When to use**: The migration chain has grown large enough that fresh clones, `pnpm reset --local` replays, or CI bootstraps are noticeably slow, or a new Drizzle rebuild bug forces you into a hand-edit cycle. Squashing collapses the whole chain into one schema-equivalent baseline **without dropping a single row of prod data** — as opposed to the "Fresh Start" procedure above, which drops everything.

Use this when you want to shrink the migration surface area, not reset the database.

**How it works**: the script dumps the current prod schema, generates a new single baseline migration locally, applies that baseline to a throwaway local D1 to verify it produces the same schema, then rewrites the prod `payload_migrations` table via `wrangler d1 execute --file=...` so prod believes the baseline is already applied. No DDL runs against prod. In fresh environments the baseline runs normally and produces the correct empty schema.

> **D1 transactions**: Cloudflare D1 rejects explicit `BEGIN`/`COMMIT` statements in `--file` input (Durable Objects own the transaction). Wrangler instead atomically coalesces every statement in the file into a single write — if any statement fails, the database rolls back to its pre-execution state and you can safely retry. This is why the rewrite SQL is just `DELETE` + `INSERT` with no transaction wrapper.

**Automated Script** (recommended):

```bash
# Preview: dumps prod schema, generates baseline, shows the diff, then
# restores the repo to its pre-run state. Nothing is written to prod.
./seeds/squash-migrations.sh --dry-run

# Live cutover: performs the prod payload_migrations rewrite after a clean diff
# and explicit confirmations.
./seeds/squash-migrations.sh
```

The script is operator-interactive: at Step 4 it pauses and asks you to run `pnpm db:migrations:create` in a second terminal, because that command prompts for a migration name and hangs if piped or backgrounded (see [AGENTS.md](AGENTS.md) "Database Migrations"). This is unavoidable — the compensating pattern is a clearly signalled pause.

**Coordination checklist** (required before running without `--dry-run`):

- [ ] Team Slack announcement posted ≥24h prior.
- [ ] No other open migration PRs (`gh pr list --search "migration"`).
- [ ] Deploys paused for the cutover window.
- [ ] `--dry-run` output reviewed; `schema-drift.diff` is empty or all differences are explicitly understood.
- [ ] Pre-cutover canary count captured: `wrangler d1 execute sahajcloud --remote --command "SELECT COUNT(*) FROM meditations;"`.

**Reading the drift diff**:

The script sorts both sides before diffing, so ordering-only differences collapse. What's left should be empty. Common signals and how to act:

| Diff content                                                                     | Meaning                                                                             | Action                                                                                                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Empty file                                                                       | Baseline matches prod exactly                                                       | Proceed                                                                                                                       |
| New `CREATE INDEX` lines on one side only                                        | Prod has indexes the baseline doesn't emit, or vice versa                           | Investigate — likely a hand-created prod index or a generator regression; do NOT proceed until resolved                       |
| `CREATE TABLE` lines differ in column order                                      | Drizzle regenerated a table with a new column layout                                | Safe as long as column names + types match; SQLite doesn't expose column order to queries                                     |
| `CREATE TABLE` lines differ in column **definitions** (type, NOT NULL, defaults) | Real schema drift                                                                   | Stop. Either prod has been hand-edited or an un-migrated local change made it into the generator. Root-cause before squashing |
| `_rels` table rebuilds with missing columns                                      | The Drizzle polymorphic-FK bug documented in [AGENTS.md](AGENTS.md) has re-surfaced | Hand-patch the generated `.ts` per the pattern in AGENTS.md, re-run the script                                                |

**Rollback**:

If the `payload_migrations` rewrite fails mid-flight, the `BEGIN/COMMIT` transaction leaves prod in its pre-run state. If the rewrite succeeds but downstream smoke tests fail, you can restore the old migration chain from the `src/migrations.bak/` folder the script leaves on disk:

```bash
# Restore the chain in-repo
rm -rf src/migrations && git mv src/migrations.bak src/migrations

# Restore prod's payload_migrations to the pre-squash state (requires the
# pre-cutover rows — capture these by snapshotting BEFORE running the squash):
#   wrangler d1 execute sahajcloud --remote \
#     --command "SELECT * FROM payload_migrations ORDER BY id;" > payload-migrations-pre.json
# Then turn those rows back into INSERT statements and re-run against prod.
```

Delete `src/migrations.bak/` only after prod has been verified healthy (admin login succeeds, sample API reads return expected data, canary row counts match pre-cutover).

**After merging the squash PR** — every developer must reset their local DB:

```bash
pnpm reset --local
pnpm payload migrate
```

The local `.wrangler` DB still carries the pre-squash `payload_migrations` rows. Without this reset the next `pnpm payload migrate` will no-op (every local migration looks "already applied") and new migrations authored against the new baseline will fail to apply cleanly.

**Manual Steps** (if the script fails):

1. **Dump prod schema**:
   ```bash
   wrangler d1 export sahajcloud --remote --no-data --output=prod-schema.sql
   ```
2. **Back up existing migrations**:
   ```bash
   git mv src/migrations src/migrations.bak
   mkdir src/migrations
   echo "export const migrations = []" > src/migrations/index.ts
   ```
3. **Generate the baseline** — in a fresh terminal:
   ```bash
   pnpm db:migrations:create   # enter name: initial_schema
   ```
4. **Wire up** `src/migrations/index.ts` with the single new migration, and apply the same `sed` fix `seeds/reset-migrations.sh` uses:
   ```bash
   sed -i '' 's/{ db, payload, req }/{ db, payload: _payload, req: _req }/g' src/migrations/<new>.ts
   ```
5. **Apply to a throwaway local D1** and dump its schema (the dev binding is named `sahajcloud-dev`, not `sahajcloud`; see `[env.dev]` in `wrangler.toml`):
   ```bash
   mv .wrangler .wrangler.backup
   CLOUDFLARE_ENV=dev pnpm payload migrate
   wrangler d1 export sahajcloud-dev --env=dev --local --no-data --output=baseline-schema.sql
   rm -rf .wrangler && mv .wrangler.backup .wrangler
   ```
6. **Diff** and confirm empty output:
   ```bash
   diff <(sort prod-schema.sql) <(sort baseline-schema.sql)
   ```
7. **Rewrite `payload_migrations` on prod** (wrangler coalesces the file into one atomic write; no explicit BEGIN/COMMIT):
   ```bash
   cat > rewrite.sql <<SQL
   DELETE FROM payload_migrations;
   INSERT INTO payload_migrations (name, batch) VALUES ('<new-migration-name>', 1);
   SQL
   wrangler d1 execute sahajcloud --remote --file=rewrite.sql
   ```
8. **Verify**:
   ```bash
   wrangler d1 execute sahajcloud --remote \
     --command "SELECT * FROM payload_migrations;"
   ```

---

## Environment Variables

### Production Secrets

Set via Wrangler (values are encrypted):

```bash
# Set secrets (will prompt for values)
wrangler secret put PAYLOAD_SECRET
wrangler secret put RESEND_API_KEY

# Verify secrets (shows names only, not values)
wrangler secret list
```

### Required Variables

**Core Configuration**:

- `PAYLOAD_SECRET` - Payload authentication secret

**Error Monitoring (Sentry)**:

- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error tracking (set in `wrangler.toml`)
  - **Public variable** - visible to both client and server
  - Only active in production (`NODE_ENV=production`)
  - Get your DSN from: https://sentry.io/settings/projects/your-project/keys/
  - **Configuration**: Add to `wrangler.toml` under `[vars]` section:
    ```toml
    [vars]
    NEXT_PUBLIC_SENTRY_DSN = "https://your-public-key@o0000000.ingest.us.sentry.io/0000000"
    ```

**Email (Resend)**:

- `RESEND_API_KEY` - Resend API key for transactional emails

**Storage (Cloudflare R2)**:

- `S3_ENDPOINT` - Cloudflare R2 endpoint
- `S3_ACCESS_KEY_ID` - R2 access key
- `S3_SECRET_ACCESS_KEY` - R2 secret key
- `S3_BUCKET` - R2 bucket name
- `S3_REGION` - Set to `auto` for Cloudflare R2

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
   pnpm payload migrate:create
   ```

3. **Deploy to Production**:

   ```bash
   pnpm run deploy:prod
   ```

4. **Monitor Deployment**:

   ```bash
   # Watch logs in real-time
   wrangler tail sahajcloud --format pretty
   ```

5. **Verify Deployment**:

   ```bash
   # Health check
   curl https://cloud.sydevelopers.com/api/health

   # Test API
   curl https://cloud.sydevelopers.com/api/meditations
   ```

### Deployment Warnings (Expected & Safe)

The OpenNext bundling process produces several warnings in generated code. These can be safely ignored:

- **7× direct-eval warnings**: Required for PayloadCMS's dynamic migration loading system
- **3× impossible-typeof warnings**: Dead code from bundled dependencies
- **2× duplicate-object-key warnings**: Duplicate keys in generated bundle
- **1× equals-negative-zero warning**: Edge case handling in generated code

These warnings are in OpenNext's generated bundle code, not our source code, and do not affect functionality.

---

## Verifying Deployments

### Browser Tests

Visit the production site:

- [ ] Access admin: https://cloud.sydevelopers.com/admin
- [ ] Login with credentials
- [ ] Create test record in each collection
- [ ] Upload test file (verify R2 integration)
- [ ] Test GraphQL: https://cloud.sydevelopers.com/api/graphql
- [ ] Trigger password reset (verify email via Resend)
- [ ] Check Sentry for errors
- [ ] Check Cloudflare Analytics

### API Tests

```bash
# Health check
curl https://cloud.sydevelopers.com/api/health

# Test REST API
curl https://cloud.sydevelopers.com/api/meditations

# Test GraphQL
curl -X POST https://cloud.sydevelopers.com/api/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ Meditations { docs { id title } } }"}'
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

- [ ] Monitor Cloudflare Logs for errors
- [ ] Monitor Sentry for exceptions
- [ ] Check D1 usage in dashboard
- [ ] Check R2 storage usage
- [ ] Verify email deliverability (Resend dashboard)
- [ ] Test frontend integration

---

## Troubleshooting

### Production Site Shows "no such table" Errors

**Diagnosis**:

```bash
# Check if database has tables
wrangler d1 execute sahajcloud --remote --command \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"
```

**Solution**:

1. Verify `remote = true` is set in wrangler.toml D1 binding
2. Run migrations: `pnpm run deploy:database`
3. Verify migrations completed: Check for `payload_migrations` table

### Migrations Create Local Database Instead of Remote

**Diagnosis**:

- `.wrangler` directory contains database files after running migrations
- Remote database remains empty

**Solution**:

1. Add `remote = true` to D1 binding in wrangler.toml
2. Delete `.wrangler` directory: `rm -rf .wrangler`
3. Re-run migrations: `NODE_ENV=production pnpm payload migrate`
4. Verify no database files in `.wrangler`: `find .wrangler -name "*.sqlite*"`

### Bundle Size Exceeds Limit

**Symptoms**:

```
Error: Bundle size exceeds 3MB limit
```

**Solutions**:

1. Check bundle size:

   ```bash
   pnpm build
   ls -lh .next/standalone
   ```

2. Ensure Workers Paid plan is active (supports 10MB bundles)

3. Enable code splitting in `next.config.mjs`:
   ```javascript
   experimental: {
     optimizePackageImports: ['payload'],
   }
   ```

### D1 Database Connection Fails

**Symptoms**:

- Cannot connect to D1
- `binding.D1 is undefined`

**Solutions**:

1. Verify `wrangler.toml` configuration:

   ```toml
   [[d1_databases]]
   binding = "D1"
   database_name = "sahajcloud"
   database_id = "your-database-id"
   remote = true
   ```

2. Check database exists:

   ```bash
   wrangler d1 list
   ```

3. Run migrations:
   ```bash
   pnpm run deploy:database
   ```

### Email Not Sending

**Symptoms**:

- Password reset emails not received
- No errors in Resend dashboard

**Solutions**:

1. Verify API key is set:

   ```bash
   wrangler secret list
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

# Check Cloudflare logs
wrangler tail sahajcloud --format pretty

# Check error rate in Analytics
# Visit Cloudflare Dashboard → Workers → Analytics
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

| Service     | Free Tier                  | Paid Plans                  | Expected Cost    |
| ----------- | -------------------------- | --------------------------- | ---------------- |
| **Workers** | 100k requests/day          | $5/month + $0.30/M requests | $5/month         |
| **D1**      | 100k reads, 1k writes/day  | $5/month + usage            | $5-10/month      |
| **R2**      | 10GB storage, 1M ops/month | $0.015/GB storage           | $1-5/month       |
| **Resend**  | 3k emails/month            | $20/50k emails              | $0/month         |
| **Total**   | N/A                        | N/A                         | **$11-20/month** |

### Monitoring Usage

**Cloudflare Dashboard**:

1. Visit Cloudflare Dashboard → Workers → Analytics
2. Check:
   - Workers requests
   - D1 reads/writes
   - R2 storage/operations

**Set Billing Alerts**:

1. Cloudflare Dashboard → Billing → Alerts
2. Set thresholds at $20, $50

**Optimization Tips**:

- Cache frequently accessed data
- Use Cloudflare Cache API
- Reduce D1 queries where possible
- Optimize expensive operations

---

## Development vs Production Bindings

The application uses **Wrangler Environments** to manage different configurations:

### Configuration Pattern

`wrangler.toml` contains both production and development environments:

- **Default (top-level)**: Production configuration
- **`[env.dev]`**: Development environment configuration

### How It Works

- **Development** (`pnpm dev`):
  - Automatically uses `[env.dev]` environment from `wrangler.toml`
  - `CLOUDFLARE_ENV=dev` (set in `.env` file) tells getPlatformProxy() to use dev environment
  - Uses local `.wrangler` database (D1 with `database_id = "local"`)
  - Development environment variables (localhost URLs)

- **Production** (`NODE_ENV=production`):
  - Uses default (top-level) configuration from `wrangler.toml`
  - Deploy commands pass `--env=""` to force the top-level configuration
  - Connects to remote D1 database when `remote = true`
  - Production environment variables

- **Migrations**: Always use production mode (`NODE_ENV=production`) to ensure remote connection

---

## Preview Environment

Every non-`main` branch push deploys to a separate **`sahajcloud-preview`** Worker so reviewers can click through changes against real, prod-like data without ever risking a write to prod. The preview env is also where the `smoke-preview` CI job runs Playwright specs on every PR.

### Architecture

```
PRODUCTION                                PREVIEW
Worker: sahajcloud           Worker: <branch>-sahajcloud-preview.<account>.workers.dev
D1:     sahajcloud           D1:     sahajcloud-preview  (cloned + sanitized weekly)
R2:     sahajcloud           R2:     sahajcloud-preview  (separate bucket; 8-day lifecycle)
CDN:    assets.sydevelopers  CDN:    pub-<hash>.r2.dev   (default R2 dev URL)
```

**File-protection invariant.** Preview's Worker has no binding to the prod R2 bucket. Cloned DB rows still reference `assets.sydevelopers.com/...` URLs (so the preview admin renders fine), but any delete in preview admin drops a DB row and calls `R2.delete(key)` against the preview bucket — a no-op for files that live in prod. The next reclone restores the row.

**Account-scoped caveat.** Cloudflare Images and Stream are billed per-account, not per-env. Preview shares those namespaces with prod for now. Issue [#432](https://github.com/sahaja-yoga-developers/sy-devs-cms/issues/432) tracks the per-env isolation work. Until it lands, smoke tests are scoped to R2-backed collections (Meditations, Songs, Lectures).

### Threat model

The preview Worker is reachable at `*.workers.dev` with the documented admin credentials (the same ones in [CLAUDE.md](CLAUDE.md)). Anyone who guesses the URL can log in and browse cloned content. This is acceptable because:

- PII is stripped by [scripts/sanitize-preview-dump.ts](scripts/sanitize-preview-dump.ts) before the clone lands in preview D1.
- The file-protection invariant means a delete in preview admin can never remove a prod R2 object.
- The remaining cloned content (meditations, songs, lectures, pages) is broadly equivalent to what the public CMS surfaces anyway.

**If a future collection ever holds business-sensitive but non-PII data, this assumption has to be revisited** — either add the table to `PII_TABLES` in `scripts/sanitize-preview-dump.ts`, or gate preview admin behind a stronger auth mechanism.

### One-time operator runbook

After this PR merges, complete these steps once:

1. **Provision D1 + R2**

   ```bash
   wrangler d1 create sahajcloud-preview --location=weur
   # paste the returned UUID into wrangler.toml `[env.preview]` `database_id`
   wrangler r2 bucket create sahajcloud-preview --jurisdiction=eu
   ```

2. **Enable the default R2 public URL** in the CF dashboard (R2 → `sahajcloud-preview` → Settings → Public access → enable `r2.dev` URL). Copy the assigned `https://pub-<hash>.r2.dev` into the `CLOUDFLARE_R2_DELIVERY_URL` var in `wrangler.toml` `[env.preview.vars]`.

3. **Configure the 8-day object-lifecycle rule** on the same bucket (R2 → `sahajcloud-preview` → Settings → Object lifecycle rules → add rule: expire all objects after 8 days). This is the sole cleanup mechanism for smoke-test uploads — no manual wipe script needed.

4. **Fill in the preview env "secrets"** — these are inlined in `wrangler.toml` `[env.preview.vars]` rather than set via `wrangler secret put`. The Worker doesn't exist until first deploy, and first deploy needs these values present to pass build-time Zod validation, so the canonical `wrangler secret put` flow hits a chicken-and-egg deadlock. Inlining matches the existing `[env.dev.vars]` pattern and is acceptable for non-prod: preview data is sanitized, and JWTs signed by the preview `PAYLOAD_SECRET` are only valid against preview.

   `PAYLOAD_SECRET` and `SAHAJCLOUD_PREVIEW_SECRET` ship pre-generated. Replace the two `OPERATOR_REPLACE_ME` placeholders:
   - `SENTRY_DSN` — paste a Sentry DSN, or delete the line to disable Sentry in preview.
   - `RESEND_API_KEY` — paste a **sandbox** Resend API key (do not reuse prod), or delete the line to disable email.

   Commit the updated `wrangler.toml` to the branch.

5. **Configure Workers Builds** in the CF dashboard (Workers & Pages → `sahajcloud` → Settings → Builds):
   - Production branch: `main` (existing behavior unchanged)
   - Non-production branches: all branches except `main`
   - Non-prod deploy command: `npx wrangler versions upload --env=preview`
   - Pre-deploy migration step: `pnpm exec wrangler d1 migrations apply sahajcloud-preview --remote --env=preview`
   - **Build environment variables** (Workers Builds → Settings → Variables and secrets → Build variables): set `PAYLOAD_SECRET` and `SAHAJCLOUD_PREVIEW_SECRET` to the same values you put in `wrangler.toml`. Per [CF docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), build variables are scoped to the build process (process.env during `opennextjs-cloudflare build`); they are not the same surface as the runtime bindings in `wrangler.toml [env.preview.vars]`, so both need to be set.

6. **Repo secrets + vars** (Settings → Secrets and variables → Actions):
   - Secret `CLOUDFLARE_API_TOKEN` — a token with D1 + R2 write scope (used by `preview-reclone.yml`).
   - Secret `CLOUDFLARE_ACCOUNT_ID` — your account ID.
   - Variable `CF_WORKER_SUBDOMAIN` — your `<account>` subdomain (the part before `.workers.dev`), used by the smoke job to compute per-PR URLs.

7. **First reclone**: Actions → "Preview D1 Reclone" → "Run workflow" → `main`. Confirm preview D1 row counts roughly match prod (minus stripped Managers/Clients), preview admin can log in at `https://sahajcloud-preview.<account>.workers.dev/admin`.

### Reclone schedule + sanitization

The `preview-reclone` workflow (`.github/workflows/preview-reclone.yml`) runs **weekly on Sundays at 04:00 UTC** and on `workflow_dispatch`. It:

1. Exports prod D1 to a SQL dump via `wrangler d1 export sahajcloud --remote`.
2. Runs `scripts/sanitize-preview-dump.ts` to strip INSERTs for these PII tables: `managers*`, `clients*`, `payload_preferences*`, `payload_locked_documents*`, `form_submissions*`, `payload_jobs*`. Schema (CREATE TABLE) statements are preserved.
3. Drops all preview tables (dynamic — queries `sqlite_master` so the schema list never drifts).
4. Imports the sanitized dump into preview D1.
5. INSERTs a seeded admin row directly into the preview `managers` table via `wrangler d1 execute` (uses Payload's exact pbkdf2-sha256 hash params; no dependency on a running preview Worker, so the reclone works on the cron even when no PR's preview alias is live). Credentials match the documented dev creds in `CLAUDE.md`.

Schema drift between reclones is tolerated: PR migrations land in preview via Workers Builds' pre-deploy migration step, smoke writes accumulate during the week, and the weekly reclone wipes everything clean. If a destructive PR migration lands and is later reverted, preview self-heals on the next reclone.

**Reclone-vs-smoke race.** The reclone drops and re-imports every table. If a `smoke-preview` job is in flight when the Sunday-04:00-UTC reclone fires, the smoke job's records will be wiped mid-test and the test fails at its delete step. The failure mode is a transient CI red, not data corruption — re-running the PR's CI passes. Practical risk is near-zero given the timing, but if it ever becomes an issue, gate the reclone behind a check that no `smoke-preview` runs are active.

### Smoke specs

`pnpm test:smoke` runs the Playwright specs in `tests/e2e/*.e2e.spec.ts` against `PREVIEW_URL`. CI sets `PREVIEW_URL` to the per-PR alias and `SMOKE_RUN_ID` to `pr-<num>-<run_id>` so concurrent PR runs don't collide on the shared preview DB. Locally, set `PREVIEW_URL=http://localhost:3000` (or your dev port) and run `pnpm test:smoke` against a running dev server.

### Verification checklist

After the first reclone + a throwaway PR:

- [ ] CF auto-posts a preview URL comment on the PR.
- [ ] Visiting the preview URL → `/admin/login` works with the seeded credentials.
- [ ] **File-protection test**: pick a cloned Meditation with audio. Note its `assets.sydevelopers.com/...` URL. Delete the Meditation in preview admin. Confirm:
  - Prod admin still shows the Meditation.
  - The prod CDN URL still serves the file.
  - `wrangler r2 object get sahajcloud <key>` succeeds.
  - Triggering a reclone restores the row in preview.
- [ ] **Upload test**: create a new Meditation with a fresh audio upload in preview admin. Confirm the URL is `pub-<hash>.r2.dev/...` (preview bucket), not `assets.sydevelopers.com`.
- [ ] **Concurrency test**: open two PRs simultaneously. Both `smoke-preview` runs use distinct `SMOKE_RUN_ID` prefixes and don't trample each other's records.

---

## Related Documentation

- **Main Project Docs**: [CLAUDE.md](CLAUDE.md)
- **Migration Scripts**: [migration/README.md](migration/README.md)
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Cloudflare D1**: https://developers.cloudflare.com/d1/
- **Cloudflare R2**: https://developers.cloudflare.com/r2/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/
- **Resend Documentation**: https://resend.com/docs

---

**Last Updated**: 2025-12-01
**Production URL**: https://cloud.sydevelopers.com
