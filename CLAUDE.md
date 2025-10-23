# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overall instructions
- Always ask me before editing, creating, or closing a GitHub issue or PR

## Project Overview

This is a **Next.js 15** application integrated with **Payload CMS 3.0**, providing a headless content management system. The project uses TypeScript, MongoDB, and is configured for both development and production deployment.

### PayloadCMS Documentation

**IMPORTANT**: The comprehensive PayloadCMS documentation for LLMs is available at:
**https://payloadcms.com/llms-full.txt**

Consult this documentation for detailed information about Payload CMS features, APIs, and best practices.

## Admin Access
There is a default user with the following credentials which can be used to access the admin panel in the dev server.
Username: contact@sydevelopers.com
Password: evk1VTH5dxz_nhg-mzk

The admin panel can be accessed at http://localhost:3000/admin/login once the development server is running.

## Essential Commands

### Development
- `pnpm dev` - Start development server (runs on http://localhost:3000)
- `pnpm devsafe` - Clean development start (removes .next directory first)
- `pnpm build` - Production build
- `pnpm start` - Start production server

### Code Quality & Types
- `pnpm lint` - Run ESLint
- `pnpm generate:types` - Generate TypeScript types from Payload schema (run after schema changes)
- `pnpm generate:importmap` - Generate import map for admin panel

### Testing
- `pnpm test` - Run all tests (integration + E2E)
- `pnpm test:int` - Run integration tests (Vitest)
- `pnpm test:e2e` - Run E2E tests (Playwright)

## Environment Setup

### Required Environment Variables
Copy from `.env.example` and configure:

**Core Configuration**
- `DATABASE_URI` - MongoDB connection string
- `PAYLOAD_SECRET` - Secret key for authentication

**Email Configuration (Production)**
- `SMTP_HOST` - SMTP server host (default: smtp.gmail.com)
- `SMTP_PORT` - SMTP server port (default: 587)
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password  
- `SMTP_FROM` - From email address (default: contact@sydevelopers.com)

**Cloudflare R2 S3-Compatible Storage (Required for Production)**
- `S3_ENDPOINT` - Cloudflare R2 server endpoint (e.g., `https://your-account-id.r2.cloudflarestorage.com`)
- `S3_ACCESS_KEY_ID` - Cloudflare R2 access key ID
- `S3_SECRET_ACCESS_KEY` - Cloudflare R2 secret access key
- `S3_BUCKET` - Storage bucket name
- `S3_REGION` - Region (use `auto` for Cloudflare R2)

**Note**: If S3 variables are not configured, the system automatically falls back to local file storage (development only).

## Code editing

After making changes to the codebase, always lint the code and fix all Typescript errors.

If necessary, you should also run `pnpm run generate:types`

## Architecture Overview

### Route Structure
- `src/app/(frontend)/` - Public-facing Next.js pages
- `src/app/(payload)/` - Payload CMS admin interface and API routes
- `src/app/(payload)/api/` - Auto-generated API endpoints including GraphQL

### Collections
- **Managers** (`src/collections/access/Managers.ts`) - Authentication-enabled admin users with email/password authentication, admin toggle for complete access bypass, and granular collection/locale-based permissions array
- **Media** (`src/collections/resources/Media.ts`) - **Image-only collection** with automatic WEBP conversion, tags, credit info, and dimensions metadata
- **Narrators** (`src/collections/resources/Narrators.ts`) - Meditation guide profiles with name, gender, and slug
- **Authors** (`src/collections/resources/Authors.ts`) - Article author profiles with localized name, title, description, countryCode, yearsMeditating, and profile image
- **Meditations** (`src/collections/content/Meditations.ts`) - Guided meditation content with audio files, tags, metadata, frame relationships with timestamps, and locale-specific content filtering
- **Pages** (`src/collections/content/Pages.ts`) - Rich text content with embedded blocks using Lexical editor, author relationships, tags, auto-generated slugs, and publish scheduling
- **Music** (`src/collections/content/Music.ts`) - Background music tracks with direct audio upload, tags, and metadata (title and credit fields are localized)
- **Frames** (`src/collections/system/Frames.ts`) - Meditation pose files with mixed media upload (images/videos), tags filtering, and imageSet selection
- **MediaTags** (`src/collections/tags/MediaTags.ts`) - Tag system for media files with slug-based identification
- **MeditationTags** (`src/collections/tags/MeditationTags.ts`) - Tag system for meditations with bidirectional relationships (title field is localized)
- **MusicTags** (`src/collections/tags/MusicTags.ts`) - Tag system for music tracks with bidirectional relationships (title field is localized)
- **PageTags** (`src/collections/tags/PageTags.ts`) - Tag system for pages with bidirectional relationships (title field is localized)
- **Clients** (`src/collections/access/Clients.ts`) - API client management with authentication keys, usage tracking, granular collection/locale-based permissions, and high-usage alerts
- **Lessons** (`src/collections/content/Lessons.ts`) - Meditation lessons (also called "Path Steps" in admin UI) with audio upload, panels array for content sections, unit selection (Unit 1-4), step number, icon, optional meditation relationship, and rich text article field
- **FileAttachments** (`src/collections/system/FileAttachments.ts`) - File upload system supporting PDFs, audio (MP3), video (MP4/MPEG), and images (WebP) with owner relationships for cascade deletion
- **ExternalVideos** (`src/collections/resources/ExternalVideos.ts`) - External video content with thumbnails, URLs, subtitles, and categorization
- **Forms** (Auto-generated by Form Builder plugin) - Form definitions with field configuration and submission handling
- **Form Submissions** (Auto-generated by Form Builder plugin) - Stored form submission data

### Pages Collection & Rich Text Architecture

The **Pages Collection** uses Payload's Lexical rich text editor with embedded blocks, enabling editors to create flexible page content with inline formatting and block components.

#### Pages Collection Structure
- **Location**: `src/collections/content/Pages.ts`
- **Core Fields**:
  - `title` (text, required, localized) - Page title
  - `slug` (text, unique, auto-generated) - URL-friendly identifier generated from title using the Better Fields plugin
  - `content` (richText, localized) - Main content area using Lexical editor with embedded blocks
  - `publishAt` (date, optional, localized) - Schedule publishing date (uses PublishStateCell component)
  - `category` (select, required) - Page category: technique, artwork, event, knowledge
  - `tags` (relationship, hasMany, optional) - Relationship to page-tags collection for flexible tag management

#### Embedded Block Components (`src/blocks/pages/`)
The system provides 5 block types that can be embedded within the rich text editor:

1. **TextBoxBlock** (`TextBoxBlock.ts`) - Styled text box component:
   - `style` (select, required, default: 'splash') - Display style: splash, leftAligned, rightAligned, overlay
   - `title` (text, optional, localized) - Block title
   - `text` (richText, required, localized) - Main content with 250-character limit validation
   - `image` (upload relationship to Media, optional) - Accompanying image
   - `link` (text, optional) - URL field for external links
   - `actionText` (text, optional, localized) - Call-to-action text for links

2. **ButtonBlock** (`ButtonBlock.ts`) - Simple button component:
   - `text` (text, localized) - Button text
   - `url` (text) - Button link URL

3. **LayoutBlock** (`LayoutBlock.ts`) - Multi-item layout component:
   - `style` (select, required) - Layout style: grid, columns, accordion
   - `items` (array) - Collection of items, each containing:
     - `image` (upload relationship to Media, optional)
     - `title` (text, optional, localized)
     - `text` (richText, optional, localized)
     - `link` (text, optional) - URL field

4. **GalleryBlock** (`GalleryBlock.ts`) - Content gallery component:
   - `title` (text, optional, localized) - Gallery title
   - `collectionType` (select, required) - Target collection: media, meditations, pages
   - `items` (relationship, hasMany, max: 10) - Related content items with dynamic collection filtering

5. **QuoteBlock** (`QuoteBlock.ts`) - Quote component:
   - `text` (text, required) - Quote text
   - `author` (text, optional) - Quote author
   - `subtitle` (text, optional) - Additional context or subtitle

#### Key Features
- **Lexical Editor Integration**: Full-featured editor with formatting options and embedded blocks
- **Character Count Validation**: TextBoxBlock text field enforces 250-character limit with HTML stripping
- **Gallery Block Validation**: Maximum 10 items per gallery with conditional relationship filtering
- **Localization Support**: All text content fields support 16 locales (en, es, de, it, fr, ru, ro, cs, uk, el, hy, pl, pt-br, fa, bg, tr)
- **Slug Generation**: Uses Better Fields plugin for automatic slug generation from title
- **Admin Integration**: Uses PublishStateCell component and slug generation utilities

#### Testing Coverage
- **Integration Tests**: `tests/int/pages.int.spec.ts` with comprehensive test cases
- **Test Data Factories**: Enhanced `testData.ts` with `createPage()` helper function
- **Block Validation**: Tests for character limits, item counts, and block structure validation

### Localization Architecture

The application supports comprehensive localization for 16 locales: English (`en`), Spanish (`es`), German (`de`), Italian (`it`), French (`fr`), Russian (`ru`), Romanian (`ro`), Czech (`cs`), Ukrainian (`uk`), Greek (`el`), Armenian (`hy`), Polish (`pl`), Brazilian Portuguese (`pt-br`), Farsi/Persian (`fa`), Bulgarian (`bg`), and Turkish (`tr`).

#### Global Configuration
- Configured in `src/payload.config.ts` with all 16 locales and `defaultLocale: 'en'`
- Payload CMS automatically handles locale switching in the admin UI
- Fallback enabled to provide content in default locale when translations are missing

#### Field-Level Localization
Collections with localized fields:
- **MeditationTags** and **MusicTags**: `title` field is localized
- **Media**: `alt` and `credit` fields are localized  
- **Music**: `title` and `credit` fields are localized

#### Meditations Locale Handling
The Meditations collection uses a different approach - each meditation belongs to a single locale:
- `locale` field: Select field with options for 'en' (English) and 'cs' (Czech)
- Default value: 'en'
- Locale-based filtering implemented via `beforeFind` and `beforeCount` hooks
- API queries respect `?locale=en` or `?locale=cs` parameters

#### API Usage Examples
```bash
# Get English meditation tags
GET /api/meditation-tags?locale=en

# Get Czech meditations
GET /api/meditations?locale=cs

# Get music with Czech titles
GET /api/music?locale=cs
```

### Global Configuration Architecture

The application uses PayloadCMS Global Configs to manage centralized content configuration for the We Meditate website.

#### We Meditate Web Settings Global

- **Location**: `src/globals/WeMeditateWebSettings.ts`
- **Slug**: `we-meditate-web-settings`
- **Admin Group**: Configuration
- **Access Control**: Admin-only using `adminOnlyAccess()`
- **Purpose**: Centrally manage static page assignments, featured navigation, and tag filters for the We Meditate website

##### Tabs and Fields

**Static Pages Tab**:
- `homePage` (relationship to pages, required) - Home page content
- `musicPage` (relationship to pages, required) - Music page content
- `classesPage` (relationship to pages, required) - Classes page content
- `subtleSystemPage` (relationship to pages, required) - Subtle System page content
- `techniquesPage` (relationship to pages, required) - Techniques page content
- `inspirationPage` (relationship to pages, required) - Inspiration page content

**Navigation Tab**:
- `featuredPages` (relationship to pages, hasMany, minRows: 3, maxRows: 7, required) - Featured pages in website menu with drag-to-reorder capability

**Tag Filters Tab**:
- `inspirationPageTags` (relationship to page-tags, hasMany, minRows: 3, maxRows: 5, required) - Page tags displayed on Inspiration page
- `musicPageTags` (relationship to music-tags, hasMany, minRows: 3, maxRows: 5, required) - Music tags displayed on Music page

##### Key Features
- **Admin-Only Access**: Only users with `admin: true` can view and modify the settings
- **Required Relationships**: All static page fields must be populated
- **Validation Constraints**: Featured pages (3-7 items) and tag filters (3-5 items each) enforce min/max row counts
- **Drag-to-Reorder**: Featured pages can be reordered in the admin interface
- **Centralized Management**: Single source of truth for website content configuration

##### Implementation Details
- Defined in `src/globals/WeMeditateWebSettings.ts`
- Exported via `src/globals/index.ts` along with other global configs
- Registered in `src/payload.config.ts` via the `globals` array
- Uses tabs for organized field grouping (Static Pages, Navigation, Tag Filters)

### Lessons Collection Architecture

The Lessons collection (labeled as "Path Steps" in the admin UI) provides meditation lesson organization with individual path steps.

#### Lessons Collection
- **Purpose**: Individual meditation lessons with audio content and visual panels
- **Collection Slug**: `lessons`
- **Admin Labels**: "Path Step" (singular) / "Path Steps" (plural)
- **Fields**:
  - `title` (text, required) - Lesson name
  - `panels` (array, required, min 1) - Story panels with different block types:
    - **Cover Panel** (`cover` blockType) - Title and quote from Shri Mataji
    - **Text Panel** (`text` blockType) - Title, text content, and image
    - **Video Panel** (`video` blockType) - Video content with FileAttachment
  - `introAudio` (FileAttachment field, optional) - Audio introduction to the lesson
  - `introSubtitles` (json, optional) - Subtitles for the intro audio in JSON format
  - `meditation` (relationship to Meditations, optional) - Related guided meditation for practice
  - `article` (richText, localized, optional) - Deep dive article content using Lexical editor with QuoteBlock support
  - **Appearance Tab**:
    - `unit` (select, required) - Unit selection: "Unit 1", "Unit 2", "Unit 3", "Unit 4"
    - `step` (number, required) - Step number within the unit
    - `icon` (relationship to FileAttachments, optional) - Step icon image
- **Features**:
  - Multiple panels for structured storytelling with different block types
  - Optional audio introduction with JSON subtitle support
  - Optional relationship to existing meditation for guided practice
  - Localized rich text article field for deep dive explanations (not a relationship to Pages)
  - Unit-based organization (Unit 1-4) with step numbering
  - Soft delete support (trash functionality)
  - Version control and draft support

#### Key Implementation Notes
- Uses `permissionBasedAccess()` for consistent access control
- First panel must be a Cover Panel with title and quote (validated)
- Panels use union block types for flexible content structure: CoverStoryBlock, TextStoryBlock, VideoStoryBlock
- FileAttachments for introAudio and icon support cascade deletion via ownership system
- Article field is a rich text field within the Lesson, not a relationship to the Pages collection

### Rich Text Editor Configuration

The application uses Lexical editor with two configuration presets:

#### Basic Rich Text Editor (`basicRichTextEditor`)
- **Features**: Bold, Italic, Link, and InlineToolbar
- **Usage**: Simple text fields that need minimal formatting

#### Full Rich Text Editor (`fullRichTextEditor`)
- **Features**: All basic formatting plus:
  - Unordered and Ordered Lists
  - Blockquote
  - Headings (H1, H2)
  - Relationship feature for linking to meditations, music, pages, and forms
  - Blocks feature for embedding custom block components
- **Usage**: Page content and other rich content areas

Configuration located in `src/lib/richEditor.ts`

### Payload Plugins

The system integrates several official Payload plugins:

#### SEO Plugin (`@payloadcms/plugin-seo`)
- **Applied to**: Pages collection
- **Features**: 
  - Generates SEO metadata for pages
  - Custom title template: "We Meditate — {title}"
  - Uses page content for description
  - Tabbed UI for better organization
- **Configuration**: In `src/payload.config.ts`

#### Form Builder Plugin (`@payloadcms/plugin-form-builder`)
- **Collections Created**:
  - `forms` - Form definitions with permission-based access
  - `form-submissions` - Submitted form data
- **Default Email**: contact@sydevelopers.com
- **Admin Groups**: Forms in "Resources", submissions in "System"
- **Access Control**: Uses standard permission-based access

#### Better Fields Plugin (`@nouance/payload-better-fields-plugin`)
- **Features Used**: SlugField for automatic slug generation
- **Implementation**: Pages collection uses `SlugField('title')` for auto-generating slugs from titles
- **Benefits**: Consistent URL-friendly identifiers across content

### Key Configuration Files
- `src/payload.config.ts` - Main Payload CMS configuration with collections, database, email, and plugins
- `next.config.mjs` - Next.js configuration with Payload integration
- `src/payload-types.ts` - Auto-generated TypeScript types (do not edit manually)
- `tsconfig.json` - TypeScript configuration with path aliases
- `eslint.config.mjs` - ESLint configuration for code quality
- `vitest.config.mts` - Vitest configuration for integration tests
- `playwright.config.ts` - Playwright configuration for E2E tests
- `src/lib/richEditor.ts` - Rich text editor configuration presets

### Email Configuration

**CURRENT STATUS**: Email configuration is currently **disabled** (commented out in `src/payload.config.ts`).

The application has pre-configured email support using `@payloadcms/email-nodemailer` that can be enabled when needed:

#### Development Environment (When Enabled)
- **Provider**: Ethereal Email (automatic test email service)
- **Features**: Captures all outbound emails for testing
- **Configuration**: No setup required - automatically configured when no transport options are provided
- **Testing**: Access mock emails at https://ethereal.email using generated credentials

#### Production Environment (When Enabled)
- **Provider**: Gmail SMTP
- **Configuration**: Requires environment variables for Gmail authentication
- **Email Address**: contact@sydevelopers.com

#### Test Environment
- **Provider**: Disabled (email configuration is disabled in test environment to prevent model conflicts)
- **Testing**: Email logic is tested separately without full Payload initialization

#### Environment Variables
```env
# Production Gmail SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=contact@sydevelopers.com
SMTP_PASS=your-gmail-app-password-here
SMTP_FROM=contact@sydevelopers.com
```

#### Authentication Features
- **Email Verification**: Uses Payload's default email verification flow
- **Password Reset**: Uses Payload's default password reset functionality
- **Automatic Emails**: Sent for user registration and password reset requests using default templates

### Video Thumbnail Generation Architecture

The system automatically generates thumbnails for video frames to optimize admin interface performance:

#### Key Components
- **Video Thumbnail Utils** (`src/lib/videoThumbnailUtils.ts`) - Core thumbnail generation logic using FFmpeg
- **FFmpeg Integration** - Uses `ffmpeg-static` for reliable video processing
- **Sharp Processing** - Generates 320x320 WebP thumbnails matching existing image sizes
- **Automatic Generation** - Thumbnails created at 0.1 seconds into video during upload

#### Implementation Details
- **File Processing** (`src/lib/fieldUtils.ts`) - Extended `convertFile` hook handles video thumbnail generation
- **Storage Integration** - Thumbnails added to `req.payloadUploadSizes.small` for automatic Payload storage handling
- **Automatic Storage** - Payload's storage adapter handles uploading thumbnail files (local, S3, etc.)
- **Component Integration** - `ThumbnailCell` and `FrameItem` components display thumbnails from `sizes.small.url`
- **File Cleanup** - Thumbnail files automatically deleted when Frame is deleted (via Payload's storage system)
- **URL Generation** - Thumbnail URLs automatically generated by Payload's storage adapter
- **Graceful Fallbacks** - Falls back to video elements when thumbnail generation fails
- **Error Handling** - Comprehensive error handling ensures system stability

#### Admin Interface Benefits
- **Fast Loading** - Thumbnail images load significantly faster than video elements
- **Visual Identification** - Video content easily identifiable in admin lists and frame editor
- **Performance Optimized** - Reduces page load times when multiple video frames are displayed
- **Consistent UX** - Unified thumbnail display for both image and video content

### Data Import Architecture

The system includes import scripts for migrating content from external sources into Payload CMS. All scripts follow a consistent, standardized pattern for reliability and maintainability.

#### Import Scripts Design Principles

All migration scripts adhere to these core principles:

1. **Resilient Error Handling**: Scripts continue on errors, collecting them for end-of-run reporting rather than failing fast
2. **No Resumability**: Scripts are stateless - focus on clean reset and re-import rather than resuming partial imports
3. **Comprehensive Dry Run**: Initialize Payload and validate data structure without writing to database
4. **Shared Utilities**: Use common library code from `migration/lib/` for consistency
5. **Detailed Reporting**: Comprehensive summary with counts, errors, and warnings at end of run
6. **Clean Shutdown**: Proper cleanup of database connections and resources in finally blocks

#### Shared Migration Libraries

**Location**: `migration/lib/`

- **Logger** (`logger.ts`) - Colored console output + file logging with timestamps
- **FileUtils** (`fileUtils.ts`) - File downloads, directory management, MIME type detection
- **TagManager** (`tagManager.ts`) - Tag creation and management across collections
- **PayloadHelpers** (`payloadHelpers.ts`) - Common Payload operations (reset, create, update)
- **MediaDownloader** (`mediaDownloader.ts`) - Image download and WebP conversion
- **LexicalConverter** (`lexicalConverter.ts`) - EditorJS to Lexical content conversion

#### Standard Script Structure

```typescript
class Importer {
  // Summary tracking
  private summary = {
    recordsCreated: 0,
    errors: [],
    warnings: []
  }

  // Error handling
  private addError(context: string, error: Error | string) {
    const message = error instanceof Error ? error.message : error
    this.summary.errors.push(`${context}: ${message}`)
    this.logger.error(message)
  }

  // Import with resilient error handling
  async importItems(items: any[]) {
    for (const item of items) {
      try {
        if (this.options.dryRun) {
          this.logger.info('[DRY RUN] Would create...')
          continue
        }
        // Create record
        this.summary.recordsCreated++
      } catch (error) {
        this.addError(`Failed to import ${item.id}`, error)
        continue  // Keep going!
      }
    }
  }

  // Comprehensive summary
  printSummary() {
    console.log('='.repeat(60))
    console.log('IMPORT SUMMARY')
    console.log(`Records Created: ${this.summary.recordsCreated}`)
    console.log(`Errors: ${this.summary.errors.length}`)
    console.log(`Warnings: ${this.summary.warnings.length}`)
    // ... detailed error/warning output
  }

  // Cleanup in finally block
  async run() {
    try {
      // Initialize Payload (even for dry run)
      this.payload = await getPayload({ config })
      // ... import logic
      this.printSummary()
    } finally {
      await this.cleanup()
      if (this.payload?.db?.destroy) {
        await this.payload.db.destroy()
      }
    }
  }
}
```

#### Storyblok Path Steps Import

**Location**: `migration/storyblok/import.ts`

Migrates "Path Step" data from Storyblok CMS into Payload's **Lessons** collection.

**Key Features**:
- **Comprehensive Caching**: Downloads and caches all Storyblok data and assets in `migration/cache/storyblok/`
- **Asset Processing**: Automatic conversion of images to WebP format using Sharp
- **FileAttachment Management**: Proper ownership assignment for cascade deletion
- **Lexical Content Conversion**: Transforms Storyblok blocks into Payload's Lexical editor format
- **Resilient Error Handling**: Continues on errors, reports at end
- **Collection Reset**: `--reset` flag for clean import (deletes existing tagged records)
- **Colored Logging**: Uses Logger class with color-coded output

**Usage Examples**:
```bash
# Dry run validation (initializes Payload, validates data)
NODE_ENV=development npx tsx migration/storyblok/import.ts --dry-run

# Import single unit for testing
NODE_ENV=development npx tsx migration/storyblok/import.ts --unit=1

# Clear cache and run fresh import
NODE_ENV=development npx tsx migration/storyblok/import.ts --clear-cache

# Destructive reset and fresh import
NODE_ENV=development npx tsx migration/storyblok/import.ts --reset --unit=1
```

**Data Transformation**:
- **Storyblok Path Steps** → **Lessons Collection**: Title, unit (Unit 1-4), step number, panels (text/video), meditation references, intro audio/subtitles, deep dive articles, and step icons
- **Storyblok Blocks** → **Lexical Content**: Rich text conversion with embedded blocks, relationships, and media uploads
- **Assets Processing**: Automatic download, WebP conversion, and FileAttachment creation with proper ownership
- **Meditation Matching**: Case-insensitive title matching with existing meditation content

**File Organization**:
```
migration/cache/storyblok/
├── videos/{uuid}.json        # Cached video stories
├── assets/
│   ├── audio/{filename}.mp3  # Downloaded audio files
│   ├── images/{filename}.webp # Converted images
│   ├── videos/{filename}.mp4  # Video files
│   └── subtitles/{filename}.json # Subtitle data
└── import.log                # Timestamped import log
```

**Requirements**:
- `STORYBLOK_ACCESS_TOKEN` environment variable
- Sharp library for image processing
- Target collections: `lessons`, `file-attachments`, `external-videos`, `media`

**Summary Output**:
```
============================================================
IMPORT SUMMARY
============================================================

📊 Records Created:
  Lessons:             18
  Media Files:         45
  External Videos:     3
  File Attachments:    24

  Total Records:       90

⚠️  Warnings (2):
  1. Meditation "Step 3" not found for Step 3: Introduction...
  2. Missing Step_Image for lesson: Step 6...

✨ No errors - import completed successfully!

============================================================
```

#### WeMeditate Rails Database Import

**Location**: `migration/wemeditate/import.ts`

Imports content from the Rails-based WeMeditate PostgreSQL database into Payload CMS across 9 locales, including authors, categories, and pages (~160+ pages across multiple content types).

**Documentation**: See [migration/wemeditate/README.md](migration/wemeditate/README.md) for detailed information on usage, data transformations, and future enhancements.

### Sentry Integration Files
- `src/instrumentation.ts` - Server-side Sentry instrumentation
- `src/instrumentation-client.ts` - Client-side Sentry instrumentation  
- `src/sentry.server.config.ts` - Sentry server configuration
- `src/sentry.edge.config.ts` - Sentry edge runtime configuration
- `src/app/global-error.tsx` - Global error boundary with Sentry integration

### Meditation-Frame Relationships Architecture

The system implements a dual-approach for managing meditation-frame relationships with timestamps:

#### Collections Structure
- **MeditationFrames Collection**: Hidden join table that stores the actual relationships
  - `meditation`: Required relationship to meditations collection
  - `frame`: Required relationship to frames collection  
  - `timestamp`: Required number field (seconds) with uniqueness validation per meditation
  - Hidden from admin panel navigation (`admin.hidden: true`)
  - Includes field-level indexes for efficient querying

- **Meditations Collection**: Includes `frames` array field for admin interface management
  - Each frame entry contains: `frame` (relationship) and `timestamp` (number)
  - Automatically sorts frames by timestamp using `beforeChange` hook
  - Syncs with MeditationFrames collection via `afterChange` and `afterDelete` hooks

#### Data Flow
1. **Create/Update**: When a meditation is saved with frame relationships:
   - Meditation frames array is sorted by timestamp
   - Existing MeditationFrames records are deleted
   - New MeditationFrames records are created from the frames array

2. **Delete**: When a meditation is deleted:
   - All associated MeditationFrames records are automatically cleaned up

3. **Validation**: Timestamp uniqueness is enforced per meditation:
   - Custom validation in MeditationFrames collection prevents duplicate timestamps
   - Clear error messages guide users to resolve conflicts

#### Benefits
- **Admin UX**: Frames are managed directly within meditation interface
- **Data Integrity**: Separate join table ensures referential integrity
- **Performance**: Indexed relationships enable efficient queries
- **Flexibility**: Both collections can be queried independently as needed

### Component Architecture
- `src/components/AdminProvider.tsx` - Payload admin UI provider component
- `src/components/ErrorBoundary.tsx` - React error boundary for error handling
- `src/app/(payload)/` - Payload CMS admin interface and API routes
- `src/app/(frontend)/` - Public-facing Next.js pages

### We Meditate Branding

The application features custom branding for We Meditate throughout both the admin panel and public-facing pages.

#### Admin Panel Branding
- **Logo Component** (`src/components/branding/Logo.tsx`) - We Meditate coral square logo displayed on login/signup pages using Next.js Image component
- **Icon Component** (`src/components/branding/Icon.tsx`) - Lotus SVG icon in admin navigation with theme-adaptive coloring:
  - Dark theme: white/light fill (#ffffff)
  - Light theme: dark fill (#1a1a1a)
  - Uses CSS with `[data-theme]` selectors for automatic theme adaptation
- **Configuration** - Registered in `src/payload.config.ts` as path-based components in `admin.components.graphics`

#### Frontend Splash Page
- **Location**: `src/app/(frontend)/page.tsx`
- **Features**:
  - We Meditate coral square logo with subtle floating animation
  - "We Meditate Admin" title
  - Coral color scheme (#F07855) with gradient animations
  - Simplified background with two animated gradient orbs
  - "Enter Admin Panel" button with coral gradient
  - Footer: "We Meditate • Powered by Payload CMS"
- **Metadata**: Updated in `src/app/(frontend)/layout.tsx` with "We Meditate Admin" title

#### Color Palette
- **Primary Coral**: `#F07855`
- **Coral Light**: `#FF9477`
- **Coral Dark**: `#D86545`
- **Gradients**: Linear gradients using coral variations

#### External Image Configuration
- **Next.js Config** (`next.config.mjs`) - Configured to allow images from `raw.githubusercontent.com` for We Meditate logo assets
- **Assets Source**: Logos sourced from We Meditate GitHub repository

### MeditationFrameEditor Architecture

The **Audio-Synchronized Frame Editor** is a sophisticated custom field component for the Meditations collection that provides audio-synchronized frame management with a rich admin interface.

#### Component Structure
- `src/components/admin/MeditationFrameEditor/`
  - `index.tsx` - Main component integrating with Payload's field system using `useField` hook
  - `types.ts` - TypeScript interfaces for KeyframeData and component props
  - `MeditationFrameEditorModal.tsx` - Modal wrapper with collapsed/expanded states
  - `AudioPlayer.tsx` - HTML5 audio player with timeline and frame markers
  - `FrameLibrary.tsx` - Grid display of available frames with filtering
  - `FrameManager.tsx` - Current frame list with inline editing capabilities
  - `FramePreview.tsx` - Live slideshow preview synchronized with audio

#### Key Features
- **Modal-Based Interface**: Uses Payload's `FullscreenModal` for consistent styling
  - Collapsed state: Live preview + "Edit Video" button
  - Expanded state: Two-column layout (preview/audio/frames | frame library)
- **Audio Integration**: HTML5 audio player with click-to-seek timeline
- **Frame Synchronization**: Real-time frame switching based on audio timestamp
- **Gender-Based Filtering**: Automatically filters frames by narrator gender (imageSet)
- **Tag-Based Filtering**: Multi-select tag filtering for frame discovery
- **Timestamp Validation**: Prevents duplicate timestamps and enforces constraints
- **First-Frame Rule**: Automatically sets first frame to 0 seconds

#### Data Integration
- **Field Integration**: Uses `useField<KeyframeData[]>` hook for Payload compatibility
- **Dynamic Loading**: Loads audio URL and narrator data from sibling fields
- **API Integration**: Fetches frames and narrator data via Payload's REST API
- **State Management**: Temporary state for modal with save/cancel functionality

#### User Workflow
1. User uploads audio file to meditation
2. "Edit Video" button becomes enabled in collapsed state
3. Modal opens with frame library filtered by narrator gender
4. User clicks frames to add them at current audio timestamp
5. Frame Manager allows timestamp editing with validation
6. Live Preview shows synchronized slideshow
7. Save/Cancel maintains data integrity

#### Technical Implementation
- **Custom Field Component**: Registered in Meditations collection as `json` field type
- **Type Safety**: Full TypeScript integration with payload-types.ts
- **Error Handling**: Graceful degradation for missing audio or frames
- **Performance**: Efficient frame loading and caching
- **Accessibility**: Keyboard navigation and screen reader support

### Client API Authentication Architecture

The system implements secure REST API authentication for third-party clients with comprehensive usage tracking and access control.

#### Key Components
- **Clients Collection** (`src/collections/Clients.ts`): Manages API clients with authentication keys
  - `useAPIKey: true` enables API key generation for each client
  - Managers can regenerate keys and manage client settings
  - Virtual `highUsageAlert` field indicates when daily limits are exceeded
  
- **Usage Tracking** (`src/lib/apiUsageTracking.ts`): Simplified request monitoring
  - In-memory counter with batch database updates every 10 requests
  - Automatic daily counter reset at midnight UTC
  - High usage alerts via Sentry when exceeding 1,000 requests/day
  
- **Client Hooks** (`src/hooks/clientHooks.ts`): Collection-level tracking
  - `createAPITrackingHook()`: Applied to all collections for usage monitoring
  - Validates client data and manages relationships

#### API Authentication Flow
1. Client sends request with header: `Authorization: clients API-Key <key>`
2. Payload authenticates using the encrypted API key
3. Access control middleware enforces read-only permissions
4. Usage tracking records the request in memory
5. Batch updates persist usage stats to database

#### Security Features
- **Permission-Based Access**: API clients require explicit collection/locale permissions (Read or Manage levels)
- **No Delete Access**: API clients never get delete access, even with Manage permissions
- **Collection Restrictions**: Managers and Clients collections completely blocked for API clients
- **Active Status**: Only active clients can authenticate
- **Encrypted Keys**: API keys encrypted with PAYLOAD_SECRET
- **GraphQL Disabled**: All API access through REST endpoints only

#### Usage Monitoring
- **Real-time Tracking**: Request counts updated in memory
- **Efficient Storage**: Batch updates reduce database load
- **Daily Limits**: Automatic alerts for high usage (>1,000 requests/day)
- **Sentry Integration**: High usage events logged with client details

#### Testing
- **Integration Tests** (`tests/int/clients.int.spec.ts`): Client CRUD operations
- **API Auth Tests** (`tests/int/api-auth.int.spec.ts`): Authentication flow
- **E2E Tests** (`tests/e2e/clients.e2e.spec.ts`): Admin UI functionality
- **Test Helpers**: Factory functions for creating test clients and requests

### Collection and Locale-Based Permissions System

The CMS implements a granular permission system that provides per-collection and per-locale access control for both Managers and API Clients, replacing the previous simple role-based approach with a flexible array-based permissions model.

#### Permission Structure
Each permission entry contains:
- **Collection**: Select from available collections (excluding Managers, Clients, and hidden collections)
- **Permission Level**: 
  - **Managers**: "Translate" or "Manage"
  - **API Clients**: "Read" or "Manage"
- **Locales**: Multi-select from configured locales (`en`, `cs`) with option to select "All Locales"

#### Manager Permissions
- **Admin Toggle**: Complete bypass of all permission restrictions when enabled
- **Read Access**: All collections (automatic, no configuration needed)
- **Collection Visibility**: Collections only appear in admin UI if they have Translate or Manage permissions
- **Translate Permission**: 
  - Cannot create documents
  - Can only edit fields with `localized: true` attribute
  - Restricted to specified locales
- **Manage Permission**:
  - Can create, update, delete documents within specified locales only
  - Can delete documents only if collection has `trash: true` (soft delete)
  - Full field access within specified locales

#### API Client Permissions
- **No Default Access**: Must be explicitly granted via permissions array
- **Read Permission**: Read-only access to specified collections/locales
- **Manage Permission**: Can create, update within specified locales only (never delete, even soft delete)
- **Collection Restrictions**: Managers and Clients collections are completely blocked
- **Locale Filtering**: Automatic filtering based on granted locale permissions

#### Access Control Implementation
- **Permission-Based Access Control**: Use `permissionBasedAccess()` function to implement access control
- **Dynamic Collection Discovery**: Automatically detects available collections from payload config
- **Field-Level Restrictions**: `createFieldAccess()` function for Translate managers
- **Locale-Aware Filtering**: `createLocaleFilter()` function for query-based access control
- **"All Locales" Support**: Special permission option that bypasses locale restrictions

#### Key Files
- `src/lib/accessControl.ts` - Core permission system with utility functions
- `src/collections/access/Managers.ts` - Updated with permissions array and admin toggle
- `src/collections/Clients.ts` - Updated with permissions array
- All content collections - Updated to use `permissionBasedAccess()`

## Development Workflow

1. **Schema Changes**: When modifying collections, always run `pnpm generate:types` to update TypeScript definitions
2. **Database**: Uses MongoDB with auto-generated collections based on Payload schema
3. **Admin Access**: Available at `/admin` route with user authentication
4. **API Access**: REST API at `/api/*` (GraphQL is disabled)
5. **Migrations**: Database migrations are stored in `src/migrations/` and can be run with `pnpm payload migrate`

### Database Migrations

The project uses PayloadCMS's built-in migration system for database schema changes:

- **Location**: `src/migrations/`
- **Running Migrations**: `pnpm payload migrate`
- **Rolling Back**: `pnpm payload migrate:down`
- **Creating New Migrations**: Create a new file in `src/migrations/` with format `[timestamp]_description.ts`

Example migrations:
- `20240115_migrate_users_to_managers.ts` - Migrates data from the old `users` collection to the new `managers` collection

## Testing Strategy

This project uses a comprehensive testing approach with complete test isolation:

### Test Types
- **Integration Tests**: Located in `tests/int/` directory using Vitest
  - Collection API tests for CRUD operations and relationships
  - Component logic tests for validation and data processing
  - MeditationFrameEditor tests for frame management and synchronization
- **E2E Tests**: Playwright tests for full application workflows
  - Admin panel user interface testing
  - MeditationFrameEditor modal and interaction testing

### Test Isolation (MongoDB Memory Server)
- **Complete Isolation**: Each test suite runs in its own in-memory MongoDB database
- **Automatic Cleanup**: Databases are automatically created and destroyed per test suite
- **No Data Conflicts**: Tests can run in parallel without data interference
- **Fast Execution**: In-memory database provides rapid test execution

### Test Environment Setup
- `tests/setup/globalSetup.ts` - Starts/stops MongoDB Memory Server
- `tests/config/test-payload.config.ts` - Test-specific Payload configuration
- `tests/utils/testHelpers.ts` - Utilities for creating isolated test environments

### Writing Isolated Tests
Use the `createTestEnvironment()` helper for complete test isolation:

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { User } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'

describe('My Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  it('performs operations with complete isolation', async () => {
    // Test operations here - completely isolated from other tests
  })
})
```

### Test Configuration
- Tests run sequentially (`maxConcurrency: 1`) to prevent resource conflicts
- Each test suite gets a unique database: `test_[timestamp]_[random]`
- Automatic database cleanup ensures no test data persists between runs

## Deployment

- **Payload Cloud**: Primary deployment target with automatic builds
- **Sentry Integration**: Error monitoring and performance tracking in production
- **Docker Support**: `Dockerfile` and `docker-compose.yml` for containerized development
- **Railway Deployment**: Alternative deployment option with `railway.toml` configuration
- **Environment Requirements**: MongoDB connection (`DATABASE_URI`) and Payload secret (`PAYLOAD_SECRET`)

## Project Structure Overview

```
src/
├── app/
│   ├── (frontend)/          # Public Next.js pages
│   ├── (payload)/           # Payload CMS admin & API
│   └── global-error.tsx     # Global error boundary
├── collections/             # Payload CMS collections
│   ├── access/
│   │   ├── Managers.ts     # Admin user authentication
│   │   └── Clients.ts      # API client management
│   ├── content/
│   │   ├── Pages.ts        # Rich text pages
│   │   ├── Meditations.ts  # Guided meditations
│   │   └── Music.ts        # Background music
│   ├── resources/
│   │   ├── Media.ts        # File uploads
│   │   ├── Narrators.ts    # Meditation guides
│   │   └── ExternalVideos.ts # External video content
│   ├── system/
│   │   ├── Frames.ts       # Meditation frames
│   │   └── FileAttachments.ts # File attachments
│   └── tags/               # Tag collections
│       ├── MediaTags.ts    # Tags for media files
│       ├── MeditationTags.ts # Tags for meditations
│       ├── MusicTags.ts    # Tags for music tracks
│       └── PageTags.ts     # Tags for pages
├── components/             # Reusable React components
├── globals/                # Global configurations
│   ├── WeMeditateWebSettings.ts # We Meditate web settings
│   └── index.ts            # Globals export
├── migrations/             # Database migrations
├── instrumentation*.ts     # Sentry monitoring setup
├── sentry*.config.ts       # Sentry configuration files
├── payload.config.ts       # Main Payload CMS config
└── payload-types.ts        # Auto-generated types

tests/
├── int/                    # Integration tests
├── e2e/                    # End-to-end tests
├── config/                 # Test configurations
├── setup/                  # Test environment setup
└── utils/                  # Test utilities & factories
```