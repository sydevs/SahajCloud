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

Client-facing API reads are made edge-cacheable **at the app layer**: the app emits
`Cache-Control: public, s-maxage=…`, `Vary: Authorization`, and `Cache-Tag` for cacheable reads
(policy in `src/plugins/cache/`, applied by the `/api/**` middleware in `src/middleware.ts`). A
single **Cache Rule** on the `sydevelopers.com` zone is what makes Cloudflare honour them — absent
or disabled, nothing is cached, which is a fail-safe, not a leak.

**The origin decides *what* is cached; the rule only decides *who may ask*.** The rule matches
every `/api/**` read that could legitimately be cached and delegates the yes/no to the response
headers, through Edge TTL **"Use cache-control header if present, bypass cache if not"**
(`bypass_by_default` in the API). A path the app does not stamp sends no `Cache-Control` at all,
so Cloudflare bypasses it. That makes `CACHE_TTLS` in `src/plugins/cache/policy.ts` the single
source of truth: adding a collection, a global, or a root endpoint there is the entire change —
**the dashboard never needs another edit.**

> **Why it is not an allowlist any more.** The rule used to enumerate every cacheable path with
> `eq` / `starts_with` terms, duplicating `CACHE_TTLS` in a place no one can see from the repo.
> The two silently diverged three ways: the `/api/globals/` term that #710 records as live had
> never been added, `/api/atlas/sitemap` was stamped but uncovered, and `/api/user-choices` (#804)
> likewise — all three served `DYNAMIC` in production while this file said otherwise.

**Live rule** (Cloudflare dashboard → Caching → Cache Rules) — enabled, named *"Client read edge
cache (Vary: Authorization)"*, and the only rule in the zone's cache phase:

```
(http.request.method eq "GET"
 and any(http.request.headers["authorization"][*] != "")
 and not any(http.request.headers["x-sahajcloud-preview-secret"][*] != "")
 and starts_with(http.request.uri.path, "/api/")
 and not http.request.uri.path contains "/file/"
 and not http.request.uri.query contains "draft=true")
```

- **`GET` with `Authorization` present** — caching applies to client API-key reads and nothing
  else. Manager and admin reads are cookie-authenticated, carry no `Authorization`, and never
  match; neither does any write.
- **⚠️ The `Authorization`-present condition is mandatory — never match a bare `/api/*`.**
  `Vary: Authorization` partitions the cache per API-key *value*, but it does not isolate the
  *absent*-header case. Without requiring the header, Cloudflare serves the cached **authed**
  response to an **unauthenticated** request — `cf-cache-status: HIT`, `200` — even though the
  origin returns **403** for it. That is a verified production access-control bypass, and it also
  skips edge rate limiting and usage tracking.
- **Preview bypass** — requests carrying `x-sahajcloud-preview-secret` are excluded at the edge,
  and the app emits `private, no-store` for them as well. Live-preview reads are never cached.
- **Draft bypass** — the app emits `private, no-store` for any truthy `?draft=` (`isDraftRead` in
  `src/plugins/cache/policy.ts`); the `draft=true` term makes that bypass independent of the
  origin header. The two conditions are independent: a caller may be authorised for drafts without
  holding the preview secret, and `Vary: Authorization` would otherwise replay that response to
  every request sharing the same API key.
- **`/file/` exclusion** — Payload's upload routes (`/api/<slug>/file/<name>`) serve R2 objects
  stamped `public, max-age=31536000` **without** `Vary: Authorization`
  (`src/plugins/storage/r2NativeAdapter.ts`), so caching them would key a single entry shared
  across every API key. They stay at the origin.
- **Eligible for cache**: ON. **Edge TTL**: `bypass_by_default`, plus a **status-code override of
  `-1` (no-store) for 400–599**. The middleware stamps headers onto `NextResponse.next()` before
  the response status exists, so an error carries `public, s-maxage=600` too; without the override
  a transient 500 would be cached for ten minutes. This was live — a `400` from
  `GET /api/meditations?limit=1` returned `cf-cache-status: HIT` before the override was added.
- **`vary.authorization = passthrough`** — critical: this is what makes Cloudflare key a
  separate cached variant per API key, so one client is never served another's cached response.
  Set `vary.default = passthrough` too, **not `bypass`** — Next.js also stamps `rsc` /
  `next-router-*` / `Sec-CH-Prefers-Color-Scheme` onto `Vary`, and a `bypass` default would
  bypass on those before `Authorization` is even considered.

Everything else stays `cf-cache-status: BYPASS` or `DYNAMIC`: writes, unauthenticated or
invalid-key reads (→ `403`), preview and draft reads, upload file routes, error responses, and
every collection or global the app does not stamp (`clients`, `managers`, `users`,
`wm-app-status`, …).

> **Adding a cacheable read needs no dashboard change.** A new collection, global, or root
> endpoint becomes cacheable the moment it is listed in `CACHE_TTLS` (or stamps
> `publicReadCacheHeaders` in-handler) and that code is deployed. To *stop* a read being cached,
> remove it from `CACHE_TTLS` — the app then sends no cache header and the edge bypasses it.
> Only a genuinely new **exclusion** — a path that stamps `public` without `Vary: Authorization`,
> as the upload routes do — needs a term on the rule.

**Editing the rule** takes the dashboard or a Cache-Rules-scoped API token. That token is
`CLOUDFLARE_CLAUDE_KEY` in `.env.claude.local` (`docs/environment.md`), which is gitignored and
local-only, so no cloud session carries it. `CLOUDFLARE_CACHE_PURGE_TOKEN` is purge-scoped and
cannot edit rules.

**Purge-on-write**: set `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_CACHE_PURGE_TOKEN` (scoped to
`Cache Purge` on this zone) to enable best-effort `Cache-Tag` purge when a cached collection or
global is written. Unset, every purge is a **silent no-op** and the `s-maxage` TTL is the only
invalidation.

> **⚠️ Tag purge is not Enterprise-only.** Cloudflare opened all five purge methods —
> everything, prefix, hostname, URL, tag — to **every plan** in April 2025
> ([changelog](https://developers.cloudflare.com/changelog/post/2025-04-01-purge-for-all/)).
> So these credentials are the invalidation path on our plan, not optional polish for one we do
> not have. **Confirm both variables are set on the Railway production service, and that the
> token's scope includes cache purge** — unset, `cachePlugin`'s purge logs a warn, returns
> `false`, and the TTL is all that invalidates. Limits are generous against our use: we purge one
> tag per write, against a 100-tags-per-call ceiling. (#710)

### Globals are cacheable reads too (#710)

`GET /api/globals/<slug>` is edge-cacheable for the six client-read globals — `wm-web-config`,
`wm-web-translations`, `wm-app-config`, `wm-app-translations`, `sy-atlas-config`,
`sy-atlas-translations` — at `DEFAULT_SMAXAGE` (600s), tagged with the global's own slug. They are
listed with their TTLs in `CACHE_TTLS.globals` (`src/plugins/cache/policy.ts`), the same one place
the cacheable collections live. `wm-app-status` is excluded: it is an operator readiness report
read over cookie auth.

⚠ **This did not actually work until the Cache Rule was made origin-controlled.** The rule
enumerated collection paths only, so `/api/globals/*` was stamped `public, s-maxage=600` by the
app and still served `cf-cache-status: DYNAMIC` in production — the `starts_with "/api/globals/"`
term this section once described as added had never reached the zone. Under the current rule the
globals are covered by `starts_with "/api/"` like everything else, and were verified `MISS` then
`HIT`.

Cloudflare keys on the full query string, so `?locale=fr` and each client's own `select` shape
are separate cache entries, and one tag purge covers all of them.

**The Cloudflare edge is the only cache this app invalidates**, deliberately. WeMeditateWeb still
keeps a read-through Cloudflare KV layer at 24h for `web-config:*` and `web-translations:*`, which
no tag purge can reach, so a `wm-web-*` edit can take up to a day to reach that site. The fix
belongs there, not here: a Worker's `fetch()` to another Cloudflare zone reads through that zone's
cache, and the Cache Rule above now covers `/api/globals/`, so the KV copy is redundant and can go.
SahajAtlasWeb needs nothing either way — its only cache beyond the edge is a per-session React
Query window, which a reload clears.

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

### ⚠ Post-deploy step: republish the WeMeditate App translations (#709)

`20260909_161243_wm_app_localize_status_available_locales` moves
`wm-app-translations._status` into `wm_app_translations_locales`, adding the column with
`DEFAULT 'draft'`. It does **not** carry the previous whole-global status across, so **every
locale of the app's live translations lands unpublished on that deploy** — English included.

**English being in that set is what makes the app go fully blank, not partially.** A client's
published read returns nothing for every locale, and `clientEnglishFallback` cannot mask it:
its English read passes `draft: false` too, so it has nothing to merge from.

Republish each locale in the admin with **"Publish in \<Locale\>"**, one per locale that was
published before. Do **not** use "Publish all locales" — it publishes the empty locales as
well, and `availableLocales` then accepts a language with no strings in it
(`src/globals/AGENTS.md`). Until that is done, API clients reading published content get
blanks, and `wm-app-config` cannot be saved with any non-English `availableLocales` — the gate
this migration ships refuses an unpublished locale by design.

Do this immediately after the deploy that applies it. The two web-project globals took the
same reset in #705, where a seed republished them; this one is live content and has no seed.

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
| `EVENT_VERIFICATION_ENABLED` | Optional, default true. Set it to `false` or `0`, in any case, to pause the nightly `ExpireEvents` sweep: it sends no reminder and unpublishes, trashes or finishes nothing. The cron entry stays registered, so the variable plus a redeploy is the whole toggle. PR previews inherit production variables, so they pause too. It pauses that job only — an ended event stays `unverified`, so `SendPostEventFollowUps` keeps asking its registrants for feedback, and enough denials still unpublish the listing (#819). |

### Storage and Cloudflare services

- `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — R2 (S3-compatible)
- `CLOUDFLARE_ACCOUNT_ID` — derives the R2 endpoint
- `CLOUDFLARE_R2_DELIVERY_URL` — public delivery URL, e.g. `https://assets.sydevelopers.com`
- `CLOUDFLARE_IMAGES_DELIVERY_URL`, `CLOUDFLARE_STREAM_DELIVERY_URL`, `CLOUDFLARE_STREAM_WEBHOOK_SECRET`
- `CLOUDFLARE_API_KEY` — one token for Images and Stream
- `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_CACHE_PURGE_TOKEN` — enable purge-on-write; unset, every purge is a silent no-op (see [Edge Cache](#edge-cache-cloudflare-cache-rule))

### Sentry and Resend

- `NEXT_PUBLIC_SENTRY_DSN` — public, needed at build time and runtime
- `SENTRY_AUTH_TOKEN` — optional, for source-map upload
- `SENTRY_TRACES_SAMPLE_RATE` — optional, default 0.1. A low non-zero rate samples admin
  transactions with their DB-span breakdown. `0` disables tracing.
- `RESEND_API_KEY` — transactional email API key

### Captcha (Cloudflare Turnstile)

- `TURNSTILE_SECRET_KEY` — **required in production**. Server-side secret the write-guard plugin
  checks on `POST /api/user-submissions`, the whole public write surface (token in the
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

### ⚠ Post-deploy step: re-verify each canonical-owning client (#644)

No row carries `canonical.verification.routingProbe` before the deploy that introduces it, so
`canonical.routing` answers `query` for every service until a probe has run. A service publishing
`path`-shaped canonicals today therefore reshapes to `?atlas=` the moment that deploy lands.

**Nothing backfills the verdict, by decision.** Backfilling from `verified.routing` would write
the widget's own self-report into the field that shapes public URLs, which is the boundary #633
drew — and every existing embed has to be re-verified by hand regardless.

Press **Verify now** on each enabled canonical owner (Clients → the service → **SEO**) after the
deploy. One positive probe promotes a host that serves the widget under the mount's subtree back
to `path`. Left alone, the nightly `VerifyEmbeds` job gets there on its own `nextVerifyAt`
watermark, which in backoff can be up to 8 days out. A host that serves the subtree but refuses
headless renders stays on `query` — see "Routing is derived, never configured" in
[`docs/rules/api-clients.md`](./docs/rules/api-clients.md).

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
