# Architecture Overview

## Storage Architecture

The application uses **Cloudflare-native storage services** for optimal performance:

### Cloudflare Images (Image Storage)
- **Collections**: `images`, `albums`
- **Features**: Automatic format optimization (WebP, AVIF), dynamic transformations, global CDN
- **URL Format**: `https://imagedelivery.net/<hash>/<imageId>/public`
- **Replaces**: Sharp image processing

### Cloudflare Stream (Video Storage)
- **Collections**: `frames` (video frames only)
- **Features**: Automatic transcoding, HLS streaming, thumbnail generation, MP4 downloads
- **URL Format**:
  - Thumbnails: `https://customer-<code>.cloudflarestream.com/<videoId>/thumbnails/thumbnail.jpg`
  - MP4: `https://customer-<code>.cloudflarestream.com/<videoId>/downloads/default.mp4`
- **Replaces**: FFmpeg thumbnail generation

### R2 Native Bindings (Audio & Generic Files)
- **Collections**: `meditations`, `music`, `lessons`, `files`
- **Features**: Direct bucket access, high performance, automatic filename sanitization
- **URL Format**: `<CLOUDFLARE_R2_DELIVERY_URL>/<collection>/<filename>`
- **Configuration**: Via `wrangler.toml` bindings (no S3-compatible API)
- **Filename Sanitization**: All filenames are automatically sanitized to URL-safe slugs with random suffixes

### Development Environment
- **Automatic Fallback**: Local file storage used when Cloudflare credentials not configured
- **No Setup Required**: Development works out of the box without Cloudflare accounts

### Storage Implementation Details

**Location**: `src/lib/storage/`

The storage system is built on several key components:

#### Storage Adapters (`storage.ts`)
- `cloudflareImagesAdapter` - Handles image uploads to Cloudflare Images
- `cloudflareStreamAdapter` - Handles video uploads to Cloudflare Stream
- `r2NativeAdapter` - Direct R2 bucket access for audio/files (custom implementation)
- `routerAdapter` - Routes uploads to appropriate adapter based on MIME type

**Important**: All adapters modify `data.filename` directly in `handleUpload` to ensure the database stores the correct filename (service-generated ID or sanitized name).

#### URL Field Factories (`urlFields.ts`)
Factory functions for creating virtual URL fields with consistent CDN URL generation:

- `virtualUrlField({ collection, adapter })` - Base URL field for any storage adapter
- `previewUrlField({ collection, width?, height? })` - Preview/thumbnail URLs for images/videos
- `frameUrlField({ collection })` - Full resolution URLs for mixed media (images → Cloudflare Images, videos → Stream MP4)

**Usage Example**:
```typescript
fields: [
  virtualUrlField({ collection: 'meditations', adapter: 'r2' }),
  frameUrlField({ collection: 'frames' }),
  previewUrlField({ collection: 'frames', width: 320, height: 320 }),
]
```

#### R2 Native Adapter (`r2NativeAdapter.ts`)
Custom adapter for direct R2 bucket access with automatic filename sanitization:

```typescript
r2NativeAdapter({
  bucket: env.R2,
  publicUrl: process.env.CLOUDFLARE_R2_DELIVERY_URL,
})
```

**Filename Sanitization Process** (applied to all uploads):
1. Extract base name and extension
2. Slugify base name (lowercase, URL-safe, strict mode)
3. Add random 6-character suffix for uniqueness
4. Preserve original extension

**Example**: `"My Audio File (1).mp3"` → `"my-audio-file-1-xk2j9s.mp3"`

## Route Structure
- `src/app/(frontend)/` - Public-facing Next.js pages
- `src/app/(payload)/` - Payload CMS admin interface and API routes
- `src/app/(payload)/api/` - Auto-generated API endpoints including GraphQL

## API Explorer (OpenAPI / Scalar)

