# Environment Setup

## Required Environment Variables

Copy from `.env.example` and configure:

### Core Configuration

- `PAYLOAD_SECRET` - Secret key for authentication (min 32 chars)
- `DATABASE_URL` - PostgreSQL connection string (dev: local; prod: Railway Postgres)
  - Format: `postgres://user:password@localhost:5432/sy_devs_cms` (local) or `postgres://user:password@host:5432/dbname` (prod)

### Logging Configuration

- `NEXT_PUBLIC_LOG_LEVEL` - Log level for both Payload's Pino logger and client-side logger
  - Levels: `'silent'` | `'error'` | `'warn'` | `'info'` | `'debug'`
  - Default: `undefined` (uses Pino defaults server-side, `'silent'` client-side)

### Email Configuration

- `RESEND_API_KEY` - Resend email API key (production use; fallback to mock in dev)

### Storage (R2 S3-compatible API)

**Note**: The system uses Cloudflare R2 (via S3 API) in both dev and prod. Local file storage is automatic when credentials are unset.

#### R2 Bucket

- `R2_BUCKET` - R2 bucket name (e.g., `sahajcloud`)
- `R2_ACCESS_KEY_ID` - R2 API access key ID
- `R2_SECRET_ACCESS_KEY` - R2 API secret key
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID (used for R2 endpoint derivation)
- `CLOUDFLARE_R2_DELIVERY_URL` - Public delivery URL (e.g., `https://assets.sydevelopers.com`)

**S3 Endpoint**: Automatically derived as `https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` with region `auto`.

#### Cloudflare Images & Stream (Media Services)

- `CLOUDFLARE_IMAGES_DELIVERY_URL` - Images delivery base URL (e.g., `https://imagedelivery.net/<hash>`)
- `CLOUDFLARE_STREAM_DELIVERY_URL` - Stream video base URL (e.g., `https://customer-<code>.cloudflarestream.com`)
- `CLOUDFLARE_API_KEY` - API token with Images + Stream edit scope
- `CLOUDFLARE_STREAM_WEBHOOK_SECRET` - HMAC secret for Cloudflare Stream webhook (production only)

#### Finding Cloudflare Credentials

**Account ID**:

1. Go to Cloudflare Dashboard → Account Home
2. Look in right sidebar under "Account ID"

**Images Delivery URL**:

1. Go to Images dashboard
2. Look at any delivery URL: `https://imagedelivery.net/<hash>/<image-id>/public`
3. Copy the base URL including the hash: `https://imagedelivery.net/<hash>`

**Stream Delivery URL**:

1. Go to Stream dashboard
2. Look at any video player URL: `https://customer-<code>.cloudflarestream.com/...`
3. Copy the base URL: `https://customer-<code>.cloudflarestream.com`

**R2 Bucket**:

1. Go to Cloudflare Dashboard → R2 → Buckets
2. Note bucket name and create API token with R2 write scope

### Claude-usable credentials (`.env.claude.local`)

Separate from `.env`, gitignored via `.env*.local`, and **never committed**. It
holds credentials provisioned so an agent can operate infrastructure directly
rather than handing the steps back:

| Key                     | What it opens                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `CLOUDFLARE_CLAUDE_KEY` | Cloudflare API token — Cache Rules / rulesets on the `sydevelopers.com` zone            |
| `ADMIN_PASSWORD`        | `contact@sydevelopers.com` on **production** (`cloud.sydevelopers.com`), via `POST /api/managers/login` |

```bash
set -a; . ./.env.claude.local; set +a     # then use "$CLOUDFLARE_CLAUDE_KEY"
```

Never echo the values — redact when printing anything derived from this file,
and delete any token/JWT written to a scratch file when you're done.

> **Check here before reporting that a credential is unavailable.** The
> `CLOUDFLARE_*` variables in `.env` are the app's runtime config (Images,
> Stream, R2, and the purge token) — none of them can edit a Cache Rule, and
> the Railway CLI is not authenticated on this machine. It's easy to conclude
> from those three facts that no usable token exists, which is wrong.

The credentials in `AGENTS.md` under "Admin Access" are the **local** dev admin
(`localhost:{PORT}/admin`) and are unrelated to the production password above.

### Live Preview URLs

