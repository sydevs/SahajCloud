# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Code Plugin

This project uses the **SY Developers Toolkit** plugin which provides slash commands, MCP servers, and development workflows.

### Plugin Features
- GitHub, Sentry, Puppeteer, and Serena MCP integrations
- Slash commands for code implementation, debugging, and reviews
- Automated hook setup via `/meta:setup-hooks`

### Available Commands
- `/code:implement-issue <number>` - Implement GitHub issues end-to-end
- `/code:draft-ticket [description]` - Draft detailed GitHub issues
- `/review:review-pr <number>` - Comprehensive PR reviews
- `/debug:fix-bug [description]` - Systematic bug fixing
- `/meta:setup-hooks` - Configure development hooks

For full documentation, see: https://github.com/sydevs/claude-plugins

## Overall instructions
- Always ask me before editing, creating, or closing a GitHub issue or PR
- When researching or fetching documentation, prefer specialized MCP tools over generic tools:
  - Use `mcp__plugin_sydevs-web_cloudflare-docs__search_cloudflare_documentation` for Cloudflare documentation (not WebFetch)
  - Use Sentry MCP tools for Sentry-related queries (not WebFetch)
  - Use GitHub MCP tools for GitHub operations (not gh CLI or WebFetch)
  - Only use WebFetch for websites without dedicated MCP integrations

## Project Overview

This is a **Next.js 15** application integrated with **Payload CMS 3.0**, providing a headless content management system. The project uses TypeScript, SQLite (Cloudflare D1), and is configured for both development and production deployment.

### PayloadCMS Documentation

**IMPORTANT**: The comprehensive PayloadCMS documentation for LLMs is available at:
**https://payloadcms.com/llms-full.txt**

Consult this documentation for detailed information about Payload CMS features, APIs, and best practices.

## Admin Access
There is a default user with the following credentials which can be used to access the admin panel in the dev server.
Username: contact@sydevelopers.com
Password: evk1VTH5dxz_nhg-mzk

The admin panel can be accessed at http://localhost:{PORT}/admin/login once the development server is running (replace {PORT} with the port you used when starting the dev server).

## Essential Commands

### Development

**IMPORTANT - Development Server Port:**
- **ALWAYS** start the dev server with an explicit PORT environment variable
- **ALWAYS** use a random port between 4000-4999 (e.g., PORT=4237, PORT=4891)
- **NEVER** use port 3000 (default port) as it may cause conflicts and result in accessing the wrong domain
- Example: `PORT=4237 pnpm dev` or `PORT=4891 pnpm devsafe`

Commands:
- `PORT={random 4000-4999} pnpm dev` - Start development server on a random port between 4000-4999
- `PORT={random 4000-4999} pnpm devsafe` - Clean development start (removes .next directory first)
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
- `PAYLOAD_SECRET` - Secret key for authentication
- **Note**: Database (SQLite/D1) is configured via `payload.config.ts` using Wrangler - no DATABASE_URI needed

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

