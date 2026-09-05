# Railway Provisioning & Disaster Recovery Runbook

How to provision this app's Railway project from scratch, and how to recover it. For how the app
runs day to day — the cache rule, environment variables, the deploy workflow, and routine
troubleshooting — see [DEPLOYMENT.md](DEPLOYMENT.md).

**Production infrastructure is live and stable.** Use this runbook when you rebuild a piece of
it, or when something breaks badly enough to need disaster recovery.

---

## Table of Contents

1. [Prerequisites & Accounts](#prerequisites--accounts)
2. [Railway Provisioning (Reference)](#railway-provisioning-reference)
3. [Obtaining Secrets](#obtaining-secrets)
4. [Disaster Recovery & Database Backups](#disaster-recovery--database-backups)
5. [Cloudflare Reverse Proxy & DNS (Reference)](#cloudflare-reverse-proxy--dns-reference)
6. [CI & Preview Environments](#ci--preview-environments)
7. [Disaster Recovery & Rollback](#disaster-recovery--rollback)
8. [Pre-Deployment Checklist](#pre-deployment-checklist)
9. [Setup Troubleshooting](#setup-troubleshooting)
10. [References](#references)

---

## Prerequisites & Accounts

- **Railway account** on the Pro plan — the free Hobby plan's 128 MB RAM cannot run this app.
  Install the Railway CLI:
  ```bash
  bash <(curl -fsSL railway.com/install.sh) --agents -y
  railway login
  ```
- **GitHub repository access**, for connecting Railway and CI.
- **Cloudflare account access** — account ID and API tokens, for Images, Stream, R2, and DNS.
- **A local PostgreSQL 18 client**, for `psql`:
  ```bash
  brew install postgresql@18   # macOS
  sudo apt-get install postgresql-client   # Ubuntu/Debian
  ```
- **Production credentials in a password manager**: the Payload admin password, all Cloudflare
  API keys, and the other third-party keys (Resend, Sentry).

---

## Railway Provisioning (Reference)

This section documents how the production Railway project was set up. Use it to recreate or
troubleshoot the configuration.

### 1. Create the project

Dashboard: **New Project** → **GitHub repo** → authorize Railway → select `SahajCloud` → pick the
deploy branch → **Deploy Now**. Railway detects `railway.toml` and builds via Railpack.

CLI alternative: `railway init` (prompts for a project name, then writes `.railway/`).

If the app service is not created automatically:
`railway add --repo sydevs/SahajCloud --branch <branch>`.

### 2. Add PostgreSQL

Dashboard: **Project Canvas → + New → PostgreSQL**. Railway creates a Postgres 18 service with
`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `DATABASE_URL`.

CLI: `railway add --template postgres`.

### 3. Link the database to the app service

In the app service's **Variables** tab, add:

```
DATABASE_URL=${{ Postgres.DATABASE_URL }}
```

Service names default to `app` and `Postgres` after `railway init` — run `railway services list`
if you're not sure of the exact names, then substitute them in every command in this runbook.
Confirm the reference resolves: `railway variables list -s <app-service-name>`.

### 4. Enable automated backups

**Postgres service → Settings → Backups → Add Backup Schedule**: Daily (retain 6 days), Weekly
(retain 1 month), Monthly (retain 3 months). This is essential before production traffic.

### 5. Set environment variables

In the app service's **Variables** tab. **Five variables are build-time-critical**: Railpack
embeds them into the build, so they must be set **before the first push**, or `pnpm build` fails
its validation:

1. `PAYLOAD_SECRET`
2. `DATABASE_URL`
3. `WEMEDITATE_WEB_URL`
4. `SAHAJATLAS_URL`
5. `SAHAJCLOUD_PREVIEW_SECRET`

The full variable reference — what each one does, and its footguns — lives in
[DEPLOYMENT.md § Environment Variables](./DEPLOYMENT.md#environment-variables). For where to
obtain each value, see [Obtaining Secrets](#obtaining-secrets) below. Set every secret through
the Railway CLI or dashboard, encrypted at rest — never paste one into git or email:

```bash
railway variables --set PAYLOAD_SECRET="$(openssl rand -base64 24)"
```

### 6. Choose the deployment region

App service → **Settings → Region**: pick one close to your users (`us-west`, `us-east`,
`eu-west`, `ap`). Put the app and the database in the **same region**, to minimize latency.

### 7. Confirm `railway.toml`

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

Railpack detects Node.js and builds with `pnpm build`. Railway polls `healthcheckPath` for up to
`healthcheckTimeout` seconds before it calls the deploy unhealthy, then retries a failed start up
to `restartPolicyMaxRetries` times. Migrations need no `preDeployCommand` — Payload's
`prodMigrations` hook applies them in-process on boot (see DEPLOYMENT.md).

Once every variable is set, the project is ready to deploy: push to the configured branch.

---

## Obtaining Secrets

- **`PAYLOAD_SECRET`** (≥32 chars): `openssl rand -base64 24`.
- **`DATABASE_URL`**: `railway variables get DATABASE_URL -s Postgres`, or **Postgres service →
  Settings → Connection string**. Format: `postgresql://user:password@host:port/dbname`.
- **`CLOUDFLARE_API_KEY`**: Cloudflare → Account Settings → API Tokens → create a token scoped to
  `Account.Cloudflare Images:Edit` + `Account.Stream:Edit`.
- **R2 S3 credentials**: Cloudflare → R2 → Manage R2 API Tokens → Create API Token, with Object
  Read & Write on the target bucket. The Access Key ID and Secret Access Key show only once — save
  them immediately. The S3 endpoint is `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`.
- **`RESEND_API_KEY`**: Resend → API Keys → create a key.
- **`NEXT_PUBLIC_SENTRY_DSN`**: Sentry → Project → Settings → Client Keys (DSN). It is public and
  safe in client code.

---

## Disaster Recovery & Database Backups

**Automated backups** run on the schedule set in **Postgres service → Settings → Backups** (see
provisioning step 4).

**Manual backup**, before a risky change:

```bash
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql
# or: railway run pg_dump > backup-$(date +%Y%m%d-%H%M%S).sql
```

**Restore from a dump**:

```bash
psql -f backup-20260605-123456.sql $DATABASE_URL
# or: railway run psql -f backup-20260605-123456.sql
```

**Confirm connection pool health**:

```bash
railway run psql -c "
  SELECT datname, usename, application_name, state, COUNT(*)
  FROM pg_stat_activity WHERE datname = 'sahajcloud'
  GROUP BY datname, usename, application_name, state ORDER BY count DESC;
"
```

Most connections should be idle or active, at under 95% of the pool.

---

## Cloudflare Reverse Proxy & DNS (Reference)

DNS, the cache rule, and rate limiting are already configured in production. This section is for
rebuilding or auditing that setup — the cache rule itself, including its safety trap, is
documented once, in [DEPLOYMENT.md § Edge Cache](./DEPLOYMENT.md#edge-cache-cloudflare-cache-rule).

**Adding or changing the custom domain**: app service → **Settings → Domains → + Add Domain**.
Railway generates a CNAME target (e.g. `cname-prod.railway.app.`). In Cloudflare DNS for the
zone, point the `cloud` record's CNAME at that target, **proxied** (orange cloud). Propagation
takes 1–2 minutes. Confirm with `dig cloud.sydevelopers.com +short`.

**SSL/TLS**: set to **Full (strict)**, enforcing HTTPS between Cloudflare and Railway.

**Rate limiting**: a general API limit (500 requests/60s, excluding `/api/webhooks/`) and a
tighter auth-endpoint limit (10 requests/60s per IP). Webhooks are exempt, since Cloudflare
Stream and Resend retry on `429`. Confirm current rules under **Security → Rate limiting rules**.

**WAF**: the Cloudflare Managed Ruleset (OWASP) is enabled. Confirm **Security → WAF** for the
current configuration.

**Confirm end to end**:

```bash
curl -I https://cloud.sydevelopers.com/api/health          # 200, with CF-Ray / CF-Cache-Status
curl -I https://cloud.sydevelopers.com/_next/static/chunks/main.js   # second request: HIT
curl -I https://cloud.sydevelopers.com/admin                # Cache-Control: no-store
```

---

## CI & Preview Environments

`.github/workflows/ci.yml` runs on every PR: lint, typecheck, and `pnpm test` against a
`postgres:18` service container. It then discovers that PR's Railway preview URL from Railway's
GitHub commit status via `scripts/get-railway-preview-url.ts` (no Railway API token needed) and
runs `pnpm test:smoke` against it. The smoke step skips gracefully, and the job stays green, when
no preview is discovered — treat a skip as "unit and integration passed," not "smoke passed."

Setting up a new PR-preview service the first time: **Project Canvas → + New → GitHub Repo**,
same `railway.toml` and Railpack builder as production.

### ⚠ PR previews inherit their domain from production

**The `SahajCloud` service in the `production` environment must keep a Railway-provided
`*.up.railway.app` domain, on target port 8080, alongside the custom `cloud.sydevelopers.com`.**
Railway's rule: a service in a PR environment receives a domain automatically *only* when the
corresponding base-environment service has a Railway-provided one. Remove it from production and
every future PR environment silently gets none.

That happened, and it cost the smoke lane weeks of PRs (#661). The symptoms, none of them loud:

- The Railway commit status reads a bare `Success`, with no host after it.
- The `railway-app` bot comment's **Web** column is empty for `SahajCloud`.
- `Run smoke specs against the Railway preview` reports `skipped`, and the job stays green.

`scripts/get-railway-preview-url.ts` now **fails the job** on that exact shape, with an `::error`
naming this section, so the next occurrence is visible on the first PR rather than after weeks.
Re-running will not help — fix the domain on production. Existing PR environments do not backfill,
so only PRs opened after the fix get a URL.

---

## Disaster Recovery & Rollback

### Immediate rollback (about 5 minutes)

```bash
git revert HEAD
git push origin main
```

Railway detects the push and deploys the reverted version automatically. Watch it:

```bash
railway logs -s <app-service-name> --tail
```

Then confirm traffic is restored: `curl https://cloud.sydevelopers.com/api/health` should return
`200 OK`.

### Investigating root cause

```bash
railway logs -s <app-service-name> --tail -n 1000
railway run psql -c "SELECT * FROM pg_stat_activity WHERE datname = 'sahajcloud';"
railway run psql -c "SELECT * FROM payload_migrations ORDER BY id DESC LIMIT 5;"
railway run psql -c "SELECT * FROM pg_locks WHERE NOT granted;"
```

Also confirm Sentry shows no new errors.

### Database rollback, for data corruption

Restore a point-in-time backup from **Project → Postgres service → Backups** (dashboard or CLI).
This creates a **new** Postgres instance, so update `DATABASE_URL` afterward:

```bash
railway variables --set DATABASE_URL='${{ <new-postgres-service>.DATABASE_URL }}'
git push origin main   # redeploy against the restored database
```

---

## Pre-Deployment Checklist

**Before** a major change, confirm all of these: `pnpm lint && pnpm test:unit` pass locally, a
schema change has a migration tested with `pnpm db:migrate`, every required environment variable
is set in Railway, a recent backup exists, and Sentry is receiving events from staging.

**After**, confirm all of these: `curl https://cloud.sydevelopers.com/api/health` returns `200`,
admin login works, `railway logs -s <app-service-name> --tail -n 50` is clean, Sentry shows no
new error spike, and response times and the DB connection pool (under 95% used) look normal.

---

## Setup Troubleshooting

Issues specific to provisioning. For day-to-day operational issues (deploy fails, DB connection,
migrations, email), see [DEPLOYMENT.md § Troubleshooting](./DEPLOYMENT.md#troubleshooting).

| Symptom | Cause | Fix |
| --- | --- | --- |
| Health check times out (300s) | App takes too long to start, or `/api/health` doesn't exist | Confirm the endpoint responds `200`. Raise `healthcheckTimeout` in `railway.toml` for a slow cold start |
| `PAYLOAD_SECRET must be at least 32 characters` | Secret too short | `railway variables --set PAYLOAD_SECRET="$(openssl rand -base64 24)"` |
| Memory limit exceeded | Free Hobby plan (128 MB RAM) can't run this app | Upgrade to the Pro plan |
| `DATABASE_URL not resolved` | The `${{ Postgres.DATABASE_URL }}` reference doesn't match the Postgres service's real name | `railway services list`, then set the reference to the exact name |

---

## References

- Railway: [docs](https://docs.railway.app/), [Railpack](https://docs.railway.app/deployment/builds), [variables](https://docs.railway.app/guides/variables), [health checks](https://docs.railway.app/guides/healthchecks), [backups](https://docs.railway.app/volumes/backups), [custom domains](https://docs.railway.app/guides/custom-domains)
- PostgreSQL: [PostgreSQL 18 docs](https://www.postgresql.org/docs/18/index.html)
- Cloudflare: [DNS](https://developers.cloudflare.com/dns/), [Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/), [Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/), [R2](https://developers.cloudflare.com/r2/)
- This project: [DEPLOYMENT.md](./DEPLOYMENT.md), [`railway.toml`](./railway.toml), [`src/migrations/AGENTS.md`](./src/migrations/AGENTS.md)

---

**Status**: Production — Railway + PostgreSQL, live.
