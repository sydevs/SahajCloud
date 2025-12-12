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
- `workers_dev = false` - Disable *.workers.dev subdomain (use custom domains)
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
   wrangler deploy
   ```

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
./imports/reset-migrations.sh --dry-run

# Execute full reset
./imports/reset-migrations.sh
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

| Service | Free Tier | Paid Plans | Expected Cost |
|---------|-----------|------------|---------------|
| **Workers** | 100k requests/day | $5/month + $0.30/M requests | $5/month |
| **D1** | 100k reads, 1k writes/day | $5/month + usage | $5-10/month |
| **R2** | 10GB storage, 1M ops/month | $0.015/GB storage | $1-5/month |
| **Resend** | 3k emails/month | $20/50k emails | $0/month |
| **Total** | N/A | N/A | **$11-20/month** |

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
  - Connects to remote D1 database when `remote = true`
  - Production environment variables

- **Migrations**: Always use production mode (`NODE_ENV=production`) to ensure remote connection

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
