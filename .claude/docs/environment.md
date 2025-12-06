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
