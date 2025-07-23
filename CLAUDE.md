# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overall instructions
- Always ask me before editing, creating, or closing a GitHub issue or PR

## Project Overview

This is a **Next.js 15** application integrated with **Payload CMS 3.0**, providing a headless content management system. The project uses TypeScript, MongoDB, and is configured for both development and production deployment.

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

**MinIO S3-Compatible Storage (Optional)**
- `S3_ENDPOINT` - MinIO server endpoint (e.g., https://minio.yourdomain.com)
- `S3_ACCESS_KEY_ID` - MinIO access key
- `S3_SECRET_ACCESS_KEY` - MinIO secret key
- `S3_BUCKET_NAME` - Storage bucket name
- `S3_REGION` - Region (default: us-east-1)

**Note**: If MinIO variables are not configured, the system automatically falls back to local file storage.

## Code editing

After making changes to the codebase, always lint the code and fix all Typescript errors.

If necessary, you should also run `pnpm run generate:types`

## Architecture Overview

### Route Structure
- `src/app/(frontend)/` - Public-facing Next.js pages
- `src/app/(payload)/` - Payload CMS admin interface and API routes
- `src/app/(payload)/api/` - Auto-generated API endpoints including GraphQL

### Collections
- **Users** (`src/collections/Users.ts`) - Authentication-enabled admin users with email/password authentication using default Payload email templates
- **Media** (`src/collections/Media.ts`) - **Image-only collection** with automatic WEBP conversion, tags, credit info, and dimensions metadata
- **Narrators** (`src/collections/Narrators.ts`) - Meditation guide profiles with name, gender, and slug
- **Meditations** (`src/collections/Meditations.ts`) - Guided meditation content with audio files, tags, metadata, and frame relationships with timestamps
- **Tags** (`src/collections/Tags.ts`) - Categorization system for meditations and music with bidirectional relationships
- **Music** (`src/collections/Music.ts`) - Background music tracks with direct audio upload, tags, and metadata
- **Frames** (`src/collections/Frames.ts`) - Meditation pose files with mixed media upload (images/videos), tags filtering, and imageSet selection
- **MeditationFrames** (`src/collections/MeditationFrames.ts`) - Join table for meditation-frame relationships with timestamps (hidden from admin UI)

### Key Configuration Files
- `src/payload.config.ts` - Main Payload CMS configuration with collections, database, email, and plugins
- `next.config.mjs` - Next.js configuration with Payload integration
- `src/payload-types.ts` - Auto-generated TypeScript types (do not edit manually)
- `tsconfig.json` - TypeScript configuration with path aliases
- `eslint.config.mjs` - ESLint configuration for code quality
- `vitest.config.mts` - Vitest configuration for integration tests
- `playwright.config.ts` - Playwright configuration for E2E tests

### Email Configuration

The application includes environment-specific email configuration using `@payloadcms/email-nodemailer`:

#### Development Environment
- **Provider**: Ethereal Email (automatic test email service)
- **Features**: Captures all outbound emails for testing
- **Configuration**: No setup required - automatically configured when no transport options are provided
- **Testing**: Access mock emails at https://ethereal.email using generated credentials

#### Production Environment
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

### MeditationFrameEditor Architecture

The **Audio-Synchronized Frame Editor** is a sophisticated custom field component for the Meditations collection that provides audio-synchronized frame management with a rich admin interface.

#### Component Structure
- `src/components/admin/MeditationFrameEditor/`
  - `index.tsx` - Main component integrating with Payload's field system using `useField` hook
  - `types.ts` - TypeScript interfaces for FrameData and component props
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
- **Field Integration**: Uses `useField<FrameData[]>` hook for Payload compatibility
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

## Development Workflow

1. **Schema Changes**: When modifying collections, always run `pnpm generate:types` to update TypeScript definitions
2. **Database**: Uses MongoDB with auto-generated collections based on Payload schema
3. **Admin Access**: Available at `/admin` route with user authentication
4. **API Access**: REST API at `/api/*` and GraphQL at `/api/graphql`

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
│   ├── Users.ts            # Admin user authentication
│   └── Media.ts            # File upload management
├── components/             # Reusable React components
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