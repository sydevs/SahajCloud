# Architecture Overview

## Storage Architecture

The application uses **Cloudflare-native storage services** for optimal performance:

### Cloudflare Images (Image Storage)
- **Collection**: `images`
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
- **Features**: Direct bucket access, high performance
- **URL Format**: `<CLOUDFLARE_R2_DELIVERY_URL>/<collection>/<filename>`
- **Configuration**: Via `wrangler.toml` bindings (no S3-compatible API)

### Development Environment
- **Automatic Fallback**: Local file storage used when Cloudflare credentials not configured
- **No Setup Required**: Development works out of the box without Cloudflare accounts

## Route Structure
- `src/app/(frontend)/` - Public-facing Next.js pages
- `src/app/(payload)/` - Payload CMS admin interface and API routes
- `src/app/(payload)/api/` - Auto-generated API endpoints including GraphQL

## Collections

### Access & User Management
- **Managers** (`src/collections/access/Managers.ts`) - Authentication-enabled admin users with email/password authentication, admin toggle for complete access bypass, and granular collection/locale-based permissions array
- **Clients** (`src/collections/access/Clients.ts`) - API client management with authentication keys, usage tracking, granular collection/locale-based permissions, and high-usage alerts

### Content Collections
- **Pages** (`src/collections/content/Pages.ts`) - Rich text content with embedded blocks using Lexical editor, author relationships, tags, auto-generated slugs, and publish scheduling
- **Meditations** (`src/collections/content/Meditations.ts`) - Guided meditation content with audio files, tags, metadata, frame relationships with timestamps, and locale-specific content filtering
- **Music** (`src/collections/content/Music.ts`) - Background music tracks with direct audio upload, tags, and metadata (title and credit fields are localized)
- **Lessons** (`src/collections/content/Lessons.ts`) - Meditation lessons (also called "Path Steps" in admin UI) with audio upload, panels array for content sections, unit selection (Unit 1-4), step number, icon, optional meditation relationship, and rich text article field

### Resource Collections
- **Images** (`src/collections/resources/Images.ts`) - Image storage using Cloudflare Images with automatic format optimization (WebP, AVIF), dynamic transformations, tags, credit info, and virtual `url` field for Cloudflare CDN delivery
- **Narrators** (`src/collections/resources/Narrators.ts`) - Meditation guide profiles with name, gender, and slug
- **Authors** (`src/collections/resources/Authors.ts`) - Article author profiles with localized name, title, description, countryCode, yearsMeditating, and profile image
- **Lectures** (`src/collections/resources/Lectures.ts`) - Lecture video content with thumbnails, URLs, subtitles, and categorization

### System Collections
- **Frames** (`src/collections/system/Frames.ts`) - Mixed media upload (images/videos) with Cloudflare Images for images and Cloudflare Stream for videos, automatic thumbnail generation, virtual fields (`thumbnailUrl`, `streamMp4Url`), tags filtering, and imageSet selection
- **Files** (`src/collections/system/Files.ts`) - Generic file storage using R2 native bindings, supporting PDFs, audio, video, and images with owner relationships for cascade deletion and virtual `url` field for R2 URLs

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

## Data Import Scripts

The system includes import scripts for importing content from external sources into Payload CMS.

**Documentation**: See [imports/CLAUDE.md](../../imports/CLAUDE.md) for commands, environment variables, and troubleshooting.

**Available Import Scripts**:
- **Storyblok** (`pnpm import storyblok`) - Path Steps from Storyblok CMS to Lessons
- **WeMeditate** (`pnpm import wemeditate`) - Authors, categories, pages from Rails PostgreSQL
- **Meditations** (`pnpm import meditations`) - Meditation content from legacy database
- **Tags** (`pnpm import tags`) - MeditationTags and MusicTags from Cloudinary SVGs

All scripts extend `BaseImporter` for idempotent upserts, resilient error handling, and comprehensive reporting.

**Note**: Database schema migrations are in `src/migrations/` using PayloadCMS's built-in migration system.