The application provides interactive REST API documentation using the [payload-oapi](https://github.com/janbuchar/payload-oapi) plugin for spec generation and a custom Scalar plugin with We Meditate branding.

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/openapi.json` | Filtered OpenAPI 3.1 specification (hides internal operations) |
| `/api/openapi.json?role=<role>` | Role-filtered spec (shows only collections for specified client role) |
| `/api/openapi-raw.json` | Raw OpenAPI 3.1 specification (all operations visible) |
| `/api/docs` | Scalar interactive documentation with We Meditate branding |
| `/api/openapi-auth` | OAuth2 password flow authentication |

### Features

- **We Meditate Branding**: Custom coral theme (#F07855) and dynamic logo based on selected role
- **Client Role Selector**: Dropdown to filter visible endpoints by API client role
- **Auto-Generated Documentation**: All collection CRUD endpoints documented automatically
- **Request/Response Schemas**: Generated from Payload field definitions
- **Query Parameters**: Pagination, sorting, filtering (`where`) documented
- **Access-Aware Security**: Endpoints requiring auth show security requirements
- **"Try it Out"**: Test API endpoints directly from Scalar UI
- **Filtered Spec**: Internal operations hidden via `x-internal: true` markers
- **Prioritized HTTP Clients**: Shows only JavaScript, Node.js, Dart, Python examples

### Client Role Filtering

The API docs include a role selector dropdown that filters visible endpoints based on client role permissions:

| Role | Description | Key Collections |
|------|-------------|-----------------|
| All Endpoints | Union of all client role collections | pages, meditations, music, albums, lessons, etc. |
| We Meditate Web | Web frontend application | pages, meditations, music, albums, forms, authors, tags |
| We Meditate App | Mobile application | meditations, lessons, lectures, music, narrators, frames, tags |
| Sahaj Atlas | Atlas application | sahaj-atlas-settings, images, files |

**Usage**: Select a role from the dropdown or use `?role=` query parameter on `/api/openapi.json`.

### Two-Tier Filtering

The filtering system uses a two-tier approach defined in `src/lib/openapi/`:

**1. ALWAYS_HIDDEN_COLLECTIONS** (System collections always hidden):
- `managers`, `clients` (access collections)
- `images`, `files`, `image-tags` (system collections)
- `payload-kv`, `payload-jobs`, `payload-locked-documents`, `payload-preferences`, `payload-migrations`, `payload-job-stats` (Payload internal)

**2. Role-Based Filtering** (Content collections filtered by CLIENT_ROLES):
- When a role is selected, only that role's collections are shown
- When no role is selected, union of all client role collections is shown
- Derived from `CLIENT_ROLES` in `src/fields/PermissionsField.ts`

**Hidden Operations**:
- All `DELETE` and `PATCH` operations
- All `POST` operations except for `form-submissions`

### Authentication in Scalar

1. Click "Authorize" button in Scalar
2. Use your manager email/password for OAuth2 authentication
3. The access token will be used for subsequent "Try it out" requests

### Known Limitations (payload-oapi v0.2.5)

The following features are not supported by the current plugin version:

- **Custom Endpoints Not Documented**: `/api/frames/by-narrator/:narratorId` and `/api/health` are not included in the spec
- **API Key Header Format**: Plugin uses OAuth2 password flow instead of `Authorization: clients API-Key <key>` format

**Plugin Review Schedule**: Check for updates quarterly or when new features needed. See [GitHub](https://github.com/janbuchar/payload-oapi) for roadmap.

### Configuration

Located in `src/payload.config.ts`:

```typescript
import { openapi } from 'payload-oapi'
import { scalarPlugin } from '@/lib/openapi'

plugins: [
  openapi({
    openapiVersion: '3.1',
    specEndpoint: '/openapi-raw.json', // Raw spec
    metadata: {
      title: 'Sahaj Cloud API',
      version: '1.0.0',
      description: 'REST API for Sahaj Cloud CMS - We Meditate content management',
    },
  }),
  scalarPlugin({
    specEndpoint: '/openapi.json', // Filtered spec
    docsUrl: '/docs',
  }),
]
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/openapi/scalarPlugin.ts` | Custom Scalar plugin with branding and role selector |
| `src/lib/openapi/markInternalPaths.ts` | Two-tier filtering logic (ALWAYS_HIDDEN + role-based) |
| `src/lib/openapi/filterByClientRole.ts` | Role-based collection filtering utilities |
| `src/app/(payload)/api/openapi.json/route.ts` | Route handler with `?role=` parameter support |

## Collections

### Access & User Management
- **Managers** (`src/collections/access/Managers.ts`) - Authentication-enabled admin users with email/password authentication, admin toggle for complete access bypass, and granular collection/locale-based permissions array
- **Clients** (`src/collections/access/Clients.ts`) - API client management with authentication keys, usage tracking, granular collection/locale-based permissions, and high-usage alerts

### Content Collections
- **Pages** (`src/collections/content/Pages.ts`) - Rich text content with embedded blocks using Lexical editor, author relationships, tags, auto-generated slugs, drafts system with autosave (60s), version history, and scheduled publishing
- **Meditations** (`src/collections/content/Meditations.ts`) - Guided meditation content with audio files, tags, metadata, frame relationships with timestamps, locale-specific content filtering, drafts system with scheduled publishing, and beforeChange validation requiring frames for publishing
- **Albums** (`src/collections/content/Albums.ts`) - Music album groupings with Cloudflare Images artwork, localized title/artist fields, optional artistUrl, and join field for related music tracks
- **Music** (`src/collections/content/Music.ts`) - Background music tracks with direct audio upload, required album relationship, tags, and localized title field
- **Lessons** (`src/collections/content/Lessons.ts`) - Meditation lessons (also called "Path Steps" in admin UI) with audio upload, panels array for content sections, unit selection (Unit 1-4), step number, icon, optional meditation relationship, and rich text article field

### Resource Collections
- **Images** (`src/collections/resources/Images.ts`) - Image storage using Cloudflare Images with automatic format optimization (WebP, AVIF), dynamic transformations, tags, credit info, and virtual `url` field for Cloudflare CDN delivery
- **Narrators** (`src/collections/resources/Narrators.ts`) - Meditation guide profiles with name, gender, and slug
- **Authors** (`src/collections/resources/Authors.ts`) - Article author profiles with localized name, title, description, countryCode, yearsMeditating, and profile image
- **Lectures** (`src/collections/resources/Lectures.ts`) - Lecture video content with thumbnails, URLs, subtitles, and categorization

### System Collections
- **Frames** (`src/collections/system/Frames.ts`) - Mixed media upload (images/videos) with Cloudflare Images for images and Cloudflare Stream for videos, virtual fields (`url` for full resolution, `previewUrl` for thumbnails), tags filtering, and imageSet selection
- **Files** (`src/collections/system/Files.ts`) - Generic file storage using R2 native bindings for audio, video, and PDF files with trash support and automatic orphan cleanup via the CleanupOrphanedMedia job

### Tag Collections
- **ImageTags** (`src/collections/tags/ImageTags.ts`) - Tag system for image files with title field
- **MeditationTags** (`src/collections/tags/MeditationTags.ts`) - Upload collection for meditation tags with SVG icons, **color picker field**, auto-generated slug from localized title, and bidirectional relationships
- **MusicTags** (`src/collections/tags/MusicTags.ts`) - Upload collection for music tags with SVG icons, auto-generated slug from localized title, and bidirectional relationships (**note: no color field**, unlike MeditationTags)
- **PageTags** (`src/collections/tags/PageTags.ts`) - Tag system for pages with auto-generated slug from localized title and bidirectional relationships

#### Tag Collection Admin Components

Custom admin components for tag management:

- **TagSelector** (`src/components/admin/TagSelector/`) - Visual tag selection with colored circular buttons displaying SVG icons. Uses the Component Wrapper Pattern with pure UI component + PayloadCMS field wrapper. See [custom-components.md](custom-components.md#component-wrapper-pattern-pure-ui--field-wrapper) for details.
- **ColorField** (`src/components/admin/ColorField.tsx`) - Hex color picker using native HTML color input. Used with `ColorField()` factory function from `src/fields/ColorField.ts` for field configuration with validation.

### Plugin-Generated Collections
- **Forms** (Auto-generated by Form Builder plugin) - Form definitions with field configuration and submission handling
- **Form Submissions** (Auto-generated by Form Builder plugin) - Stored form submission data

## Key Configuration Files
- `src/payload.config.ts` - Main Payload CMS configuration with collections, database, email, and plugins
- `next.config.mjs` - Next.js configuration with Payload integration
- `src/payload-types.ts` - Auto-generated TypeScript types (do not edit manually)
- `tsconfig.json` - TypeScript configuration with path aliases
- `eslint.config.mjs` - ESLint configuration for code quality
- `vitest.config.mts` - Vitest configuration for integration tests
- `playwright.config.ts` - Playwright configuration for E2E tests
- `src/lib/richEditor.ts` - Rich text editor configuration presets
- `src/lib/storage/storage.ts` - Storage adapter configuration and routing
- `src/lib/storage/urlFields.ts` - URL field factory functions
- `src/lib/storage/r2NativeAdapter.ts` - Custom R2 storage adapter

## Component Architecture
- `src/components/AdminProvider.tsx` - Payload admin UI provider component (wraps with ProjectProvider)
- `src/components/ErrorBoundary.tsx` - React error boundary for error handling
- `src/app/(payload)/` - Payload CMS admin interface and API routes
- `src/app/(frontend)/` - Public-facing Next.js pages

## Logging & Error Tracking

The application uses **PayloadCMS's built-in Pino logger** for server-side logging and **Sentry** for error tracking, with a custom implementation optimized for Cloudflare Workers.

### Log Level Configuration

Both server-side and client-side logging are controlled by `NEXT_PUBLIC_LOG_LEVEL`:

```bash
# Levels: 'silent' | 'error' | 'warn' | 'info' | 'debug'
NEXT_PUBLIC_LOG_LEVEL=info
```

- **silent**: No console output (errors still captured by Sentry)
- **error**: Only errors
- **warn**: Errors and warnings
- **info**: Errors, warnings, and info messages (default for production)
- **debug**: All messages including debug

### Logging Patterns

**Server-Side (Payload hooks, collections, adapters)**:
```typescript
// In hooks with req access
req.payload.logger.info({ msg: 'Operation completed', documentId: doc.id })
req.payload.logger.warn({ msg: 'Warning message', context: 'details' })
req.payload.logger.error({ msg: 'Error occurred', error: error.message })

// In adapters with payload access
payload.logger.info({ msg: 'Adapter initialized' })
```

**Client-Side (React components)**:
```typescript
import { clientLogger } from '@/lib/clientLogger'

clientLogger.error('Failed to load data', error, { componentId: '123' })
clientLogger.warn('Unexpected state', { details: 'info' })
```

**Routes without Payload access**:
```typescript
// Use console.error with eslint-disable for critical errors only
// eslint-disable-next-line no-console
console.error('[Route Name] Error message:', { error: error.message })
```

### Sentry Integration

- **Custom Plugin**: `src/lib/sentryPlugin.ts` - Cloudflare Workers-compatible Sentry plugin using `@sentry/cloudflare`
- **Client Initialization**: `src/instrumentation-client.ts` - Browser-side Sentry via `@sentry/react` (Next.js instrumentation hook)
- **Error Boundary**: `src/app/global-error.tsx` - React error boundary with Sentry reporting

**Note**: The official `@payloadcms/plugin-sentry` is NOT used because it depends on `@sentry/nextjs` which is incompatible with Cloudflare Workers.

## Rich Text Editor Configuration

The application uses Lexical editor with two configuration presets:

### Basic Rich Text Editor (`basicRichTextEditor`)
- **Features**: Bold, Italic, Link, and InlineToolbar
- **Usage**: Simple text fields that need minimal formatting

### Full Rich Text Editor (`fullRichTextEditor`)
- **Features**: All basic formatting plus:
  - Unordered and Ordered Lists
  - Blockquote
  - Headings (H1, H2)
  - Relationship feature for linking to meditations, music, pages, and forms
  - Blocks feature for embedding custom block components
- **Usage**: Page content and other rich content areas

Configuration located in `src/lib/richEditor.ts`

## Data Seed Scripts

The system includes seed scripts for seeding content from external sources into Payload CMS.

**Documentation**: See [imports/CLAUDE.md](../../imports/CLAUDE.md) for commands, environment variables, and troubleshooting.

**Available Seed Scripts**:
- **Storyblok** (`pnpm seed storyblok`) - Path Steps from Storyblok CMS to Lessons
- **WeMeditate** (`pnpm seed wemeditate`) - Authors, categories, pages from Rails PostgreSQL
- **Meditations** (`pnpm seed meditations`) - Meditation content from legacy database
- **Tags** (`pnpm seed tags`) - MeditationTags and MusicTags from Cloudinary SVGs

All scripts extend `BaseImporter` for idempotent upserts, resilient error handling, and comprehensive reporting.

**Note**: Database schema migrations are in `src/migrations/` using PayloadCMS's built-in migration system.
