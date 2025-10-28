# Code Quality Improvements - Implementation Plan

This document outlines the implementation plan for addressing 16 selected issues from the comprehensive code review. Issues are organized by priority and include detailed investigation findings and implementation steps.

## Table of Contents

1. [High Priority Issues](#high-priority-issues)
2. [Medium Priority Issues](#medium-priority-issues)
3. [Low Priority Issues](#low-priority-issues)
4. [Implementation Order](#implementation-order)
5. [Estimated Timeline](#estimated-timeline)

---

## High Priority Issues

### Issue #1: Email Verification Disabled in Production

**Priority:** High
**Effort:** 1-2 days
**Files Affected:**
- [src/collections/access/Managers.ts:8](src/collections/access/Managers.ts#L8)

**Current State:**
```typescript
auth: {
  verify: false, // TODO: Re-enable this but ensure there are proper warnings.
  maxLoginAttempts: 5,
  lockTime: 600 * 1000, // 10 minutes
}
```

**Investigation:**
- Email verification is disabled, allowing unverified email addresses
- Email configuration exists in payload.config.ts but is currently commented out
- No email templates are configured
- Risk: Unauthorized users could create accounts with fake emails

**Implementation Steps:**

1. **Enable Email Adapter** (30 min)
   - Uncomment email configuration in `src/payload.config.ts`
   - Test Ethereal email in development
   - Configure Gmail SMTP for production

2. **Enable Verification** (15 min)
   ```typescript
   auth: {
     verify: {
       generateEmailHTML: ({ token, user }) => {
         return `
           <h1>Verify Your Email</h1>
           <p>Hello ${user.name},</p>
           <p>Please verify your email address by clicking the link below:</p>
           <a href="${process.env.NEXT_PUBLIC_SERVER_URL}/admin/verify/${token}">
             Verify Email
           </a>
         `
       },
       generateEmailSubject: () => 'Verify Your Email Address',
     },
     maxLoginAttempts: 5,
     lockTime: 600 * 1000,
   }
   ```

3. **Add Warning Notices** (30 min)
   - Add field description warning that email verification is enabled
   - Update admin UI to show verification status in Manager list
   - Add "Resend Verification" button for unverified users

4. **Testing** (1 hour)
   - Test email sending in development (Ethereal)
   - Test verification flow
   - Test resend functionality
   - Update integration tests for email verification

**Success Criteria:**
- ✅ Email verification enabled
- ✅ Verification emails sent successfully
- ✅ Clear warnings in admin UI
- ✅ Tests pass with email verification

**Rollback Plan:**
- Keep `verify: false` option in environment variable
- Add `EMAIL_VERIFICATION_ENABLED` env var for gradual rollout

---

### Issue #2: Console Logging in Production Code ✅ COMPLETED

**Priority:** High
**Effort:** 2-3 days (Actual: 2 hours)
**Status:** ✅ **COMPLETED** - 2025-01-28
**Files Affected:**
- [src/lib/fieldUtils.ts:163-166](src/lib/fieldUtils.ts#L163-L166)
- [src/hooks/clientHooks.ts:38](src/hooks/clientHooks.ts#L38)
- [src/components/admin/MeditationFrameEditor/index.tsx:59,66](src/components/admin/MeditationFrameEditor/index.tsx#L59)
- [src/components/admin/PublishStateCell.tsx:42](src/components/admin/PublishStateCell.tsx#L42)
- [src/fields/FileAttachmentField.ts:132](src/fields/FileAttachmentField.ts#L132)
- [src/components/admin/MeditationFrameEditor/AudioPlayer.tsx:117,180](src/components/admin/MeditationFrameEditor/AudioPlayer.tsx#L117)
- [src/components/ErrorBoundary.tsx:40](src/components/ErrorBoundary.tsx#L40)
- [src/app/media/[...path]/route.ts:81](src/app/media/[...path]/route.ts#L81)

**Current State:**
- 10+ instances of `console.log`, `console.warn`, `console.error`
- Sentry is already integrated but not consistently used
- No centralized logging utility

**Investigation:**
- Sentry is configured and enabled only in production (good!)
- Located in `src/sentry.server.config.ts` with `enabled: process.env.NODE_ENV === 'production'`
- No custom logger utility exists

**Implementation Steps:**

1. **Create Logger Utility** (2 hours)
   - Create `src/lib/logger.ts`:
   ```typescript
   import * as Sentry from '@sentry/nextjs'

   type LogLevel = 'debug' | 'info' | 'warn' | 'error'
   type LogContext = Record<string, unknown>

   const isDevelopment = process.env.NODE_ENV === 'development'
   const isTest = process.env.NODE_ENV === 'test'

   class Logger {
     private context?: LogContext

     constructor(context?: LogContext) {
       this.context = context
     }

     debug(message: string, extra?: LogContext) {
       if (isDevelopment) {
         console.log(`[DEBUG] ${message}`, { ...this.context, ...extra })
       }
     }

     info(message: string, extra?: LogContext) {
       if (isDevelopment || isTest) {
         console.info(`[INFO] ${message}`, { ...this.context, ...extra })
       }

       Sentry.captureMessage(message, {
         level: 'info',
         contexts: { ...this.context, ...extra },
       })
     }

     warn(message: string, extra?: LogContext) {
       if (isDevelopment || isTest) {
         console.warn(`[WARN] ${message}`, { ...this.context, ...extra })
       }

       Sentry.captureMessage(message, {
         level: 'warning',
         contexts: { ...this.context, ...extra },
       })
     }

     error(message: string, error?: Error, extra?: LogContext) {
       if (isDevelopment || isTest) {
         console.error(`[ERROR] ${message}`, error, { ...this.context, ...extra })
       }

       if (error) {
         Sentry.captureException(error, {
           contexts: { message, ...this.context, ...extra },
         })
       } else {
         Sentry.captureMessage(message, {
           level: 'error',
           contexts: { ...this.context, ...extra },
         })
       }
     }

     withContext(context: LogContext): Logger {
       return new Logger({ ...this.context, ...context })
     }
   }

   export const logger = new Logger()
   export const createLogger = (context: LogContext) => new Logger(context)
   ```

2. **Replace Console Statements** (3-4 hours)
   - Replace all `console.warn` with `logger.warn()`
   - Replace all `console.error` with `logger.error()`
   - Replace all `console.log` with `logger.debug()` or remove if not needed
   - Files to update:
     - `src/lib/fieldUtils.ts`
     - `src/hooks/clientHooks.ts`
     - `src/components/admin/MeditationFrameEditor/index.tsx`
     - `src/components/admin/PublishStateCell.tsx` (remove debug log)
     - `src/fields/FileAttachmentField.ts`
     - `src/components/admin/MeditationFrameEditor/AudioPlayer.tsx`
     - `src/components/ErrorBoundary.tsx`
     - `src/app/media/[...path]/route.ts`

3. **Update ESLint Rules** (15 min)
   ```typescript
   rules: {
     'no-console': ['warn', { allow: [] }], // Disallow all console methods
   }
   ```

4. **Testing** (1 hour)
   - Verify logs appear in development
   - Verify Sentry receives events in production
   - Update tests that check for console output

**Success Criteria:**
- ✅ All console.* calls replaced with logger
- ✅ Logs visible in development
- ✅ Sentry receives events in production
- ✅ ESLint warns on console usage

---

### Issue #3: Deprecated fluent-ffmpeg Dependency

**Priority:** High
**Effort:** 2-3 days
**Files Affected:**
- [package.json:40](package.json#L40)
- [src/lib/fileUtils.ts:3,36,75](src/lib/fileUtils.ts#L3)

**Current State:**
```json
"fluent-ffmpeg": "^2.1.3",  // Marked as deprecated
"ffmpeg-static": "^5.2.0"
```

**Investigation:**
- `fluent-ffmpeg` is deprecated but still functional
- Used for:
  1. Extracting media metadata (audio/video duration, dimensions)
  2. Generating video thumbnails
- `ffmpeg-static` provides FFmpeg binary (still maintained)
- Two use cases in codebase:
  - `getMediaMetadata()` - Uses ffprobe to extract duration/dimensions
  - `extractVideoThumbnail()` - Generates thumbnail at 0.1s timestamp

**Implementation Steps:**

**Option A: Use @ffmpeg/ffmpeg (WebAssembly) - NOT RECOMMENDED**
- Pros: Pure JS, no native binaries
- Cons: Large bundle size, slower, browser-only, memory intensive

**Option B: Use @ffprobe-installer/ffprobe + child_process (RECOMMENDED)**
- Pros: Lightweight, maintained, direct ffprobe access
- Cons: Need to handle child process management

**Option C: Keep fluent-ffmpeg + Document Decision**
- Pros: Works perfectly, no changes needed
- Cons: Deprecated, no updates

**Recommended: Option B**

1. **Replace Dependencies** (1 hour)
   ```bash
   pnpm remove fluent-ffmpeg @types/fluent-ffmpeg
   pnpm add @ffprobe-installer/ffprobe @ffmpeg-installer/ffmpeg
   ```

2. **Update fileUtils.ts** (3 hours)
   ```typescript
   import ffprobePath from '@ffprobe-installer/ffprobe'
   import ffmpegPath from '@ffmpeg-installer/ffmpeg'
   import { promisify } from 'util'
   import { exec } from 'child_process'

   const execAsync = promisify(exec)

   const getMediaMetadata = async (fileBuffer: Buffer): Promise<FileMetadata> => {
     const tmpFile = tmp.fileSync()
     fs.writeFileSync(tmpFile.fd, fileBuffer)

     try {
       const { stdout } = await execAsync(
         `${ffprobePath.path} -v quiet -print_format json -show_format -show_streams "${tmpFile.name}"`
       )

       const metadata = JSON.parse(stdout)
       const duration = parseFloat(metadata.format?.duration || '0')
       const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video')

       tmpFile.removeCallback()

       return {
         duration,
         width: videoStream?.width,
         height: videoStream?.height,
       }
     } catch (error) {
       tmpFile.removeCallback()
       throw error
     }
   }

   export const extractVideoThumbnail = async (videoBuffer: Buffer): Promise<Buffer> => {
     const inputFile = tmp.fileSync({ postfix: '.mp4' })
     const outputFile = tmp.fileSync({ postfix: '.png' })

     fs.writeFileSync(inputFile.fd, videoBuffer)

     try {
       await execAsync(
         `${ffmpegPath.path} -i "${inputFile.name}" -ss 0.1 -vframes 1 -vf scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2 "${outputFile.name}"`
       )

       const thumbnailBuffer = await sharp(outputFile.name)
         .webp({ quality: 95 })
         .toBuffer()

       inputFile.removeCallback()
       outputFile.removeCallback()

       return thumbnailBuffer
     } catch (error) {
       inputFile.removeCallback()
       outputFile.removeCallback()
       throw error
     }
   }
   ```

3. **Testing** (2 hours)
   - Test audio metadata extraction
   - Test video metadata extraction
   - Test video thumbnail generation
   - Update integration tests for video thumbnails
   - Test on different OS (macOS, Linux)

4. **Documentation** (30 min)
   - Update CLAUDE.md with new dependencies
   - Document FFmpeg/FFprobe usage

**Success Criteria:**
- ✅ fluent-ffmpeg removed
- ✅ Metadata extraction works
- ✅ Thumbnail generation works
- ✅ All tests pass

**Alternative: If migration fails, document the decision:**
```markdown
## FFmpeg Decision

We continue using `fluent-ffmpeg` despite deprecation because:
1. It works reliably with our use cases
2. Migration to alternatives (child_process) introduces complexity
3. The package is feature-complete and stable
4. ffmpeg-static provides the underlying FFmpeg binary

Reviewed: 2025-01-28
Next Review: 2026-01-28
```

---

## Medium Priority Issues

### Issue #4: Excessive `any` Types in Collections

**Priority:** Medium
**Effort:** 1-2 days
**Files Affected:**
- [src/collections/content/Meditations.ts:62,126,146](src/collections/content/Meditations.ts#L62)
- [src/components/admin/ThumbnailCell.tsx:35,167](src/components/admin/ThumbnailCell.tsx#L35)
- [src/fields/FileAttachmentField.ts:127,144,177](src/fields/FileAttachmentField.ts#L127)
- [src/components/admin/MeditationFrameEditor/utils.ts:85](src/components/admin/MeditationFrameEditor/utils.ts#L85)

**Current State:**
```typescript
validate: (value: unknown, options: any) => {
  const isUpdate = options.operation === 'update' || !!options.id
  // ...
}
```

**Investigation:**
- Payload doesn't export proper types for validation context
- `any` is used for validation options, field hooks, and collection slugs
- Affects type safety and IDE autocomplete

**Implementation Steps:**

1. **Create Type Definitions** (1 hour)
   - Create `src/types/payload-extensions.ts`:
   ```typescript
   import type { PayloadRequest, CollectionSlug, Operation } from 'payload'

   /**
    * Field validation context passed to validate functions
    */
   export interface FieldValidationContext<TData = any> {
     /** Current field value */
     value: unknown
     /** Document data being validated */
     data: TData
     /** Document ID (undefined for create) */
     id?: string
     /** Operation being performed */
     operation: Operation
     /** Sibling field data (for fields in arrays/groups) */
     siblingData?: Record<string, unknown>
     /** Full request object */
     req: PayloadRequest
     /** Original document data (for updates) */
     originalDoc?: TData
   }

   /**
    * Type-safe validation function
    */
   export type FieldValidator<TData = any> = (
     value: unknown,
     context: FieldValidationContext<TData>
   ) => true | string | Promise<true | string>

   /**
    * Polymorphic relationship value (ID or full object)
    */
   export type PolymorphicRelation<T = any> =
     | string
     | { relationTo: CollectionSlug; value: string }
     | T

   /**
    * Cell component props
    */
   export interface CellComponentProps<TData = any> {
     cellData: unknown
     rowData: TData
     collectionConfig: any // Payload doesn't export this
     columnIndex: number
     rowIndex: number
     field: any
   }
   ```

2. **Update Meditations Validators** (30 min)
   ```typescript
   import type { FieldValidator } from '@/types/payload-extensions'
   import type { Meditation } from '@/payload-types'

   // Narrator field validation
   validate: ((value: unknown, { operation, id }: FieldValidationContext<Meditation>) => {
     const isUpdate = operation === 'update' || !!id
     if (isUpdate && !value) {
       return 'Narrator is required'
     }
     return true
   }) as FieldValidator<Meditation>
   ```

3. **Update FileAttachmentField** (30 min)
   ```typescript
   import type { PolymorphicRelation } from '@/types/payload-extensions'

   // Replace `as any` with proper type
   owner: {
     relationTo: collection.slug as CollectionSlug,
     value: data.id,
   }

   // Handle polymorphic values
   const fileId = typeof value === 'string'
     ? value
     : (value as PolymorphicRelation)?.id
   ```

4. **Update ThumbnailCell** (30 min)
   ```typescript
   import type { CellComponentProps } from '@/types/payload-extensions'

   export const ThumbnailCell: React.FC<CellComponentProps> = ({
     cellData,
     rowData,
   }) => {
     // Now properly typed
   }
   ```

5. **Update ESLint Config** (15 min)
   ```typescript
   rules: {
     '@typescript-eslint/no-explicit-any': 'error', // Make it an error, not warning
   }
   ```

**Success Criteria:**
- ✅ All `any` types replaced with proper types
- ✅ IDE autocomplete works for validation context
- ✅ No TypeScript errors
- ✅ ESLint enforces no-explicit-any

---

### Issue #5: Unused Imports in Components

**Priority:** Medium
**Effort:** 30 minutes
**Files Affected:**
- [src/components/admin/FrameItem.tsx:4](src/components/admin/FrameItem.tsx#L4)
- [src/components/admin/ThumbnailCell.tsx:4](src/components/admin/ThumbnailCell.tsx#L4)
- [src/components/admin/MeditationFrameEditor/FrameManager.tsx:6](src/components/admin/MeditationFrameEditor/FrameManager.tsx#L6)
- [src/components/admin/MeditationFrameEditor/InlineLayout.tsx:9](src/components/admin/MeditationFrameEditor/InlineLayout.tsx#L9)
- [src/components/admin/MeditationFrameEditor/index.tsx:13-15](src/components/admin/MeditationFrameEditor/index.tsx#L13-L15)

**Implementation Steps:**

1. **Remove Unused Imports** (15 min)
   - Run `pnpm lint --fix` to auto-remove some
   - Manually remove remaining:
     - Remove `Image` import from FrameItem.tsx
     - Remove `Image` import from ThumbnailCell.tsx
     - Remove `SIZES` import from FrameManager.tsx
     - Remove `pauseAllMedia` from InlineLayout.tsx
     - Prefix unused props with `_` in index.tsx:
       ```typescript
       const MeditationFrameEditor: React.FC<MeditationFrameEditorProps> = ({
         path,
         _label,
         _description,
         _required,
         readOnly,
       }) => {
       ```

2. **Verify Build** (5 min)
   ```bash
   pnpm lint
   pnpm build
   ```

**Success Criteria:**
- ✅ No unused imports
- ✅ Build passes
- ✅ No ESLint warnings

---

### Issue #7: Incomplete Error Type Handling

**Priority:** Medium
**Effort:** 1 day
**Files Affected:**
- [src/lib/fieldUtils.ts:188-190,278-286](src/lib/fieldUtils.ts#L188)
- [src/collections/content/Meditations.ts:278-286](src/collections/content/Meditations.ts#L278-L286)

**Current State:**
```typescript
} catch (_error) {
  // Thumbnail not found, skip gracefully
}
```

**Implementation Steps:**

1. **Update fieldUtils.ts** (30 min)
   ```typescript
   import { logger } from '@/lib/logger'

   export const setPreviewUrlHook: CollectionAfterReadHook = async ({ doc, req }) => {
     if (!doc) return doc

     if (doc.mimeType?.startsWith('video/') && doc.thumbnail) {
       if (typeof doc.thumbnail === 'string') {
         try {
           const thumbnailDoc = await req.payload.findByID({
             collection: 'file-attachments',
             id: doc.thumbnail,
           })
           if (thumbnailDoc?.url) {
             doc.previewUrl = thumbnailDoc.url
             return doc
           }
         } catch (error) {
           logger.warn('Thumbnail reference not found', {
             frameId: doc.id,
             thumbnailId: doc.thumbnail,
             error: error instanceof Error ? error.message : String(error),
           })
         }
       }
     }

     // ... rest of logic
   }
   ```

2. **Update Meditations.ts** (30 min)
   ```typescript
   afterRead: [
     async ({ value, req }) => {
       if (!value || !Array.isArray(value)) return []
       const frames = value as KeyframeData[]

       const frameIds = frames.map((f) => f.id)
       if (frameIds.length === 0) return []

       try {
         const frameDocs = await req.payload.find({
           collection: 'frames',
           where: { id: { in: frameIds } },
           limit: frameIds.length,
         })

         const frameMap = Object.fromEntries(
           frameDocs.docs.map((frame) => [frame.id, frame]),
         )

         return frames.map((v) => ({
           ...v,
           ...frameMap[v.id],
           timestamp: Math.round(v.timestamp),
         })) as KeyframeData[]
       } catch (error) {
         logger.warn('Failed to enrich frame data for meditation', {
           meditationId: req.context?.id,
           frameCount: frames.length,
           error: error instanceof Error ? error.message : String(error),
         })

         // Return basic frame data without enrichment
         return frames.map((v) => ({
           ...v,
           timestamp: Math.round(v.timestamp),
         })) as KeyframeData[]
       }
     },
   ]
   ```

**Success Criteria:**
- ✅ Errors logged to Sentry with context
- ✅ No silent failures
- ✅ Graceful degradation maintained

---

### Issue #9: Missing Request Timeout Configuration

**Priority:** Medium
**Effort:** 1 day
**Files Affected:**
- [src/jobs/tasks/TrackUsage.ts](src/jobs/tasks/TrackUsage.ts)
- [src/jobs/tasks/CleanupOrphanedFiles.ts](src/jobs/tasks/CleanupOrphanedFiles.ts)

**Implementation Steps:**

1. **Add Timeout to Job Tasks** (2 hours)
   ```typescript
   export const TrackUsage: TaskConfig<'trackClientUsage'> = {
     retries: 3,
     slug: 'trackClientUsage',
     inputSchema: [...],
     timeout: 30000, // 30 seconds
     handler: async ({ input, req, job }) => {
       const client = await req.payload.findByID({
         collection: 'clients',
         id: input.clientId,
       })

       await req.payload.update({
         collection: 'clients',
         id: input.clientId,
         data: {
           usageStats: {
             lastRequestAt: new Date().toISOString(),
             dailyRequests: (client.usageStats?.dailyRequests || 0) + 1,
           },
         },
       })

       return { output: null }
     },
   }
   ```

2. **Add Circuit Breaker** (4 hours) - Optional but recommended
   - Install `opossum` package
   - Wrap database calls in circuit breaker
   - Configure failure thresholds

**Success Criteria:**
- ✅ Jobs timeout after 30 seconds
- ✅ Failed jobs retry appropriately
- ✅ No hanging jobs in queue

---

### Issue #10: Localization Coverage Gap

**Priority:** Medium
**Effort:** 1 day
**Files Affected:**
- [src/lib/accessControl.ts:26,36-48](src/lib/accessControl.ts#L26)
- [src/payload.config.ts:28-46](src/payload.config.ts#L28-L46)

**Current State:**
- Access control supports only `en` and `cs`
- Payload config defines 16 locales
- Cannot grant permissions for 14 locales

**Implementation Steps:**

1. **Create Shared Locale Configuration** (1 hour)
   - Create `src/lib/locales.ts`:
   ```typescript
   export const LOCALES = [
     { code: 'en', label: 'English' },
     { code: 'es', label: 'Spanish' },
     { code: 'de', label: 'German' },
     { code: 'it', label: 'Italian' },
     { code: 'fr', label: 'French' },
     { code: 'ru', label: 'Russian' },
     { code: 'ro', label: 'Romanian' },
     { code: 'cs', label: 'Czech' },
     { code: 'uk', label: 'Ukrainian' },
     { code: 'el', label: 'Greek' },
     { code: 'hy', label: 'Armenian' },
     { code: 'pl', label: 'Polish' },
     { code: 'pt-br', label: 'Brazilian Portuguese' },
     { code: 'fa', label: 'Farsi/Persian' },
     { code: 'bg', label: 'Bulgarian' },
     { code: 'tr', label: 'Turkish' },
   ] as const

   export type LocaleCode = typeof LOCALES[number]['code']
   export const DEFAULT_LOCALE: LocaleCode = 'en'
   ```

2. **Update payload.config.ts** (15 min)
   ```typescript
   import { LOCALES, DEFAULT_LOCALE } from '@/lib/locales'

   localization: {
     locales: LOCALES.map(l => l.code),
     defaultLocale: DEFAULT_LOCALE,
   }
   ```

3. **Update accessControl.ts** (1 hour)
   ```typescript
   import { LOCALES, LocaleCode } from '@/lib/locales'

   type PermissionLocale = LocaleCode | 'all'

   const LOCALE_OPTIONS: Array<{ label: string; value: PermissionLocale }> = [
     { label: 'All Locales', value: 'all' },
     ...LOCALES.map(l => ({ label: l.label, value: l.code as PermissionLocale })),
   ]
   ```

4. **Update Types** (30 min)
   ```typescript
   export interface Permission {
     allowedCollection: PermissionCollection
     level: PermissionLevel
     locales: PermissionLocale[]
   }
   ```

5. **Testing** (1 hour)
   - Test permission creation with new locales
   - Test locale filtering
   - Update integration tests

**Success Criteria:**
- ✅ All 16 locales available in permissions
- ✅ Single source of truth for locales
- ✅ Permission system works with all locales

---

### Issue #11: Missing Indexes on Collections

**Priority:** Medium
**Effort:** 1 day
**Files Affected:**
- All collections in `src/collections/`

**Implementation Steps:**

1. **Identify Frequently Queried Fields** (1 hour)
   - Review API usage patterns
   - Check collection filters and sorts
   - Identify relationship lookups

2. **Add Indexes to Collections** (3 hours)

   **Pages:**
   ```typescript
   export const Pages: CollectionConfig = {
     slug: 'pages',
     indexes: [
       {
         fields: { slug: 1 },
         unique: true,
       },
       {
         fields: { publishAt: 1 },
       },
       {
         fields: { 'tags': 1 },
       },
     ],
     // ... rest
   }
   ```

   **Meditations:**
   ```typescript
   indexes: [
     {
       fields: { slug: 1 },
       unique: true,
     },
     {
       fields: { locale: 1 },
     },
     {
       fields: { publishAt: 1 },
     },
     {
       fields: { narrator: 1 },
     },
   ]
   ```

   **Managers:**
   ```typescript
   indexes: [
     {
       fields: { email: 1 },
       unique: true,
     },
     {
       fields: { active: 1 },
     },
   ]
   ```

   **Clients:**
   ```typescript
   indexes: [
     {
       fields: { active: 1 },
     },
     {
       fields: { 'usageStats.dailyRequests': 1 },
     },
   ]
   ```

3. **Run Migration** (30 min)
   - Create migration script to add indexes
   - Test in development
   - Document index usage

4. **Monitor Performance** (ongoing)
   - Use MongoDB Atlas performance monitoring
   - Check slow query logs
   - Optimize as needed

**Success Criteria:**
- ✅ Indexes created on all frequently queried fields
- ✅ Query performance improved
- ✅ No duplicate or redundant indexes

---

### Issue #12: Test Data Uses `any` Type Assertions

**Priority:** Medium
**Effort:** 2 hours
**Files Affected:**
- [tests/utils/testData.ts:65,91](tests/utils/testData.ts#L65)

**Implementation Steps:**

1. **Define Buffer Types** (30 min)
   ```typescript
   import type { FileData } from 'payload'

   /**
    * File data for Payload create operations
    */
   export interface PayloadFileData {
     data: Buffer | Uint8Array
     mimetype: string
     name: string
     size: number
   }
   ```

2. **Update Test Factories** (1 hour)
   ```typescript
   async createMediaImage(
     payload: Payload,
     overrides = {},
     sampleFile = 'image-1050x700.jpg',
   ): Promise<Media> {
     const filePath = path.join(SAMPLE_FILES_DIR, sampleFile)
     const fileBuffer = fs.readFileSync(filePath)
     const uint8Array = new Uint8Array(fileBuffer)

     const fileData: PayloadFileData = {
       data: uint8Array,
       mimetype: `image/${path.extname(sampleFile).slice(1)}`,
       name: sampleFile,
       size: uint8Array.length,
     }

     return (await payload.create({
       collection: 'media',
       data: {
         alt: 'Test image file',
         ...overrides,
       },
       file: fileData,
     })) as Media
   }
   ```

**Success Criteria:**
- ✅ No `any` assertions in test data
- ✅ Proper types for file data
- ✅ Tests still pass

---

### Issue #13: Environment Variable Validation Missing

**Priority:** Medium
**Effort:** 2 hours
**Files Affected:**
- [src/payload.config.ts](src/payload.config.ts)

**Implementation Steps:**

1. **Create Env Validation Utility** (1 hour)
   - Create `src/lib/validateEnv.ts`:
   ```typescript
   interface EnvVar {
     name: string
     required: boolean
     defaultValue?: string
     description?: string
   }

   const ENV_VARS: EnvVar[] = [
     {
       name: 'DATABASE_URI',
       required: true,
       description: 'MongoDB connection string',
     },
     {
       name: 'PAYLOAD_SECRET',
       required: true,
       description: 'Secret key for Payload authentication',
     },
     {
       name: 'NEXT_PUBLIC_SERVER_URL',
       required: false,
       defaultValue: 'http://localhost:3000',
       description: 'Public server URL',
     },
     {
       name: 'S3_ENDPOINT',
       required: false,
       description: 'S3-compatible storage endpoint (optional)',
     },
     {
       name: 'S3_ACCESS_KEY_ID',
       required: false,
       description: 'S3 access key (required if S3_ENDPOINT is set)',
     },
     {
       name: 'S3_SECRET_ACCESS_KEY',
       required: false,
       description: 'S3 secret key (required if S3_ENDPOINT is set)',
     },
     {
       name: 'S3_BUCKET',
       required: false,
       description: 'S3 bucket name (required if S3_ENDPOINT is set)',
     },
   ]

   export function validateEnv() {
     const errors: string[] = []
     const warnings: string[] = []

     // Check required vars
     for (const envVar of ENV_VARS) {
       if (envVar.required && !process.env[envVar.name]) {
         errors.push(
           `Missing required environment variable: ${envVar.name}${
             envVar.description ? ` (${envVar.description})` : ''
           }`
         )
       }
     }

     // Check S3 configuration completeness
     const s3Vars = ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET']
     const s3Set = s3Vars.filter(name => process.env[name])

     if (s3Set.length > 0 && s3Set.length < s3Vars.length) {
       warnings.push(
         `Incomplete S3 configuration. Set all of: ${s3Vars.join(', ')} or none. ` +
         `Currently set: ${s3Set.join(', ')}`
       )
     }

     if (errors.length > 0) {
       console.error('\n❌ Environment validation failed:\n')
       errors.forEach(err => console.error(`  - ${err}`))
       console.error('\nPlease check your .env file and ensure all required variables are set.\n')
       process.exit(1)
     }

     if (warnings.length > 0) {
       console.warn('\n⚠️  Environment warnings:\n')
       warnings.forEach(warn => console.warn(`  - ${warn}`))
       console.warn('')
     }

     // Apply defaults
     for (const envVar of ENV_VARS) {
       if (envVar.defaultValue && !process.env[envVar.name]) {
         process.env[envVar.name] = envVar.defaultValue
       }
     }
   }
   ```

2. **Call Validation** (15 min)
   ```typescript
   // src/payload.config.ts
   import { validateEnv } from '@/lib/validateEnv'

   // Validate environment variables (only in production/development, skip in test)
   if (process.env.NODE_ENV !== 'test') {
     validateEnv()
   }

   export default buildConfig({
     // ... config
   })
   ```

3. **Add to Package Scripts** (5 min)
   ```json
   {
     "scripts": {
       "validate:env": "tsx src/lib/validateEnv.ts",
       "dev": "pnpm validate:env && cross-env NODE_OPTIONS=--no-deprecation next dev"
     }
   }
   ```

**Success Criteria:**
- ✅ Clear error on missing required vars
- ✅ Warnings for incomplete config
- ✅ Process exits with helpful message
- ✅ Validates before server starts

---

## Low Priority Issues

### Issue #15: Mixed React Import Styles

**Priority:** Low
**Effort:** 30 minutes
**Files Affected:**
- Multiple component files

**Implementation Steps:**

1. **Standardize Imports** (20 min)
   - Run find/replace:
     ```bash
     # Before
     import React from 'react'
     import React, { useState, useEffect } from 'react'

     # After
     import { useState, useEffect } from 'react'
     ```

   - Update files:
     - `src/components/admin/HighUsageAlert.tsx`
     - `src/components/admin/PublishAtAfterInput.tsx`
     - `src/components/admin/PublishStateCell.tsx`
     - `src/components/admin/ThumbnailCell.tsx`
     - All MeditationFrameEditor components

2. **Verify Build** (5 min)
   ```bash
   pnpm build
   ```

**Success Criteria:**
- ✅ Consistent import style
- ✅ Build succeeds
- ✅ No React warnings

---

### Issue #17: Missing JSDoc Comments

**Priority:** Low
**Effort:** 3 hours
**Files Affected:**
- [src/lib/accessControl.ts](src/lib/accessControl.ts)
- [src/lib/fieldUtils.ts](src/lib/fieldUtils.ts)

**Implementation Steps:**

1. **Add JSDoc to accessControl.ts** (1.5 hours)
   ```typescript
   /**
    * Check if the authenticated user is an API client
    *
    * @param user - The authenticated user object
    * @returns True if the user is an API client, false otherwise
    *
    * @example
    * if (isAPIClient(req.user)) {
    *   // Handle API client request
    * }
    */
   export const isAPIClient = (user: TypedUser | null) => {
     return user?.collection === 'clients'
   }

   /**
    * Check if a user has permission for a specific collection and operation
    *
    * @param params - Permission check parameters
    * @param params.user - Authenticated user (Manager or API Client)
    * @param params.collection - Collection slug to check permissions for
    * @param params.operation - CRUD operation being attempted
    * @param params.field - Optional field-level check with localized flag
    * @param params.locale - Optional locale restriction for localized content
    * @returns Boolean indicating if the user has permission
    *
    * @remarks
    * - Admin users bypass all restrictions (always returns true)
    * - API clients never get delete access
    * - Managers have read access by default
    * - Translate level only allows editing localized fields
    *
    * @example
    * if (hasPermission({
    *   user: req.user,
    *   collection: 'pages',
    *   operation: 'update',
    *   locale: 'en'
    * })) {
    *   // Allow update
    * }
    */
   export const hasPermission = ({ ... }) => { ... }
   ```

2. **Add JSDoc to fieldUtils.ts** (1.5 hours)
   ```typescript
   /**
    * Sanitizes uploaded file names for safe storage
    *
    * Converts file names to URL-safe slugs and adds random suffix to prevent collisions.
    *
    * @param req - Payload request containing the uploaded file
    * @returns The request object with sanitized filename
    *
    * @example
    * // Input: "My Photo (1).jpg"
    * // Output: "my-photo-1-xk2j9s.jpg"
    */
   export const sanitizeFilename: CollectionBeforeOperationHook = async ({ req }) => { ... }

   /**
    * Extracts metadata from uploaded media files (audio/video/image)
    *
    * Uses FFprobe for audio/video and Sharp for images to extract:
    * - Duration (for audio/video)
    * - Dimensions (for video/images)
    * - Orientation (for images)
    *
    * @param file - Uploaded file object from Payload request
    * @returns File metadata including duration and dimensions
    *
    * @throws {Error} If FFprobe or Sharp fail to process the file
    *
    * @example
    * const metadata = await extractFileMetadata(req.file)
    * // { duration: 180.5, width: 1920, height: 1080 }
    */
   export const extractFileMetadata = async (file: NonNullable<PayloadRequest['file']>) => { ... }
   ```

**Success Criteria:**
- ✅ All public functions documented
- ✅ JSDoc includes @param, @returns, @example
- ✅ IDE shows helpful tooltips

---

### Issue #21: Missing CORS Wildcard for Development

**Priority:** Low
**Effort:** 15 minutes
**Files Affected:**
- [src/payload.config.ts:48-51](src/payload.config.ts#L48-L51)

**Implementation Steps:**

1. **Update CORS Configuration** (10 min)
   ```typescript
   const isProduction = process.env.NODE_ENV === 'production'
   const isDevelopment = process.env.NODE_ENV === 'development'

   export default buildConfig({
     // ...
     cors: isDevelopment
       ? '*' // Allow all origins in development
       : [
           process.env.WEMEDITATE_WEB_URL || 'http://localhost:5173',
           process.env.SAHAJATLAS_URL || 'http://localhost:5174',
         ],
     // ...
   })
   ```

2. **Test CORS** (5 min)
   - Start dev server
   - Test from non-standard port
   - Verify requests work

**Success Criteria:**
- ✅ CORS allows all origins in development
- ✅ CORS restricted to specific origins in production
- ✅ Frontend can connect from any port in dev

---

### Issue #22: Sentry Configuration Not Environment-Aware

**Priority:** Low
**Effort:** 30 minutes
**Files Affected:**
- [src/sentry.server.config.ts](src/sentry.server.config.ts)
- [src/sentry.edge.config.ts](src/sentry.edge.config.ts)
- [src/instrumentation.ts](src/instrumentation.ts)

**Current State:**
```typescript
Sentry.init({
  enabled: process.env.NODE_ENV === 'production',
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  debug: false,
})
```

**Investigation:**
- Sentry is already disabled in non-production! ✅
- Configuration is actually correct
- This issue is actually a false positive

**Implementation Steps:**

1. **Verify Configuration** (10 min)
   - Check that `enabled: process.env.NODE_ENV === 'production'` works
   - Test that dev errors don't go to Sentry

2. **Add Environment Filter** (optional, 20 min)
   ```typescript
   Sentry.init({
     enabled: process.env.NODE_ENV === 'production',
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV || 'development',

     beforeSend(event, hint) {
       // Extra safeguard: Don't send dev/test events
       if (process.env.NODE_ENV !== 'production') {
         return null
       }
       return event
     },

     tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
     debug: false,
   })
   ```

**Success Criteria:**
- ✅ No dev errors in Sentry
- ✅ Production errors captured correctly
- ✅ Environment tag visible in Sentry

**Note:** This issue is already mostly resolved. The current configuration is correct.

---

### Issue #24: Outdated Dependencies

**Priority:** Low
**Effort:** 2-3 days
**Files Affected:**
- [package.json](package.json)

**Outdated Packages:**
```
@sentry/nextjs: 9.46.0 → 10.22.0 (major version)
@playwright/test: 1.50.0 → 1.56.1
typescript: 5.7.3 → 5.9.3
@aws-sdk/*: 3.917.0 → 3.918.0
react: 19.1.0 → 19.2.0
```

**Implementation Steps:**

1. **Update Minor Versions** (1 hour)
   ```bash
   pnpm update @aws-sdk/client-s3 @aws-sdk/lib-storage
   pnpm update @playwright/test playwright playwright-core
   pnpm update typescript
   pnpm update react @types/react @types/react-dom
   ```

2. **Test After Updates** (2 hours)
   ```bash
   pnpm install
   pnpm lint
   pnpm test:int
   pnpm test:e2e
   pnpm build
   ```

3. **Update Sentry (Breaking Changes)** (4 hours)
   - Review Sentry v10 migration guide
   - Update configuration:
   ```typescript
   // v10 changes required
   import * as Sentry from '@sentry/nextjs'

   Sentry.init({
     enabled: process.env.NODE_ENV === 'production',
     dsn: process.env.SENTRY_DSN,

     // New in v10
     integrations: [
       Sentry.replayIntegration(),
       Sentry.feedbackIntegration(),
     ],

     // Renamed from tracesSampleRate
     sampleRate: 1.0,
     tracesSampleRate: 0.1,

     // New error filtering
     ignoreErrors: [
       // Add common errors to ignore
       'ResizeObserver loop limit exceeded',
     ],
   })
   ```

   - Update instrumentation.ts
   - Test error capture
   - Test performance monitoring
   - Verify source maps upload

4. **Update Other Packages** (1 hour)
   ```bash
   pnpm update @vitejs/plugin-react
   pnpm update @types/node @types/nodemailer
   ```

5. **Documentation** (30 min)
   - Update CLAUDE.md with new versions
   - Document any breaking changes
   - Update .env.example if needed

**Success Criteria:**
- ✅ All packages updated
- ✅ All tests pass
- ✅ Build succeeds
- ✅ Sentry still works correctly
- ✅ No runtime errors

**Rollback Plan:**
- Keep old package.json in git
- Tag release before upgrade
- Can revert with `git checkout package.json && pnpm install`

---

## Implementation Order

Recommended order based on dependencies and priority:

### Phase 1: Foundation (Week 1)
1. **Issue #2** - Create Logger Utility (2-3 days)
   - Foundation for other improvements
   - Enables better error tracking

2. **Issue #4** - Fix TypeScript `any` Types (1-2 days)
   - Improves type safety for remaining work
   - Required before Issue #12

3. **Issue #5** - Remove Unused Imports (30 min)
   - Quick win, improves code cleanliness

### Phase 2: Core Improvements (Week 2)
4. **Issue #13** - Environment Variable Validation (2 hours)
   - Catches configuration errors early

5. **Issue #7** - Improve Error Handling (1 day)
   - Depends on Issue #2 (logger)

6. **Issue #10** - Fix Localization Gap (1 day)
   - Important for international deployments

7. **Issue #11** - Add Database Indexes (1 day)
   - Performance improvement

### Phase 3: Security & Quality (Week 3)
8. **Issue #1** - Enable Email Verification (1-2 days)
   - Security critical
   - Depends on validated env vars (Issue #13)

9. **Issue #12** - Fix Test Type Assertions (2 hours)
   - Depends on Issue #4 (type definitions)

10. **Issue #9** - Add Job Timeouts (1 day)
    - Reliability improvement

### Phase 4: Nice to Have (Week 4)
11. **Issue #3** - Replace fluent-ffmpeg (2-3 days)
    - Complex, can be deferred if migration fails

12. **Issue #15** - Standardize React Imports (30 min)
    - Quick cleanup

13. **Issue #17** - Add JSDoc Comments (3 hours)
    - Documentation improvement

14. **Issue #21** - Fix CORS for Dev (15 min)
    - Quality of life improvement

15. **Issue #22** - Verify Sentry Config (30 min)
    - Already mostly correct

16. **Issue #24** - Update Dependencies (2-3 days)
    - Test thoroughly, do last

---

## Estimated Timeline

### Optimistic: 2.5 weeks
- All issues resolved
- Minimal blockers
- Smooth testing

### Realistic: 3.5 weeks
- Some issues need iteration
- Testing reveals edge cases
- Minor blockers resolved

### Pessimistic: 5 weeks
- Issue #3 (FFmpeg) migration fails, need alternative approach
- Issue #1 (Email) needs custom templates
- Issue #24 (Sentry v10) has compatibility issues

---

## Testing Strategy

For each issue:

1. **Unit Tests**
   - Test new utilities in isolation
   - Mock dependencies

2. **Integration Tests**
   - Test with real Payload instance
   - Verify database interactions
   - Test permission flows

3. **Manual Testing**
   - Test in admin UI
   - Verify user workflows
   - Check edge cases

4. **Regression Testing**
   - Run full test suite after each change
   - Verify no existing functionality broken

---

## Success Metrics

### Code Quality
- Zero `any` types in application code
- Zero console.* statements in production
- 100% of public APIs documented with JSDoc
- ESLint passes with no warnings

### Performance
- Database query times reduced by 30%+ (after indexes)
- No job timeouts
- Build time < 2 minutes

### Security
- Email verification enabled
- All required env vars validated
- Proper error logging without information leakage

### Maintainability
- Single source of truth for locales
- Consistent logging patterns
- Clear type definitions

---

## Notes

- This plan addresses 16 of 24 total issues
- Focus on high/medium priority items
- Low priority items are quality-of-life improvements
- Some issues (like #22) are already mostly resolved
- Issue #3 (FFmpeg) has highest risk of requiring alternative approach

## Next Steps

1. Review this plan with the team
2. Get approval for implementation approach
3. Start with Phase 1 (Foundation)
4. Create feature branches for each issue
5. Submit PRs for review after each issue