**Live Preview URLs**
- `WEMEDITATE_WEB_URL` - Preview URL for We Meditate Web frontend (default: http://localhost:5173)
- `SAHAJATLAS_URL` - Preview URL for Sahaj Atlas frontend (default: http://localhost:5174)

### Wrangler Configuration

The application uses **Wrangler Environments** to manage different configurations for development and production.

**Configuration File**: `wrangler.toml` contains both environments:
- **Default (top-level)**: Production configuration with remote D1 database
- **`[env.dev]`**: Development environment with local SQLite database

**How Environment Selection Works**:
1. **Development** (`pnpm dev`):
   - Automatically uses `[env.dev]` environment from `wrangler.toml`
   - Environment variable `CLOUDFLARE_ENV=dev` (set in `.env` file) tells `getPlatformProxy()` to use dev config
   - Uses local `.wrangler` database (D1 with `database_id = "local"`)
   - Development URLs (localhost:3000, localhost:5173, etc.)

2. **Production** (deployment):
   - Uses default (top-level) configuration
   - Environment variable `CLOUDFLARE_ENV` is undefined (defaults to production)
   - Connects to remote D1 database when `remote = true`
   - Production URLs (cloud.sydevelopers.com, wemeditate.com, etc.)

**Key Files**:
- `.env` - Sets `CLOUDFLARE_ENV=dev` for local development
- `wrangler.toml` - Single source of truth for both environments
- `src/payload.config.ts` - Uses `process.env.CLOUDFLARE_ENV` to select environment in `getPlatformProxy()`

**See Also**: [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive deployment configuration and troubleshooting.

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
The system provides 6 block types that can be embedded within the rich text editor:

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

6. **CatalogBlock** (`CatalogBlock.ts`) - Content catalog component:
   - `items` (relationship, hasMany, min: 3, max: 6) - Related content items
   - Supports meditations and pages collections
   - Displays curated list of related content

#### Key Features
- **Lexical Editor Integration**: Full-featured editor with formatting options and embedded blocks
- **Character Count Validation**: TextBoxBlock text field enforces 250-character limit with HTML stripping
- **Gallery Block Validation**: Maximum 10 items per gallery with conditional relationship filtering
- **Localization Support**: All text content fields support 16 locales (en, es, de, it, fr, ru, ro, cs, uk, el, hy, pl, pt-br, fa, bg, tr)
- **Slug Generation**: Uses Better Fields plugin for automatic slug generation from title
- **Admin Integration**: Uses PublishStateCell component and slug generation utilities
- **Live Preview**: Real-time preview integration with We Meditate Web frontend (configurable via `WEMEDITATE_WEB_URL` environment variable)

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

### Project Visibility System

The CMS implements a project-based visibility system that dynamically shows/hides collections in the admin sidebar based on the manager's currently selected project. This allows multiple frontend applications to share a single CMS while maintaining clean, focused admin interfaces.

#### Project Values

The system supports four project contexts defined in `src/lib/projects.ts`:

- **wemeditate-web** - We Meditate website frontend
- **wemeditate-app** - We Meditate mobile application
- **sahaj-atlas** - Sahaj Atlas mapping application
- **all-content** - Special mode showing collections across all projects (content managers only)

#### Helper Functions

**Location**: `src/lib/projectVisibility.ts`

##### handleProjectVisibility()

Creates dynamic `admin.hidden` functions for collections and globals based on project visibility rules:

```typescript
handleProjectVisibility(
  allowedProjects: ProjectValue[],
  options?: { excludeAllContent?: boolean }
)
```

**Parameters**:
- `allowedProjects` - Array of project values where collection should be visible
- `options.excludeAllContent` - If true, collection is hidden even in "all-content" mode (default: false)

**Examples**:
```typescript
// Visible only in Web project
admin: {
  hidden: handleProjectVisibility(['wemeditate-web'])
}

// Visible in Web + App, but excluded from all-content mode
admin: {
  hidden: handleProjectVisibility(['wemeditate-web', 'wemeditate-app'], { excludeAllContent: true })
}

// Completely hidden (alternative to `hidden: true`)
admin: {
  hidden: handleProjectVisibility([])
}
```

##### adminOnlyVisibility

Shorthand for collections that should only be visible to admin users (bypasses project filtering):

```typescript
admin: {
  hidden: adminOnlyVisibility
}
```

#### Collection Visibility Rules

| Collection/Global | Visible In Projects | All-Content Mode | Notes |
|------------------|---------------------|------------------|-------|
| **Content** |
| Pages | web, app, atlas | ✅ Visible | Cross-project content |
| Meditations | web, app | ✅ Visible | Shared meditation content |
| Music | web, app | ✅ Visible | Background music tracks |
| Lessons | web, app | ✅ Visible | Path Steps content |
| **Resources** |
| Media | web, app, atlas | ✅ Visible | Shared media library |
| Authors | web, app, atlas | ✅ Visible | Article authors |
| Narrators | app | ❌ Hidden | App-specific, excluded from all-content |
| External Videos | web, app | ✅ Visible | Not used in Atlas |
| Frames | app | ✅ Visible | Meditation pose images/videos |
| **Tags** |
| Page Tags | web, app, atlas | ✅ Visible | |
| Meditation Tags | web, app | ✅ Visible | |
| Music Tags | web, app | ✅ Visible | |
| Media Tags | web, app, atlas | ✅ Visible | |
| **System** |
| Managers | all-content only | Admin-only | User management |
| Clients | all-content only | Admin-only | API client management |
| File Attachments | (none) | ❌ Hidden | Completely hidden, internal use |
| Forms | web, app, atlas | ✅ Visible | Form definitions |
| Form Submissions | web, all-content | ❌ Hidden | Web-specific submissions |
| Payload Jobs | all-content only | Admin-only | Background jobs |
| **Globals** |
| WeMeditate Web Settings | web only | ❌ Hidden | Web-specific configuration |

#### Special Behaviors

**All-Content Mode**:
- Special project value that shows collections across all projects
- Typically used by content managers who need cross-project visibility
- Collections with `excludeAllContent: true` remain hidden in this mode
- System collections (Managers, Clients, Payload Jobs) only visible in all-content mode

**ExcludeAllContent Option**:
- Used for project-exclusive content that shouldn't appear in all-content mode
- Examples: Narrators (app-only), WeMeditate Web Settings (web-only)
- Ensures strict project isolation for sensitive or project-specific collections

**Project Switching UX**:
- When managers switch projects via ProjectSelector component, they're automatically redirected to `/admin`
- Prevents viewing collections that become hidden after project switch
- Implemented in `src/components/admin/ProjectSelector.tsx` using `router.push('/admin')`

#### Implementation Details

**Collection Configuration**:
Collections use `handleProjectVisibility()` in their admin config:

```typescript
export const ExternalVideos: CollectionConfig = {
  slug: 'external-videos',
  access: roleBasedAccess('external-videos'),
  admin: {
    group: 'Resources',
    hidden: handleProjectVisibility(['wemeditate-web', 'wemeditate-app']),
  },
  // ... fields
}
```

**Global Configuration**:
Globals use the same helper function:

```typescript
export const WeMeditateWebSettings: GlobalConfig = {
  slug: 'we-meditate-web-settings',
  admin: {
    group: 'System',
    hidden: handleProjectVisibility(['wemeditate-web'], { excludeAllContent: true }),
  },
  // ... fields
}
```

**Custom Visibility Functions**:
For complex visibility rules, implement custom functions in `src/payload.config.ts`:

```typescript
// Form Submissions: visible in all-content OR wemeditate-web
formSubmissionOverrides: {
  admin: {
    hidden: ({ user }) => {
      const currentProject = user?.currentProject
      return currentProject !== 'all-content' && currentProject !== 'wemeditate-web'
    },
  },
}
```

#### Testing

The project visibility system is tested through:
- Admin UI navigation after project switching
- Collection visibility checks in different project modes
- All-content mode filtering behavior
- ExcludeAllContent option functionality

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

The application uses different email providers based on the environment:

#### Development Environment
- **Provider**: Ethereal Email (automatic test email service via `@payloadcms/email-nodemailer`)
- **Features**: Captures all outbound emails for testing without sending real emails
- **Configuration**: No setup required - automatically configured when no transport options are provided
- **Testing**: Access mock emails at https://ethereal.email using generated credentials shown in console
- **From Address**: dev@wemeditate.com

#### Production Environment
- **Provider**: Resend (transactional email API)
- **Implementation**: Custom adapter at [src/lib/email/resendAdapter.ts](src/lib/email/resendAdapter.ts)
- **Email Address**: contact@sydevelopers.com
- **Benefits**:
  - Free tier includes 3,000 emails/month
  - Better deliverability than SMTP
  - Simple HTTP API
  - Detailed analytics and logs

#### Test Environment
- **Provider**: Disabled (email configuration is disabled in test environment to prevent model conflicts)
- **Reason**: Prevents Payload model conflicts during parallel test execution
- **Testing**: Email logic can be tested separately without full Payload initialization

#### Environment Variables
```env
# Production - Resend API
RESEND_API_KEY=your-resend-api-key-here
```

#### Implementation Details
- **Adapter**: Custom Resend adapter implements PayloadCMS `EmailAdapter` interface
- **Error Handling**: Graceful fallback if API key is missing (logs error, returns error message ID)
- **Logging**: All email operations logged for debugging
- **Configuration**: Email adapter selection based on `NODE_ENV` in [src/payload.config.ts](src/payload.config.ts)

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

### Data Import & Migrations

The system includes import scripts for migrating content from external sources into Payload CMS.

**For detailed migration documentation, usage examples, and troubleshooting**, see [migration/README.md](migration/README.md).

**Available Import Scripts**:
- **Storyblok Import** - Migrates Path Steps from Storyblok CMS to Lessons collection
- **WeMeditate Import** - Imports authors, categories, and pages from Rails PostgreSQL database
- **Meditations Import** - Imports meditation content from legacy database

All scripts follow consistent patterns: resilient error handling, comprehensive dry-run mode, shared utilities, and detailed reporting.

### Sentry Integration Files
- `src/instrumentation.ts` - Server-side Sentry instrumentation
- `src/instrumentation-client.ts` - Client-side Sentry instrumentation  
- `src/sentry.server.config.ts` - Sentry server configuration
- `src/sentry.edge.config.ts` - Sentry edge runtime configuration
- `src/app/global-error.tsx` - Global error boundary with Sentry integration

### Component Architecture
- `src/components/AdminProvider.tsx` - Payload admin UI provider component (wraps with ProjectProvider)
- `src/components/ErrorBoundary.tsx` - React error boundary for error handling
- `src/app/(payload)/` - Payload CMS admin interface and API routes
- `src/app/(frontend)/` - Public-facing Next.js pages

### PayloadCMS CSS Variables

When building custom admin components, **always use PayloadCMS CSS variables** for consistent styling and theme compatibility.

#### Variable Reference
Complete variable definitions: https://github.com/payloadcms/payload/tree/main/packages/ui/src/scss

**Key Variables:**

**Spacing & Layout:**
- `--base` - Base spacing unit (calculated from `--base-px: 20`)
- `--gutter-h` - Horizontal gutter spacing
- `--base-body-size` - Base font size (13px)
- Usage: `calc(var(--base) * 0.8)` for proportional spacing

**Typography:**
- `--font-body` - System font stack
- `--font-serif` - Serif font stack
- `--font-mono` - Monospace font stack
- `--base-body-size` - Base font size (use with `calc(var(--base-body-size) * 1px)`)

**Colors & Theme:**
- `--theme-elevation-{0-1000}` - Elevation-based color scale (supports light/dark)
- `--theme-bg` - Background color
- `--theme-text` - Text color
- `--theme-input-bg` - Input background

**Borders & Radius:**
- `--style-radius-s` - Small border radius (6px in custom.scss)
- `--style-radius-m` - Medium border radius (8px in custom.scss)
- `--style-radius-l` - Large border radius (12px in custom.scss)

**Layout Dimensions:**
- `--nav-width` - Sidebar width (275px)
- `--app-header-height` - Header height (`calc(var(--base) * 2.8)`)
- `--doc-controls-height` - Control height (`calc(var(--base) * 2.8)`)

**Example Usage** ([src/components/admin/ProjectSelector.tsx](src/components/admin/ProjectSelector.tsx)):
```typescript
style={{
  paddingBottom: 'calc(var(--base) * 0.8)',       // Use --base for spacing
  marginBottom: 'calc(var(--base) * 0.4)',
  fontSize: 'calc(var(--base-body-size) * 1px)',  // Use --base-body-size for fonts
  color: 'var(--theme-elevation-600)',             // Use elevation colors
  borderBottom: '1px solid var(--theme-elevation-100)',
}}
```

**Benefits:**
- Automatic dark/light theme support
- Responsive scaling
- Consistent with PayloadCMS design system
- Respects user's custom theme overrides

### Custom Admin Components Architecture

PayloadCMS allows extensive customization of the admin UI through custom components. Understanding the server/client component patterns and performance best practices is essential for building efficient admin interfaces.

#### Server vs Client Components

**Server Components (Preferred for Data Fetching)**:
- **Definition**: React components without the `'use client'` directive
- **Execution**: Rendered on the server, HTML sent to client
- **Props**: Can receive non-serializable props (functions, class instances, etc.)
- **Data Access**: Direct access to Payload API via `getPayload()`
- **Use Cases**:
  - Dashboard views that display data
  - Components that need direct database/API access
  - Components receiving props from PayloadCMS (views, custom fields)

**Client Components (Only When Necessary)**:
- **Definition**: React components with `'use client'` directive at top
- **Execution**: Hydrated and rendered in the browser
- **Props**: Can only receive serializable props (JSON-compatible data)
- **Interactivity**: Required for useState, useEffect, event handlers
- **Use Cases**:
  - Interactive UI elements (dropdowns, modals, forms)
  - Components needing React hooks (useState, useEffect, useContext)
  - Components with event handlers (onClick, onChange, etc.)

#### Props Pattern for PayloadCMS Views

Custom view components (dashboard, account, etc.) receive props from PayloadCMS including the authenticated user object:

```typescript
// Type definition for view props
interface ViewProps {
  user?: {
    id?: string | number
    currentProject?: string
    email?: string
    [key: string]: any
  }
  [key: string]: any
}

// Server component accepting PayloadCMS props
export default function CustomView(props: ViewProps) {
  const currentProject = props.user?.currentProject || 'all-content'

  // Access user data directly from props
  // No need for useAuth() hook

  return <div>...</div>
}
```

**Important**: Do NOT use `useAuth()` or other client-side hooks in view components. PayloadCMS passes user data as props, making server components the correct pattern.

#### React Serialization Error

**Common Error**:
```
Error: Functions cannot be passed directly to Client Components unless
you explicitly expose it by marking it with "use server".
```

**Root Cause**: PayloadCMS passes objects with methods (like locale objects with `toString()` functions) to custom components. Client components cannot receive non-serializable props.

**Solution**: Use server components for custom views and components that receive PayloadCMS props. Only use client components for interactive UI elements that don't receive complex props from PayloadCMS.

**Example of Incorrect Pattern**:
```typescript
'use client' // ❌ Client component receiving PayloadCMS props

export default function Dashboard(props) {
  // Will fail if props contain non-serializable data
  return <div>...</div>
}
```

**Example of Correct Pattern**:
```typescript
// ✅ Server component receiving PayloadCMS props
export default function Dashboard(props) {
  // Can safely receive locale objects, user data with methods, etc.
  return <div>...</div>
}
```

#### Performance Optimization Patterns

**Direct Payload API Access (Recommended)**:
```typescript
import { getPayload } from 'payload'
import config from '@payload-config'

export default async function MetricsDashboard() {
  // Direct server-side access - most efficient
  const payload = await getPayload({ config })

  // Use count() for counting, not find()
  const [meditationsCount, lessonsCount] = await Promise.all([
    payload.count({ collection: 'meditations' }),
    payload.count({ collection: 'lessons' }),
  ])

  return <div>{meditationsCount.totalDocs} meditations</div>
}
```

**Benefits**:
- No HTTP overhead - direct database access
- Parallel queries with Promise.all()
- Type-safe with full TypeScript support
- No need for API endpoints
- Efficient counting with payload.count()

**HTTP Fetch Pattern (Avoid for Internal Data)**:
```typescript
'use client'

export default function MetricsDashboard() {
  const [data, setData] = useState(null)

  useEffect(() => {
    // ❌ Inefficient - requires API endpoint + HTTP round trip
    fetch('/api/dashboard-metrics')
      .then(res => res.json())
      .then(setData)
  }, [])

  return <div>{data?.count}</div>
}
```

**Disadvantages**:
- Requires creating separate API endpoint
- HTTP overhead and latency
- Additional error handling needed
- More complex data flow

**Best Practice**: Use server components with direct Payload API access for internal data fetching. Reserve HTTP fetch for external APIs only.

#### Import Map Generation

Custom admin components must be registered in PayloadCMS's import map to be available in the admin UI:

**Registration** (`payload.config.ts`):
```typescript
admin: {
  components: {
    beforeNavLinks: ['@/components/admin/ProjectSelector'],
    views: {
      dashboard: {
        Component: '@/components/admin/Dashboard',
      },
    },
  },
}
```

**Generate Import Map**:
```bash
pnpm generate:importmap
```

**Requirements**:
- Run after adding new custom components to `payload.config.ts`
- Use default exports (not named exports) for custom components
- Path aliases (@/) supported via tsconfig.json

**Generated File**: `.next/payload-component-map.json` (auto-generated, do not edit)

#### Component Organization

Custom admin components should follow this structure:

```
src/components/
├── admin/                      # Admin UI components
│   ├── Dashboard.tsx          # Custom views (server components)
│   ├── ProjectSelector.tsx    # Interactive widgets (client components)
│   ├── ProjectTheme.tsx       # Theme providers (client components)
│   └── dashboard/             # Dashboard sub-components
│       ├── FathomDashboard.tsx    # Client (needs state)
│       ├── MetricsDashboard.tsx   # Server (data fetching)
│       └── DefaultDashboard.tsx   # Client (interactive links)
└── branding/                  # Branding components
    ├── Logo.tsx              # Client (interactive)
    └── Icon.tsx              # Client (dynamic rendering)
```

**Naming Convention**:
- Server components: No special suffix needed
- Client components: Include `'use client'` directive at top
- Descriptive names indicating purpose (Dashboard, Selector, etc.)

### Project-Focused Navigation

The CMS implements project-focused navigation to manage content for four distinct projects (All Content, WeMeditate Web, WeMeditate App, Sahaj Atlas). The system dynamically filters sidebar collections based on the currently selected project.

#### Projects Configuration
- **File**: [src/lib/projects.ts](src/lib/projects.ts) - Centralized configuration (single source of truth)
- **Projects**:
  - `all-content` (All Content) - Access to all content across projects
  - `wemeditate-web` (WeMeditate Web) - Web application content
  - `wemeditate-app` (WeMeditate App) - Mobile application content
  - `sahaj-atlas` (Sahaj Atlas) - Atlas application content
- **Default Project**: `all-content`
- **Helper Functions**: `getProjectLabel()`, `getProjectOptions()`, `isValidProject()`

#### Manager Profile
- **Field**: `currentProject` in Managers collection ([src/collections/access/Managers.ts](src/collections/access/Managers.ts))
- **Type**: Select field with project options
- **Position**: Sidebar
- **Default**: DEFAULT_PROJECT ('all-content')
- **Purpose**: Stores user's currently selected project preference

#### ProjectSelector Component
- **File**: [src/components/admin/ProjectSelector.tsx](src/components/admin/ProjectSelector.tsx)
- **Location**: Rendered in `beforeNavLinks` (top of sidebar navigation)
- **Features**:
  - Dropdown showing all four projects
  - Updates manager profile on project change via API
  - Automatically reloads page to update sidebar visibility
  - Uses Payload's theme CSS variables for consistent styling
- **Context Integration**: Uses ProjectContext for reactive state management

#### ProjectContext Provider
- **File**: `src/contexts/ProjectContext.tsx`
- **Purpose**: React context for sharing project state across admin components
- **Provider**: Wrapped in AdminProvider component
- **Hook**: `useProject()` - Access current project and setter
- **Auto-sync**: Syncs with user profile changes via `useAuth` hook

#### Collection Visibility Filtering
Collections use `admin.hidden` functions to control visibility based on `user.currentProject`:

**Collection Visibility Map:**
| Collection | All Content | WeMeditate Web | WeMeditate App | Sahaj Atlas |
|------------|-------------|----------------|----------------|-------------|
| **Content** |||||
| Pages | ✓ | ✓ | ✗ | ✗ |
| Meditations | ✓ | ✓ | ✓ | ✗ |
| Music | ✓ | ✓ | ✓ | ✗ |
| Lessons | ✓ | ✗ | ✓ | ✗ |
| **Resources** |||||
| Media | ✓ | ✓ | ✓ | ✓ |
| ExternalVideos | ✓ | ✓ | ✓ | ✓ |
| Frames | ✓ | ✗ | ✓ | ✗ |
| Narrators | ✓ | ✓ | ✓ | ✗ |
| Authors | ✓ | ✓ | ✗ | ✗ |
| FileAttachments | ✓ | ✓ | ✓ | ✓ |
| **Tags** |||||
| PageTags | ✓ | ✓ | ✗ | ✗ |
| MeditationTags | ✓ | ✓ | ✓ | ✗ |
| MusicTags | ✓ | ✓ | ✓ | ✗ |
| MediaTags | ✓ | ✓ | ✓ | ✓ |
| **System/Access** |||||
| All Others | ✓ | ✓ | ✓ | ✓ |

**Example Implementation** ([src/collections/content/Pages.ts](src/collections/content/Pages.ts)):
```typescript
admin: {
  hidden: ({ user }) => {
    const currentProject = user?.currentProject
    return currentProject !== 'wemeditate-web' && currentProject !== 'all-content'
  },
}
```

#### Technical Notes
- **Server-Side Evaluation**: `admin.hidden` functions run server-side and access `user.currentProject` directly (no React context needed)
- **Page Reload Required**: Changing projects triggers `window.location.reload()` to re-evaluate all `admin.hidden` functions
- **Import Map**: ProjectSelector requires `pnpm generate:importmap` to be included in Payload's component system
- **Default Export**: Custom admin components must use default export (not named export)

#### Project-Aware Dashboard System

The CMS features a dynamic dashboard that adapts based on the user's currently selected project, providing project-specific views and analytics.

**Implementation**: The custom Dashboard view component is registered in `payload.config.ts`:

```typescript
admin: {
  components: {
    views: {
      dashboard: {
        Component: '@/components/admin/Dashboard',
      },
    },
  },
}
```

**Dashboard Component** ([src/components/admin/Dashboard.tsx](src/components/admin/Dashboard.tsx)):
- **Type**: Server Component (no 'use client' directive)
- **Props**: Receives `DashboardProps` from PayloadCMS including `user` object
- **Routing**: Switches dashboard view based on `user.currentProject`

**Project-Specific Dashboards**:

1. **WeMeditate Web** → [FathomDashboard](src/components/admin/dashboard/FathomDashboard.tsx)
   - Embeds Fathom Analytics (siteId: `pfpcdamq`)
   - Full-screen iframe with error handling
   - Client component (needs state for error handling)

2. **Sahaj Atlas** → [FathomDashboard](src/components/admin/dashboard/FathomDashboard.tsx)
   - Embeds Fathom Analytics (siteId: `qqwctiuv`)
   - Same component, different site configuration

3. **WeMeditate App** → [MetricsDashboard](src/components/admin/dashboard/MetricsDashboard.tsx)
   - **Server component** with direct Payload API access
   - Displays collection counts (meditations, lessons, music)
   - Uses `payload.count()` for efficient counting
   - Parallel queries with `Promise.all()`

4. **All Content** → [DefaultDashboard](src/components/admin/dashboard/DefaultDashboard.tsx)
   - Quick links to key collections
   - General content management interface

**Security Note**: CSP headers in `next.config.mjs` whitelist `https://app.usefathom.com` for Fathom Analytics iframes

### Project-Based Branding System

The application features a dynamic project-based branding system that adapts the admin panel appearance based on the currently selected project.

#### Supported Projects
- **All Content** (`all-content`) - Default PayloadCMS theme with Sahaj Cloud lotus logo
- **WeMeditate Web** (`wemeditate-web`) - Coral/salmon theme with We Meditate web logo
- **WeMeditate App** (`wemeditate-app`) - Teal theme with We Meditate app logo
- **Sahaj Atlas** (`sahaj-atlas`) - Royal blue/indigo theme with Sahaj Atlas logo

#### Admin Panel Branding Components

**Icon Component** ([src/components/branding/Icon.tsx](src/components/branding/Icon.tsx)):
- Dynamic project-specific icon rendering
- Uses Next.js Image component with project-based logo mapping
- Accepts `size` (default: 30px), `alt`, and `style` props
- Logo sources from `/public/images/`:
  - `sahaj-cloud.svg` (all-content)
  - `wemeditate-web.svg` (wemeditate-web)
  - `wemeditate-app.svg` (wemeditate-app)
  - `sahaj-atlas.webp` (sahaj-atlas)

**Logo Component** ([src/components/branding/Logo.tsx](src/components/branding/Logo.tsx)):
- Stacked vertical layout for login/signup pages
- Icon centered above project label
- Size: 64px with bold text using `--theme-elevation-800` color variable
- Registered in `payload.config.ts` as `graphics.Logo`

**InlineLogo Component** ([src/components/branding/InlineLogo.tsx](src/components/branding/InlineLogo.tsx)):
- Horizontal layout for admin navigation
- Icon beside project label with 25% border radius
- Size: 48px with bold text using `--theme-elevation-800` color variable
- Registered in `payload.config.ts` as `graphics.Icon`

**ProjectTheme Component** ([src/components/admin/ProjectTheme.tsx](src/components/admin/ProjectTheme.tsx)):
- Dynamically applies project-specific theme colors via CSS variables
- Injects `--theme-elevation-*` variables (0-1000) for light and dark modes
- Automatically updates on project switch or theme mode change
- Uses MutationObserver to detect dark/light mode toggles
- Theme definitions embedded in component with coral (wemeditate-web), teal (wemeditate-app), and royal blue (sahaj-atlas) palettes

**Configuration**:
- Branding components registered in [src/payload.config.ts](src/payload.config.ts) under `admin.components.graphics`
- Logo images stored in `/public/images/` for Cloudflare CDN optimization
- ProjectTheme mounted in AdminProvider for global theme application

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

### Role-Based Access Control System

The CMS implements a role-based permission system with predefined roles for Managers and API Clients. Managers can optionally have a global admin flag that bypasses all permissions.

#### Manager Roles

**Admin Boolean Field**:
- **Purpose**: Global administrative privilege that bypasses all role-based restrictions
- **Behavior**: When `admin: true`, the roles, customResourceAccess, and permissions fields are hidden in the admin UI
- **Scope**: Admin status applies to all locales (not locale-specific)

**Available Manager Roles** (3 roles):
1. **meditations-editor**: Can create and edit meditations, upload related media and files
2. **path-editor**: Can edit lessons and external videos, upload related media and files
3. **translator**: Can edit localized fields in pages and music (read-only for non-localized fields)

**Manager Role Characteristics**:
- **Localized**: Roles can be assigned per-locale (e.g., translator for French, meditations-editor for English)
- **Multiple Roles**: Managers can have multiple roles per locale
- **Read Access**: All managers have implicit read access to non-restricted collections
- **Collection Visibility**: Collections only appear in admin UI if the manager has appropriate role permissions
- **Custom Resource Access**: Managers can be granted update access to specific documents (e.g., individual pages)

#### API Client Roles

**Available Client Roles** (3 roles):
1. **we-meditate-web**: Access for We Meditate web frontend application
2. **we-meditate-app**: Access for We Meditate mobile application
3. **sahaj-atlas**: Access for Sahaj Atlas application

**Client Role Characteristics**:
- **Not Localized**: Client roles apply to all locales
- **Read-Only by Default**: Clients primarily have read access to content
- **Form Submissions**: Clients can create form submissions
- **No Delete Access**: Clients never get delete access, even with manage-level permissions
- **Collection Restrictions**: Managers and Clients collections are completely blocked

#### Permission System Architecture

**Permissions Data Structure**:
Permissions use a simplified map structure:
```typescript
// Role permission definition
permissions: {
  meditations: ['read', 'create', 'update'],
  media: ['read', 'create']
}

// Merged permissions (same structure)
type MergedPermissions = {
  [collection: string]: PermissionLevel[]
}
```

**Field Factories**:
- **ManagerPermissionsField()**: Returns 4 fields for Managers collection:
  1. `admin` (boolean) - Global admin flag
  2. `roles` (select with hasMany, localized) - Manager role selection with PermissionsTable afterInput (hidden if admin)
  3. `customResourceAccess` (relationship) - Document-level permissions (hidden if admin)
  4. `permissions` (virtual json, hidden) - **IMPORTANT**: Automatic permission caching via afterRead hook

- **ClientPermissionsField()**: Returns 2 fields for Clients collection:
  1. `roles` (select with hasMany) - Client role selection with PermissionsTable afterInput
  2. `permissions` (virtual json, hidden) - **IMPORTANT**: Automatic permission caching via afterRead hook

**Virtual Permissions Field (Automatic Caching)**:
- When managers/clients are fetched from database, the afterRead hook populates the `permissions` field
- The access control system checks this field first and uses it if present
- Only computes permissions on-demand if the cached field is missing
- Provides efficient permission caching without requiring separate cache management
- For managers: Locale-aware computation based on current request locale

**PermissionsTable Component**:
- Displays computed permissions in real-time as roles are selected
- Shown as `afterInput` component on the `roles` field
- Automatically computes permissions using `mergeRolePermissions()`
- Color-coded operation pills (read: gray, create: blue, update: orange, delete: red)

**Access Control Functions**:
- **roleBasedAccess()**: Main access control function used by all collections
- **hasPermission()**: Core permission checking - checks user permissions for a collection/operation
- **mergeRolePermissions(roles: string[], collectionSlug: 'clients' | 'managers')**: Merge permissions from multiple roles into unified permissions object
- **createFieldAccess()**: Field-level access control for translate permission
- **createLocaleFilter()**: Query filtering based on locale permissions
- **isAPIClient()**: Type guard to check if user is an API client
- **extractRoleSlugs()**: Internal helper to extract role slugs from localized/non-localized role structures

**Permission Checking Flow**:
1. Check if user is active → Block if inactive
2. Check if user is a manager with `admin: true` → Grant full access
3. Check if collection is restricted (managers, clients, payload-jobs) → Block for non-admins
4. **Check/compute cached permissions**:
   - If `user.permissions` exists → Use cached permissions (populated by virtual field's afterRead hook)
   - If missing → Compute on-demand using `mergeRolePermissions()` and cache on user object
5. Check document-level permissions via `customResourceAccess` (managers only, update operations)
6. Check collection-specific permissions from merged permissions object
7. Check if operation is delete and user is a client → Block (clients can't delete)
8. Apply implicit read access for managers (any manager with roles can read non-restricted collections)
9. Apply locale filtering based on user's role permissions

**Important Behaviors & Limitations**:

**Implicit Read Access:**
- Managers with ANY role get read access to ALL non-restricted collections
- Example: A "translator" (pages/music only) can still read meditations, frames, narrators, etc.
- Rationale: Improves UX by allowing content discovery without explicit permissions
- Restricted collections (managers, clients, payload-jobs) are always blocked

**Localized Manager Roles:**
- Manager roles are per-locale - different roles can be assigned for different languages
- Access checks use the current request locale (`req.locale`) only
- **Limitation**: When accessing content with a different locale, permissions are computed for that locale's roles
- **Example**: Manager has "meditations-editor" in English but "translator" in Czech:
  - Viewing meditation in English admin UI → Can edit
  - Viewing same meditation in Czech admin UI → Cannot edit (only translate permission)
- **Workaround**: Assign same roles to all locales if consistent permissions needed

**Client Roles (Not Localized):**
- API client roles apply to ALL locales uniformly
- Clients get same permissions regardless of `?locale=` parameter
- **Rationale**: API clients typically need consistent cross-locale access

**customResourceAccess (Document-Level Permissions):**
- Allows managers to update specific documents without collection-level update permission
- Only applies to `pages` collection (configurable via relationTo)
- Only grants update permission, not create or delete
- **Example**: Translator can update specific pages assigned to them via customResourceAccess
- Checked during update operations before collection-level permissions

**Admin-Only Collections:**
- `forms` and `authors` collections are managed exclusively by admins
- No manager roles have create/update permissions for these collections
- Web clients have read-only access to `forms` and `authors`

#### Type Organization

The RBAC system uses a well-organized type structure with types separated into dedicated files in the `src/types/` directory:

**Type Files Structure**:
```
src/types/
├── roles.ts        # Role type definitions
├── users.ts        # User type definitions
└── permissions.ts  # Permission structure types
```

**[src/types/roles.ts](src/types/roles.ts)** - Role type definitions:
- `ManagerRole` - Manager role enum type ('meditations-editor' | 'path-editor' | 'translator')
- `ClientRole` - Client role enum type ('we-meditate-web' | 'we-meditate-app' | 'sahaj-atlas')
- `PermissionLevel` - Permission operations type (Operation | 'translate')
- `BaseRoleConfig` - Base role configuration interface
- `ManagerRoleConfig` - Manager role configuration (extends BaseRoleConfig with project field)
- `ClientRoleConfig` - Client role configuration (alias for BaseRoleConfig)

**[src/types/users.ts](src/types/users.ts)** - User type definitions:
- `TypedManager` - Extended manager user type with roles, permissions, and customResourceAccess
- `TypedClient` - Extended client user type with roles and permissions
- Both types use `MergedPermissions` for the permissions field

**[src/types/permissions.ts](src/types/permissions.ts)** - Permission structure types:
- `MergedPermissions` - Cached permissions structure returned by virtual permissions field
  - Contains collection-level permissions as `PermissionLevel[]`
  - Contains `projects` array for managers (cross-locale project access)
- `CollectionPermissions` - Helper type for type-safe collection permission access

**Type Usage**:
- Implementation files (`PermissionsField.ts`, `accessControl.ts`) import types from `src/types/`
- Role DATA definitions (MANAGER_ROLES, CLIENT_ROLES) remain in `PermissionsField.ts`
- Type files have no dependencies on implementation files (prevents circular dependencies)

**Benefits**:
- Clear separation of types from implementation code
- Improved type safety with strongly-typed permission structures
- Better code organization and maintainability
- Easier to locate and update type definitions
- No circular dependencies between type files and implementation files

#### Key Files

**Type Definitions**:
- [src/types/roles.ts](src/types/roles.ts) - Role type definitions (ManagerRole, ClientRole, PermissionLevel, role configs)
- [src/types/users.ts](src/types/users.ts) - User type definitions (TypedManager, TypedClient)
- [src/types/permissions.ts](src/types/permissions.ts) - Permission structure types (MergedPermissions, CollectionPermissions)

**Implementation**:
- [src/fields/PermissionsField.ts](src/fields/PermissionsField.ts) - Role data definitions (MANAGER_ROLES, CLIENT_ROLES), field factories (ManagerPermissionsField, ClientPermissionsField), and mergeRolePermissions utility
- [src/lib/accessControl.ts](src/lib/accessControl.ts) - Core permission checking (hasPermission, roleBasedAccess, createFieldAccess, createLocaleFilter)
- [src/components/admin/PermissionsTable.tsx](src/components/admin/PermissionsTable.tsx) - Real-time permissions display component shown as afterInput on roles field

**Collections**:
- [src/collections/access/Managers.ts](src/collections/access/Managers.ts) - Manager collection using ManagerPermissionsField()
- [src/collections/access/Clients.ts](src/collections/access/Clients.ts) - Client collection using ClientPermissionsField()
- All content collections - Use `roleBasedAccess()` for access control

#### Testing
- [tests/int/role-based-access.int.spec.ts](tests/int/role-based-access.int.spec.ts) - Comprehensive RBAC integration tests
- [tests/int/managers.int.spec.ts](tests/int/managers.int.spec.ts) - Manager collection tests with admin boolean
- [tests/utils/testData.ts](tests/utils/testData.ts) - Test helpers for creating managers and clients with roles

## Development Workflow

1. **Schema Changes**: When modifying collections, always run `pnpm generate:types` to update TypeScript definitions
2. **Database**: Uses SQLite (Cloudflare D1) with auto-generated collections based on Payload schema
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

### Test Isolation (In-Memory SQLite)
- **Complete Isolation**: Each test suite runs in its own in-memory SQLite database
- **Automatic Cleanup**: Databases are automatically created and destroyed per test suite
- **No Data Conflicts**: Tests can run in parallel without data interference
- **Fast Execution**: In-memory database provides rapid test execution
- **No external dependencies**: No database server required (using better-sqlite3)

### Test Environment Setup
- `tests/setup/globalSetup.ts` - Test environment setup
- `tests/config/test-payload.config.ts` - Test-specific Payload configuration with in-memory SQLite
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
- Each test suite gets a unique in-memory SQLite database
- Automatic database cleanup ensures no test data persists between runs

## Deployment

The application is deployed to **Cloudflare Workers** with serverless edge infrastructure.

**For comprehensive deployment documentation**, see [DEPLOYMENT.md](DEPLOYMENT.md).

**Quick Reference**:
- **Production URL**: https://cloud.sydevelopers.com
- **Platform**: Cloudflare Workers (paid plan)
- **Database**: Cloudflare D1 (serverless SQLite)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Email**: Resend API (production)
- **Monitoring**: Sentry (server-side only)

**Essential Commands**:
```bash
# Deploy to production (migrations + app)
pnpm run deploy:prod

# Deploy database migrations only
pnpm run deploy:database

# Deploy application only
pnpm run deploy:app

# Monitor production logs
wrangler tail sahajcloud --format pretty
```

**Critical Configuration**:
- `wrangler.toml` uses Wrangler environments pattern with `[env.dev]` section for development
- Production migrations require `remote = true` in D1 binding (see DEPLOYMENT.md)
- Set secrets via `wrangler secret put PAYLOAD_SECRET`, `SENTRY_DSN`, `RESEND_API_KEY`
- Environment-specific variables configured in `wrangler.toml` via `[vars]` and `[env.dev.vars]` sections

**Image Processing Note**:
Sharp library removed for Cloudflare Workers compatibility (native binaries not supported). Images uploaded in original format without automatic optimization.

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

## Architectural Decisions

### ⚠️ DEPRECATED: FFmpeg/fluent-ffmpeg

**Status**: Deprecated - Scheduled for removal
**Current Decision**: Continue using `fluent-ffmpeg` temporarily despite deprecation
**Reviewed**: 2025-10-28

#### Overview
- **Purpose**: Video metadata extraction and thumbnail generation
- **Package**: `fluent-ffmpeg` (deprecated but functional)
- **Usage**: `src/lib/fileUtils.ts` - ffprobe metadata, video thumbnails

#### Why Still Using
- ✅ Stable, feature-complete, works reliably
- ✅ Underlying `ffmpeg-static` binary still maintained
- ✅ Migration effort outweighs current benefits
- ⚠️ Package marked deprecated, no security issues

#### Migration Plan
When ready to migrate, use `@ffprobe-installer` + `@ffmpeg-installer` with child_process for direct binary access. Requires comprehensive testing across platforms and video formats.

**Monitoring**: Monthly `pnpm audit` checks, migrate immediately if security vulnerabilities found.