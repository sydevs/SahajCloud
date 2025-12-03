# Environment Setup

## Required Environment Variables

Copy from `.env.example` and configure:

### Core Configuration
- `PAYLOAD_SECRET` - Secret key for authentication
- **Note**: Database (SQLite/D1) is configured via `payload.config.ts` using Wrangler - no DATABASE_URI needed

### Email Configuration (Production)
- `SMTP_HOST` - SMTP server host (default: smtp.gmail.com)
- `SMTP_PORT` - SMTP server port (default: 587)
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `SMTP_FROM` - From email address (default: contact@sydevelopers.com)

### Cloudflare R2 S3-Compatible Storage (Required for Production)
- `S3_ENDPOINT` - Cloudflare R2 server endpoint (e.g., `https://your-account-id.r2.cloudflarestorage.com`)
- `S3_ACCESS_KEY_ID` - Cloudflare R2 access key ID
- `S3_SECRET_ACCESS_KEY` - Cloudflare R2 secret access key
- `S3_BUCKET` - Storage bucket name
- `S3_REGION` - Region (use `auto` for Cloudflare R2)

**Note**: If S3 variables are not configured, the system automatically falls back to local file storage (development only).

### Live Preview URLs
- `WEMEDITATE_WEB_URL` - Preview URL for We Meditate Web frontend (default: http://localhost:5173)
- `SAHAJATLAS_URL` - Preview URL for Sahaj Atlas frontend (default: http://localhost:5174)

## Wrangler Configuration

The application uses **Wrangler Environments** to manage different configurations for development and production.

**Configuration File**: `wrangler.toml` contains both environments:
- **Default (top-level)**: Production configuration with remote D1 database
- **`[env.dev]`**: Development environment with local SQLite database

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