- `WEMEDITATE_WEB_URL` - Preview URL for We Meditate Web frontend (required) — Pages/Meditations live preview + CSP `frame-src`
- `SAHAJATLAS_URL` - Preview URL for Sahaj Atlas frontend (required) — Regions/Events live preview (#575), CSP `frame-src`, and the `csrf` allowlist. **Not a canonical base**: the Atlas host is `noindex` on three layers, so `webUrl` deliberately never points at it (#634)
- `WEMEDITATE_ATLAS_BASE_PATH` - Path the Atlas widget is mounted at on We Meditate (optional, default `/map`). The canonical `webUrl` fallback for any region no client owns: `WEMEDITATE_WEB_URL + WEMEDITATE_ATLAS_BASE_PATH + webPath`. Path only, no query or fragment; `''` mounts at the root (#634)

**No trailing slash** on either URL: they're used as URL prefixes (`${URL}/preview?...`)
and compared against `Origin` headers, which never carry one.

**Restart `next dev` after changing these**: the CSP `frame-src` allowlist is baked
by `next.config.mjs` `headers()` when the server boots (env reloads don't re-evaluate
it), so a stale server CSP-blocks the preview iframe (`ERR_BLOCKED_BY_CSP`).

## Environment Variable Validation

The application uses Zod for type-safe environment variable validation. All environment variables are validated at module load time with clear error messages.

### Validation Module

**Location**: `src/lib/env.ts`

Exports two validated environment objects:

- `serverEnv` - Server-only variables (secrets, API keys)
- `clientEnv` - Client-accessible variables (NEXT*PUBLIC*\* prefix)

### Usage Patterns

**Server-side code**:

```typescript
import { serverEnv } from '@/lib/env'

const accountId = serverEnv.CLOUDFLARE_ACCOUNT_ID // Type-safe, validated
```

**Client-side code**:

```typescript
import { clientEnv } from '@/lib/env'

const logLevel = clientEnv.NEXT_PUBLIC_LOG_LEVEL // Type-safe, validated
```

**S3 client initialization** (Railway):

```typescript
import { S3Client } from '@aws-sdk/client-s3'
import { serverEnv } from '@/lib/env'

const s3 = new S3Client({
  region: 'auto',
  credentials: {
    accessKeyId: serverEnv.R2_ACCESS_KEY_ID,
    secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY,
  },
  endpoint: `https://${serverEnv.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
})
```

### Adding New Environment Variables

1. Add to `src/lib/env.ts` in appropriate schema (server or client)
2. Add Zod validation rules:
   ```typescript
   NEW_VAR: z.string().min(10).optional(),
   ```
3. Update `.env.example` with description and validation notes
4. Run `pnpm generate:types` if needed
5. Import `serverEnv` or `clientEnv` in your code

### Validation Rules

- **PAYLOAD_SECRET**: Min 32 chars (security requirement)
- **URL fields**: Valid HTTPS URLs (localhost allowed in dev)
- **API keys**: Min 20 chars
- **Enums**: Strict type checking (e.g., LOG_LEVEL: 'silent' | 'error' | 'warn' | 'info' | 'debug')
- **Optional fields**: Use `.optional()` for dev fallbacks

### Error Messages

When validation fails, Zod provides detailed error messages:

```
Environment validation error:
{
  "PAYLOAD_SECRET": ["String must contain at least 32 character(s)"],
  "CLOUDFLARE_IMAGES_DELIVERY_URL": ["Invalid url"]
}
```

### Server/Client Environment Separation

Following Next.js best practices, environment variables are separated into two schemas:

**Server Environment** (`serverEnv`):

- All server-only variables (secrets, API keys)
- NEXT*PUBLIC*\* variables (needed for server-side usage)
- NODE_ENV for type safety

**Client Environment** (`clientEnv`):

- Only NEXT*PUBLIC*\* variables (intentionally public)
- Exposed to browser bundle

### Optional vs Required Strategy

**Development (Local)**:

- `PAYLOAD_SECRET` → Required (min 32 chars)
- Cloudflare credentials → Optional (fallback to local file storage)
- Email API → Optional; set `SMTP_URL` to capture mail in Mailpit instead of delivering it
- Sentry DSN → Optional (error tracking disabled)

**Production (Railway)**:

- `PAYLOAD_SECRET` → Always required
- `DATABASE_URL` → Always required (Railway PostgreSQL)
- Cloudflare credentials (R2, Images, Stream) → Required for full functionality
- Email (Resend) → Required for transactional emails

### Fail-Fast vs Graceful Degradation

- **Fail-Fast**: PAYLOAD_SECRET missing → App won't start
- **Graceful Degradation**: Cloudflare vars missing in dev → Use local storage
- **Module-Level Validation**: Validate on import, not on first access

## Railway Configuration

The application is built and deployed on Railway, a containerized platform.

**Configuration Files**:

- **railway.toml** — Railway deployment configuration
  - Uses **Railpack** (Railway's native builder)
  - `start.command = 'pnpm start'` — Start the server with `next start`
  - Migrations are applied automatically on server boot (via `prodMigrations` in Payload config)
- **.env** — Local development environment (git-ignored, copy from .env.example)

### Preview environments provision their own admin

`PREVIEW_ADMIN_PASSWORD` is set on Railway's **preview** environments (and passed to the
smoke lane as a CI secret). On every boot of a preview, `onInit` reconciles the admin
account against the current value — `src/plugins/previewAdmin`, sydevs/SahajCloud#662 —
so rotating the secret takes effect on the next deploy.

Two things about that gate are worth knowing before touching it:

- **Production is detected by Railway's environment name, never `NODE_ENV`.** Railway
  previews run `NODE_ENV=production`, which is the same trap that once sent preview mail
  through Resend to real addresses. It reads `isProductionDeployment()`, as the email
  adapter and the storage guard already do.
- **The gate also requires a Railway environment name at all**, which is what keeps
  `onInit` inert in local dev, in CI and in both test lanes. CI genuinely does hold the
  password as a secret, so a gate reading only that would write an admin into the
  integration lane's database.

`PREVIEW_ADMIN_EMAIL` overrides the account's address; it defaults to
`contact@sydevelopers.com`, matching the smoke lane's own default.

Environments forked before 2026-08-27 never receive the variable and are out of scope:
they keep whatever admin an early smoke run seeded.

### Local Development Environment

**File**: `.env` (git-ignored)

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

### Production Environment (Railway)

In Railway, set environment variables via:

- **Railway Dashboard** → Service → Variables tab
- All values encrypted at rest
- Variables injected during build (by Railpack) and runtime
- **SAHAJCLOUD_URL** must equal the public production origin (https://cloud.sydevelopers.com) — it feeds CSP, CORS, and CSRF validation

**See Also**: [DEPLOYMENT.md](../../DEPLOYMENT.md) for comprehensive deployment configuration and troubleshooting.
