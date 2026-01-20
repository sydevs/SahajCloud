# Environment Setup

## Required Environment Variables

Copy from `.env.example` and configure:

### Core Configuration
- `PAYLOAD_SECRET` - Secret key for authentication
- **Note**: Database (SQLite/D1) is configured via `payload.config.ts` using Wrangler - no DATABASE_URI needed

### Logging Configuration
- `NEXT_PUBLIC_LOG_LEVEL` - Log level for both Payload's Pino logger and client-side logger
  - Levels: `'silent'` | `'error'` | `'warn'` | `'info'` | `'debug'`
  - Default: `undefined` (uses Pino defaults server-side, `'silent'` client-side)

### Email Configuration (Production)
- `SMTP_HOST` - SMTP server host (default: smtp.gmail.com)
- `SMTP_PORT` - SMTP server port (default: 587)
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `SMTP_FROM` - From email address (default: contact@sydevelopers.com)

### Cloudflare-Native Storage (Production Only)

**Note**: The system uses Cloudflare-native services in production and automatically falls back to local file storage in development (no configuration needed for local development).

#### Cloudflare Images & Stream (Image & Video Storage)
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `CLOUDFLARE_API_KEY` - Unified API token for both Cloudflare Images and Stream (set via `wrangler secret put`)
- `CLOUDFLARE_IMAGES_DELIVERY_URL` - Full Images delivery URL (e.g., `https://imagedelivery.net/<hash>`)
- `CLOUDFLARE_STREAM_DELIVERY_URL` - Full Stream delivery URL (e.g., `https://customer-<code>.cloudflarestream.com`)

#### R2 Native Bindings (Audio & Files)
- R2 bucket is configured via `wrangler.toml` bindings (no environment variables needed)
- `CLOUDFLARE_R2_DELIVERY_URL` - Public URL for R2-stored assets (e.g., `https://assets.sydevelopers.com`)

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

### Live Preview URLs
- `WEMEDITATE_WEB_URL` - Preview URL for We Meditate Web frontend (default: http://localhost:5173)
- `SAHAJATLAS_URL` - Preview URL for Sahaj Atlas frontend (default: http://localhost:5174)

## Environment Variable Validation

The application uses Zod for type-safe environment variable validation. All environment variables are validated at module load time with clear error messages.

### Validation Module

**Location**: `src/lib/env.ts`

Exports two validated environment objects:
- `serverEnv` - Server-only variables (secrets, API keys)
- `clientEnv` - Client-accessible variables (NEXT_PUBLIC_* prefix)

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

**Cloudflare Workers bindings**:
```typescript
import { requireBinding } from '@/lib/env'

const r2 = requireBinding<R2Bucket>(env.R2, 'R2')
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
- NEXT_PUBLIC_* variables (needed for server-side usage)
- NODE_ENV for type safety

**Client Environment** (`clientEnv`):
- Only NEXT_PUBLIC_* variables (intentionally public)
- Exposed to browser bundle

### Optional vs Required Strategy

**Development (Local)**:
- `PAYLOAD_SECRET` → Required (min 32 chars)
- Cloudflare credentials → Optional (fallback to local file storage)
- Email API → Optional (fallback to Ethereal Email)
- Sentry DSN → Optional (error tracking disabled)

**Production (Cloudflare Workers)**:
- `PAYLOAD_SECRET` → Always required
- Cloudflare credentials → Required when `env` binding is provided
- Runtime validation via `requireBinding<T>()` helper for R2/D1 bindings

### Fail-Fast vs Graceful Degradation

- **Fail-Fast**: PAYLOAD_SECRET missing → App won't start
- **Graceful Degradation**: Cloudflare vars missing in dev → Use local storage
- **Module-Level Validation**: Validate on import, not on first access

## Wrangler Configuration

The application uses **Wrangler Environments** to manage different configurations for development and production.

**Configuration File**: `wrangler.toml` contains both environments:
- **Default (top-level)**: Production configuration with remote D1 database
- **`[env.dev]`**: Development environment with local SQLite database

### Important: Environment Variables Are NOT Inherited

**⚠️ Wrangler environments do NOT inherit `[vars]` from the top level.**

Any variable needed in development MUST be explicitly defined in `[env.dev.vars]`.

```toml
# ❌ WRONG - dev environment won't see this
[vars]
NEXT_PUBLIC_LOG_LEVEL = "debug"

# ✅ CORRECT - explicitly define in both
[vars]
NEXT_PUBLIC_LOG_LEVEL = "debug"

[env.dev.vars]
NEXT_PUBLIC_LOG_LEVEL = "debug"
```

### How Environment Selection Works

**Development** (`pnpm dev`):
- Automatically uses `[env.dev]` environment from `wrangler.toml`
- Environment variable `CLOUDFLARE_ENV=dev` (set in `.env` file) tells `getPlatformProxy()` to use dev config
- Uses local `.wrangler` database (D1 with `database_id = "local"`)
- Development URLs (localhost:3000, localhost:5173, etc.)

**Production** (deployment):
- Uses default (top-level) configuration
- Environment variable `CLOUDFLARE_ENV` is undefined (defaults to production)
- Connects to remote D1 database when `remote = true`
- Production URLs (cloud.sydevelopers.com, wemeditate.com, etc.)

### Key Files
- `.env` - Sets `CLOUDFLARE_ENV=dev` for local development
- `wrangler.toml` - Single source of truth for both environments
- `src/payload.config.ts` - Uses `process.env.CLOUDFLARE_ENV` to select environment in `getPlatformProxy()`

**See Also**: [DEPLOYMENT.md](../../DEPLOYMENT.md) for comprehensive deployment configuration and troubleshooting.
