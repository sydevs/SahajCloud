# Implementation Plan: Cloudflare-Native Storage Migration
**Issue**: #75
**Status**: 🚧 In Progress
**Started**: 2025-12-03

## Overview
Migrate from S3-compatible storage to Cloudflare-native services:
- **Cloudflare Images** for image storage (replaces Sharp processing)
- **Cloudflare Stream** for video storage (replaces FFmpeg thumbnails)
- **R2 Native Bindings** for audio files and generic files

Collection slug changes:
- `media` → `images`
- `file-attachments` → `files`

**Note**: Database reset planned post-implementation (no data migration needed).

---

## Phase 1: Environment & Configuration
**Status**: ✅ Complete

### 1.1 Update wrangler.toml
- [x] Add to `[vars]` section:
  ```toml
  CLOUDFLARE_ACCOUNT_ID = ""  # To be filled
  CLOUDFLARE_IMAGES_ACCOUNT_HASH = ""  # To be filled
  CLOUDFLARE_STREAM_CUSTOMER_CODE = ""  # To be filled
  ```
- [x] Add to `[env.dev.vars]` section (same variables)
- [x] Add comment about secrets: `CLOUDFLARE_IMAGES_API_TOKEN` and `CLOUDFLARE_STREAM_API_TOKEN` must be set via `wrangler secret put`

### 1.2 Update .env.example
- [x] Add Cloudflare service variables with comments:
  ```env
  # Cloudflare Images (Production Only)
  CLOUDFLARE_ACCOUNT_ID=your-account-id
  CLOUDFLARE_IMAGES_ACCOUNT_HASH=your-images-account-hash
  CLOUDFLARE_IMAGES_API_TOKEN=your-images-api-token

  # Cloudflare Stream (Production Only)
  CLOUDFLARE_STREAM_CUSTOMER_CODE=your-stream-customer-code
  CLOUDFLARE_STREAM_API_TOKEN=your-stream-api-token
  ```
- [x] Remove S3-specific variables:
  - `S3_ENDPOINT`
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`
  - `S3_BUCKET`
  - `S3_REGION`
- [x] Add comment explaining production-only Cloudflare services with dev fallback to local storage

---

## Phase 2: Storage Adapters
**Status**: ✅ Complete

### 2.1 Create Cloudflare Images Adapter
**File**: `src/lib/storage/cloudflareImagesAdapter.ts`

**Implementation** - ✅ Created
```typescript
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

export interface CloudflareImagesConfig {
  accountId: string
  apiToken: string
  accountHash: string
}

export const cloudflareImagesAdapter = (config: CloudflareImagesConfig): Adapter => {
  return ({ collection, prefix }) => ({
    name: 'cloudflare-images',

    handleUpload: async ({ file }) => {
      const formData = new FormData()
      formData.append('file', new Blob([file.buffer]), file.filename)

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.apiToken}` },
          body: formData,
        }
      )

      const result = await response.json()
      if (!result.success) {
        throw new Error(`Cloudflare Images upload failed: ${result.errors}`)
      }

      const imageId = result.result.id
      // Store imageId as filename - PayloadCMS will save it
      // URL generation happens via virtual field
    },

    handleDelete: async ({ filename: imageId }) => {
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1/${imageId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${config.apiToken}` },
        }
      )
    },

    staticHandler: async (req, { params }) => {
      // Return redirect to Cloudflare Images URL
      const imageId = params.filename
      const url = `https://imagedelivery.net/${config.accountHash}/${imageId}/public`
      return Response.redirect(url, 302)
    },
  })
}
```

**Tasks**:
- [x] Create file with basic structure
- [x] Implement `handleUpload` with Cloudflare Images API
- [x] Implement `handleDelete`
- [x] Implement `staticHandler` (redirect to imagedelivery.net)
- [x] Add error handling and logging
- [x] Add TypeScript types

### 2.2 Create Cloudflare Stream Adapter
**File**: `src/lib/storage/cloudflareStreamAdapter.ts`

**Implementation**:
```typescript
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

export interface CloudflareStreamConfig {
  accountId: string
  apiToken: string
  customerCode: string
}

export const cloudflareStreamAdapter = (config: CloudflareStreamConfig): Adapter => {
  return ({ collection, prefix }) => ({
    name: 'cloudflare-stream',

    handleUpload: async ({ file }) => {
      const formData = new FormData()
      formData.append('file', new Blob([file.buffer]), file.filename)

      // Upload video
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.apiToken}` },
          body: formData,
        }
      )

      const result = await response.json()
      if (!result.success) {
        throw new Error(`Cloudflare Stream upload failed: ${result.errors}`)
      }

      const videoId = result.result.uid

      // Enable MP4 downloads for HTML5 video compatibility
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream/${videoId}/downloads`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      // Store videoId as filename
    },

    handleDelete: async ({ filename: videoId }) => {
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream/${videoId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${config.apiToken}` },
        }
      )
    },

    staticHandler: async (req, { params }) => {
      // Return redirect to Stream MP4 URL
      const videoId = params.filename
      const url = `https://customer-${config.customerCode}.cloudflarestream.com/${videoId}/downloads/default.mp4`
      return Response.redirect(url, 302)
    },
  })
}
```

**Tasks**:
- [x] Create file with basic structure
- [x] Implement `handleUpload` with Cloudflare Stream API
- [x] Enable MP4 downloads during upload
- [x] Implement `handleDelete`
- [x] Implement `staticHandler` (redirect to Stream MP4 URL)
- [x] Add error handling and logging
- [x] Add TypeScript types

### 2.3 Create R2 Native Adapter
**File**: `src/lib/storage/r2NativeAdapter.ts`

**Implementation**:
```typescript
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'
import type { R2Bucket } from '@cloudflare/workers-types'

export interface R2NativeConfig {
  bucket: R2Bucket
  publicUrl: string  // e.g., "https://assets.sydevelopers.com"
}

export const r2NativeAdapter = (config: R2NativeConfig): Adapter => {
  return ({ collection, prefix }) => ({
    name: 'r2-native',

    handleUpload: async ({ file }) => {
      const key = prefix ? `${prefix}/${file.filename}` : file.filename

      await config.bucket.put(key, file.buffer, {
        httpMetadata: {
          contentType: file.mimeType,
        },
      })
    },

    handleDelete: async ({ filename }) => {
      const key = prefix ? `${prefix}/${filename}` : filename
      await config.bucket.delete(key)
    },

    staticHandler: async (req, { params }) => {
      const key = params.collection ? `${params.collection}/${params.filename}` : params.filename
      const object = await config.bucket.get(key)

      if (!object) {
        return new Response('Not Found', { status: 404 })
      }

      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000',
        },
      })
    },
  })
}
```

**Tasks**:
- [x] Create file with basic structure
- [x] Implement `handleUpload` using R2 binding's `put()` method
- [x] Implement `handleDelete` using R2 binding's `delete()` method
- [x] Implement `staticHandler` using R2 binding's `get()` method
- [x] Add error handling and logging
- [x] Add TypeScript types for R2Bucket

### 2.4 Create Router Adapter for Mixed Media
**File**: `src/lib/storage/routerAdapter.ts`

**Implementation**:
```typescript
import type { Adapter, GeneratedAdapter } from '@payloadcms/plugin-cloud-storage/types'

export interface RouterConfig {
  routes: {
    [mimeTypePrefix: string]: Adapter
  }
  default: Adapter
}

export const routerAdapter = (config: RouterConfig): Adapter => {
  return ({ collection, prefix }) => {
    // Generate all adapters upfront
    const adapters: Record<string, GeneratedAdapter> = {}

    for (const [key, adapter] of Object.entries(config.routes)) {
      adapters[key] = adapter({ collection, prefix })
    }
    adapters.default = config.default({ collection, prefix })

    // Helper to select adapter based on MIME type
    const selectAdapter = (mimeType: string | undefined): GeneratedAdapter => {
      if (!mimeType) return adapters.default

      for (const [prefix, adapter] of Object.entries(adapters)) {
        if (prefix !== 'default' && mimeType.startsWith(prefix)) {
          return adapter
        }
      }
      return adapters.default
    }

    return {
      name: 'router-adapter',

      handleUpload: async (args) => {
        const adapter = selectAdapter(args.file.mimeType)
        return adapter.handleUpload(args)
      },

      handleDelete: async (args) => {
        const adapter = selectAdapter(args.doc.mimeType)
        return adapter.handleDelete(args)
      },

      staticHandler: async (req, args) => {
        const adapter = selectAdapter(args.doc?.mimeType)
        return adapter.staticHandler(req, args)
      },
    }
  }
}
```

**Tasks**:
- [x] Create file with basic structure
- [x] Implement MIME-type based routing logic
- [x] Route images to Cloudflare Images adapter
- [x] Route videos to Cloudflare Stream adapter
- [x] Add error handling
- [x] Add TypeScript types

### 2.5 Update Storage Plugin
**File**: `src/lib/storage.ts`

**Implementation**:
```typescript
import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import type { Plugin } from 'payload'

import { cloudflareImagesAdapter } from './storage/cloudflareImagesAdapter'
import { cloudflareStreamAdapter } from './storage/cloudflareStreamAdapter'
import { r2NativeAdapter } from './storage/r2NativeAdapter'
import { routerAdapter } from './storage/routerAdapter'

export const storagePlugin = (): Plugin => {
  const isProduction = process.env.NODE_ENV === 'production'

  // Only use Cloudflare services in production
  const hasCloudflareConfig = Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_IMAGES_API_TOKEN &&
    process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH &&
    process.env.CLOUDFLARE_STREAM_API_TOKEN &&
    process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE
  )

  const useCloudflare = isProduction && hasCloudflareConfig

  if (useCloudflare) {
    const imagesAdapter = cloudflareImagesAdapter({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
      apiToken: process.env.CLOUDFLARE_IMAGES_API_TOKEN!,
      accountHash: process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH!,
    })

    const streamAdapter = cloudflareStreamAdapter({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
      apiToken: process.env.CLOUDFLARE_STREAM_API_TOKEN!,
      customerCode: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE!,
    })

    // R2 adapter - get bucket from Cloudflare context
    // TODO: Get R2 bucket from cloudflare.env.R2
    const r2Adapter = r2NativeAdapter({
      bucket: cloudflare.env.R2,  // From Wrangler binding
      publicUrl: `https://${process.env.PUBLIC_ASSETS_URL}`,
    })

    return cloudStoragePlugin({
      enabled: true,
      collections: {
        images: {
          adapter: imagesAdapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },
        frames: {
          adapter: routerAdapter({
            routes: {
              'image/': imagesAdapter,
              'video/': streamAdapter,
            },
            default: imagesAdapter,
          }),
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },
        meditations: {
          adapter: r2Adapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },
        music: {
          adapter: r2Adapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },
        lessons: {
          adapter: r2Adapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },
        files: {
          adapter: r2Adapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },
      },
    })
  }

  // Development: Use local file storage (no Cloudflare credentials needed)
  return cloudStoragePlugin({
    enabled: false, // Disables cloud storage, uses local
    collections: {},
  })
}
```

**Tasks**:
- [x] Replace S3 storage import with custom adapters
- [x] Configure adapters per collection (images, frames, meditations, music, files)
- [x] Add environment variable checks with fallback to local storage in dev
- [x] Get R2 bucket from Cloudflare context
- [x] Add TypeScript types for environment variables
- [x] Remove old S3 configuration

---

## Phase 3: Collection Updates
**Status**: ✅ Complete

### 3.1 Rename Media → Images
**File**: `src/collections/resources/Media.ts` → `Images.ts`

**Tasks**:
- [ ] Rename file `Media.ts` → `Images.ts`
- [ ] Change slug: `media` → `images`
- [ ] Update labels: `singular: 'Image'`, `plural: 'Images'`
- [ ] Remove Sharp hooks from hooks array:
  - Remove `convertFile` from `beforeChange`
  - Remove `processFile` from `beforeValidate`
- [ ] Remove `imageSizes` configuration from `upload` config
- [ ] Keep fields: `alt`, `credit`, `tags`, `fileMetadata`
- [ ] Update `upload.staticDir`: `'media/media'` → `'media/images'`
- [ ] Keep `sanitizeFilename` hook in `beforeOperation`
- [ ] Add virtual `url` field with afterRead hook for Cloudflare Images URL:
  ```typescript
  {
    name: 'url',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [({ data }) => {
        if (data?.filename && process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH) {
          return `https://imagedelivery.net/${process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH}/${data.filename}/public`
        }
        return data?.url  // Fallback to PayloadCMS-generated URL
      }]
    },
    admin: { hidden: true }
  }
  ```

### 3.2 Rename FileAttachments → Files
**File**: `src/collections/system/FileAttachments.ts` → `Files.ts`

**Tasks**:
- [ ] Rename file `FileAttachments.ts` → `Files.ts`
- [ ] Change slug: `file-attachments` → `files`
- [ ] Update labels: `singular: 'File'`, `plural: 'Files'`
- [ ] Update `upload.staticDir`: `'media/files'` → `'media/files'` (keep as-is or update if needed)
- [ ] Keep ownership system (`owner` field, cascade deletion hooks)
- [ ] Update export constant name: `FileAttachmentOwnerSlugs` (if needed)
- [ ] Add virtual `url` field with afterRead hook for R2 URLs:
  ```typescript
  {
    name: 'url',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [({ data }) => {
        if (data?.filename) {
          return `https://${process.env.PUBLIC_ASSETS_URL}/files/${data.filename}`
        }
        return data?.url
      }]
    },
    admin: { hidden: true }
  }
  ```

### 3.3 Update Frames Collection
**File**: `src/collections/system/Frames.ts`

**Tasks**:
- [ ] Update storage adapter (handled in storage.ts)
- [ ] Remove FFmpeg hooks:
  - Remove `generateVideoThumbnailHook` from `afterChange`
  - Remove `convertFile` from `beforeChange`
  - Remove `processFile` from `beforeValidate`
- [ ] Remove `imageSizes` configuration from `upload` config
- [ ] Remove `thumbnail` FileAttachmentField
- [ ] Add virtual field `thumbnailUrl`:
  ```typescript
  {
    name: 'thumbnailUrl',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [({ data }) => {
        if (!data?.filename) return undefined

        if (data.mimeType?.startsWith('video/')) {
          // Cloudflare Stream thumbnail
          const code = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE
          return code
            ? `https://customer-${code}.cloudflarestream.com/${data.filename}/thumbnails/thumbnail.jpg?height=320`
            : undefined
        } else if (data.mimeType?.startsWith('image/')) {
          // Cloudflare Images thumbnail
          const hash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH
          return hash
            ? `https://imagedelivery.net/${hash}/${data.filename}/format=auto,width=320,height=320,fit=cover`
            : undefined
        }
        return undefined
      }]
    },
    admin: {
      hidden: true,
      components: {
        Cell: '@/components/admin/ThumbnailCell',
      },
    },
  }
  ```
- [ ] Add virtual field `streamMp4Url`:
  ```typescript
  {
    name: 'streamMp4Url',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [({ data }) => {
        if (data?.mimeType?.startsWith('video/') && data?.filename) {
          const code = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE
          return code
            ? `https://customer-${code}.cloudflarestream.com/${data.filename}/downloads/default.mp4`
            : undefined
        }
        return undefined
      }]
    },
    admin: {
      readOnly: true,
      description: 'Direct MP4 URL for HTML5 video playback',
      condition: (data) => data?.mimeType?.startsWith('video/'),
    },
  }
  ```
- [ ] Update `previewUrl` virtual field to use `thumbnailUrl`
- [ ] Remove `setPreviewUrlHook` from `afterRead` (replaced by virtual fields)

### 3.4 Update Audio Collections
**Files**:
- `src/collections/content/Meditations.ts`
- `src/collections/content/Music.ts`
- `src/collections/content/Lessons.ts`

**Tasks** (for each file):
- [ ] Update storage adapter (handled in storage.ts)
- [ ] Add virtual `url` field with afterRead hook for R2 URLs:
  ```typescript
  {
    name: 'url',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [({ data }) => {
        if (data?.filename) {
          const collection = 'meditations' // or 'music', 'lessons'
          return `https://${process.env.PUBLIC_ASSETS_URL}/${collection}/${data.filename}`
        }
        return data?.url
      }]
    },
    admin: { hidden: true }
  }
  ```
- [ ] Keep existing field structure
- [ ] Remove any S3-specific hooks if present

### 3.5 Update Collection Exports
**File**: `src/collections/index.ts`

**Tasks**:
- [ ] Change import: `import { Media }` → `import { Images }`
- [ ] Change import: `import { FileAttachments }` → `import { Files }`
- [ ] Update exports array: replace `Media` with `Images`, `FileAttachments` with `Files`
- [ ] Update named exports

### 3.6 Update All relationTo References
**Search Pattern**: `relationTo.*['"]media['"]` and `relationTo.*['"]file-attachments['"]`

**Files to update**:
- [ ] `src/collections/content/Pages.ts` - SEO plugin uploadCollection reference
- [ ] `src/collections/content/Lessons.ts` - Check for media relationships
- [ ] `src/collections/resources/ExternalVideos.ts` - Check for media relationships
- [ ] `src/fields/FileAttachmentField.ts` - Update `relationTo: 'file-attachments'` → `'files'`
- [ ] `src/payload.config.ts` - Update SEO plugin: `uploadsCollection: 'media'` → `'images'`
- [ ] Any other files with relationships to these collections

---

## Phase 4: Field Utils & Hooks Cleanup
**Status**: ✅ Complete

### 4.1 Update fieldUtils.ts
**File**: `src/lib/fieldUtils.ts`

**Tasks**:
- [x] Remove `convertFile` hook (Sharp processing) - delete entire function
- [x] Remove `generateVideoThumbnailHook` (FFmpeg processing) - delete entire function
- [x] Remove `setPreviewUrlHook` - delete entire function (replaced by virtual fields)
- [x] Keep `sanitizeFilename` hook
- [x] Keep `processFile` hook
- [x] Remove commented-out Sharp imports
- [x] Remove commented-out FFmpeg imports
- [x] Remove commented-out tmp imports
- [x] Clean up any unused imports

### 4.2 Remove Video Thumbnail Utils
**File**: `src/lib/videoThumbnailUtils.ts`

**Tasks**:
- [x] Delete entire file (FFmpeg-based thumbnail generation no longer needed)

### 4.3 Update FileAttachmentField
**File**: `src/fields/FileAttachmentField.ts`

**Tasks**:
- [x] Update `relationTo: 'file-attachments'` → `'files'`
- [x] Update cascade deletion hooks to use new slug
- [x] Update any comments/documentation

---

## Phase 5: Admin Components
**Status**: ✅ Complete

### 5.1 Update ThumbnailCell
**File**: `src/components/admin/ThumbnailCell.tsx`

**Tasks**:
- [x] Update to use `thumbnailUrl` virtual field:
  ```typescript
  export const ThumbnailCell: React.FC<{ data: Frame }> = ({ data }) => {
    const thumbnailUrl = data.thumbnailUrl

    if (!thumbnailUrl) {
      return <div style={{ color: '#999' }}>No thumbnail</div>
    }

    return (
      <img
        src={thumbnailUrl}
        alt={data.filename || 'Thumbnail'}
        style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }}
      />
    )
  }
  ```
- [x] Remove fallback logic for local thumbnails
- [x] Remove any FileAttachment lookup logic
- [x] Works for both images and videos automatically (via `thumbnailUrl`)

### 5.2 Update MeditationFrameEditor Components
**Directory**: `src/components/admin/MeditationFrameEditor/`

**Files to update**:

#### FrameLibrary.tsx
- [x] Use `frame.thumbnailUrl` for display:
  ```typescript
  <img src={frame.thumbnailUrl} alt={frame.filename} />
  ```
- [x] Remove any local thumbnail generation logic

#### FramePreview.tsx
- [x] Use `streamMp4Url` for video playback:
  ```typescript
  {currentFrame?.mimeType?.startsWith('video/') ? (
    <video
      src={currentFrame.streamMp4Url}
      autoPlay
      loop
      muted
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  ) : (
    <img
      src={currentFrame.url}
      alt={currentFrame.filename}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  )}
  ```
- [x] Remove fallback video element logic

#### FrameManager.tsx
- [x] Update to use new URL fields
- [x] Remove any FileAttachment thumbnail references

#### types.ts
- [x] Add `thumbnailUrl` and `streamMp4Url` to Frame interface

---

## Phase 6: Testing
**Status**: ⏳ Pending

### 6.1 Update Test Helpers
**File**: `tests/utils/testHelpers.ts`

**Tasks**:
- [ ] Update `UPLOAD_COLLECTIONS` array: replace `'media'` with `'images'`, add `'files'`
- [ ] Keep `imageSizes: []` to disable image processing in tests
- [ ] Add mock Cloudflare environment (if needed):
  ```typescript
  process.env.CLOUDFLARE_ACCOUNT_ID = 'mock-account-id'
  process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH = 'mock-images-hash'
  process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = 'mock-stream-code'
  ```
- [ ] Ensure local file storage is used in tests (no Cloudflare API calls)

### 6.2 Update Test Configuration
**File**: `tests/config/test-payload.config.ts`

**Tasks**:
- [ ] Ensure storage plugin is disabled in test environment
- [ ] Collections use local file storage
- [ ] No Cloudflare adapter initialization

### 6.3 Update Test Data Factories
**File**: `tests/utils/testData.ts`

**Tasks**:
- [ ] Rename `createMedia()` → `createImage()`
- [ ] Update function to create images in `images` collection (not `media`)
- [ ] Update any `file-attachments` references to `files`
- [ ] Update collection slug references in all factory functions

### 6.4 Update Integration Tests
**Files**: `tests/int/*.int.spec.ts`

**Tests to update**:
- [ ] `tests/int/media.int.spec.ts` → rename to `images.int.spec.ts`
- [ ] `tests/int/frames.int.spec.ts` - update to use new virtual fields
- [ ] `tests/int/fileAttachments.int.spec.ts` → rename to `files.int.spec.ts`
- [ ] `tests/int/pages.int.spec.ts` - update media relationship references
- [ ] `tests/int/lessons.int.spec.ts` - update file attachment references
- [ ] Any other tests referencing `media` or `file-attachments`

**Tasks for each test file**:
- [ ] Update collection slugs in API calls
- [ ] Update test data creation calls
- [ ] Test virtual field population (`url`, `thumbnailUrl`, `streamMp4Url`)
- [ ] Update relationship assertions

### 6.5 Update E2E Tests
**Files**: `tests/e2e/*.e2e.spec.ts`

**Tasks**:
- [ ] Update any tests referencing `media` or `file-attachments` collections
- [ ] Update admin UI navigation paths
- [ ] Update collection list page URLs

---

## Phase 7: Configuration Updates
**Status**: ⏳ Pending

### 7.1 Update payload.config.ts
**File**: `src/payload.config.ts`

**Tasks**:
- [ ] Update SEO plugin configuration:
  ```typescript
  seoPlugin({
    collections: ['pages'],
    uploadsCollection: 'images',  // Changed from 'media'
    generateTitle: ({ doc }) => `We Meditate — ${doc.title}`,
    generateDescription: ({ doc }) => doc.content,
    tabbedUI: true,
  })
  ```
- [ ] Remove Sharp import: `// import sharp from 'sharp'` line
- [ ] Remove Sharp-related comments
- [ ] Update storage plugin call (handled in storage.ts)

### 7.2 Update Types
**File**: `src/types/index.ts` (create if doesn't exist)

**Tasks**:
- [ ] Add Cloudflare environment types:
  ```typescript
  import type { R2Bucket } from '@cloudflare/workers-types'

  export interface CloudflareEnv {
    R2: R2Bucket
    D1: D1Database
    CLOUDFLARE_ACCOUNT_ID: string
    CLOUDFLARE_IMAGES_API_TOKEN: string
    CLOUDFLARE_IMAGES_ACCOUNT_HASH: string
    CLOUDFLARE_STREAM_API_TOKEN: string
    CLOUDFLARE_STREAM_CUSTOMER_CODE: string
  }
  ```
- [ ] Export storage adapter types if needed

---

## Phase 8: Dependencies
**Status**: ⏳ Pending

### 8.1 Remove Old Dependencies
**Command**:
```bash
pnpm remove @payloadcms/storage-s3 sharp fluent-ffmpeg ffmpeg-static @types/fluent-ffmpeg
```

**Tasks**:
- [ ] Run removal command
- [ ] Verify package.json updated
- [ ] Check for any breaking imports

### 8.2 Add New Dependencies
**Command**:
```bash
pnpm add -D @cloudflare/workers-types
```

**Tasks**:
- [ ] Add @cloudflare/workers-types if not present
- [ ] Verify package.json updated

### 8.3 Verify package.json
**Tasks**:
- [ ] Ensure no references to removed packages
- [ ] Ensure new packages are added
- [ ] Run `pnpm install` to update lockfile

---

## Phase 9: Documentation
**Status**: ⏳ Pending

### 9.1 Update CLAUDE.md

**Sections to update**:

#### Storage Architecture Section
- [ ] Replace S3 storage description with Cloudflare-native services
- [ ] Document Cloudflare Images for image storage
- [ ] Document Cloudflare Stream for video storage
- [ ] Document R2 native bindings for audio/files
- [ ] Document flexible variants (dynamic image transformations)
- [ ] Document virtual fields pattern for URL generation

#### Collections Section
- [ ] Update Media → Images collection description
- [ ] Update FileAttachments → Files collection description
- [ ] Update Frames collection to mention Cloudflare Stream thumbnails
- [ ] Update collection slugs in all references

#### Environment Variables Section
- [ ] Add Cloudflare service variables:
  ```markdown
  **Cloudflare Images (Production Only)**
  - `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
  - `CLOUDFLARE_IMAGES_API_TOKEN` - API token for Images (set via wrangler secret put)
  - `CLOUDFLARE_IMAGES_ACCOUNT_HASH` - Images account hash from dashboard

  **Cloudflare Stream (Production Only)**
  - `CLOUDFLARE_STREAM_API_TOKEN` - API token for Stream (set via wrangler secret put)
  - `CLOUDFLARE_STREAM_CUSTOMER_CODE` - Stream customer code from dashboard
  ```
- [ ] Remove S3 variables section
- [ ] Add note about production-only Cloudflare services with dev fallback

#### Finding Cloudflare Credentials Section
- [ ] Add instructions for finding Account ID (dashboard → Account Home → right sidebar)
- [ ] Add instructions for finding Images Account Hash (Images dashboard → look at delivery URL)
- [ ] Add instructions for finding Stream Customer Code (Stream dashboard → any video → look at player URL)
- [ ] Add instructions for creating API tokens

#### Troubleshooting Section
- [ ] Add troubleshooting for upload failures
- [ ] Add troubleshooting for missing thumbnails
- [ ] Add troubleshooting for video encoding delays
- [ ] Add troubleshooting for development environment (local storage fallback)

#### Remove Legacy Sections
- [ ] Remove Sharp processing documentation
- [ ] Remove FFmpeg thumbnail generation documentation
- [ ] Remove S3 storage configuration details

### 9.2 Update DEPLOYMENT.md

**Sections to add/update**:
- [ ] Add Cloudflare Images setup instructions
- [ ] Add Cloudflare Stream setup instructions
- [ ] Document API token creation process
- [ ] Add wrangler secret commands:
  ```bash
  wrangler secret put CLOUDFLARE_IMAGES_API_TOKEN
  wrangler secret put CLOUDFLARE_STREAM_API_TOKEN
  ```
- [ ] Update storage configuration section
- [ ] Add note about database reset post-migration

### 9.3 Update .env.example
**Already covered in Phase 1.2** - mark as complete when Phase 1.2 done

### 9.4 Create MIGRATION.md (Database Reset Instructions)
**File**: `MIGRATION.md` (new file)

**Content**:
```markdown
# Database Migration: Cloudflare Storage

## Overview
This migration introduces Cloudflare-native storage and changes collection slugs. A database reset is required.

## Breaking Changes
- Collection slugs changed: `media` → `images`, `file-attachments` → `files`
- API endpoints changed: `/api/media` → `/api/images`
- URL format changed: Old R2 URLs → Cloudflare CDN URLs

## Local Development Reset
1. Stop dev server
2. Delete local database: `rm local.db`
3. Restart dev server: `PORT=4567 pnpm dev`
4. PayloadCMS will auto-create new database with latest schema

## Production Database Reset
Option 1: Delete tables and re-run migrations
```bash
# Run migrations to create fresh schema
pnpm run deploy:database
```

Option 2: Create new D1 database (recommended)
1. Create new D1 database in Cloudflare dashboard
2. Update `wrangler.toml` with new database ID
3. Deploy: `pnpm run deploy:prod`
4. Delete old database after verification

## Verification
- [ ] Collections show correct slugs (images, files)
- [ ] Image uploads store Cloudflare Image IDs as filenames
- [ ] Video uploads store Cloudflare Stream IDs as filenames
- [ ] Thumbnails display for both images and videos
- [ ] Virtual fields populate URLs correctly
```

**Tasks**:
- [ ] Create MIGRATION.md file
- [ ] Document local database reset process
- [ ] Document production database reset options
- [ ] Add verification checklist

---

## Phase 10: Verification & Testing
**Status**: ⏳ Pending

### 10.1 Type Check
**Command**: `npx tsc --noEmit`

**Tasks**:
- [ ] Run type check
- [ ] Fix any TypeScript errors
- [ ] Verify all imports resolve correctly

### 10.2 Generate Types
**Command**: `pnpm generate:types`

**Tasks**:
- [ ] Run type generation (if schema changed)
- [ ] Verify payload-types.ts updated
- [ ] Check for any type errors

### 10.3 Lint
**Command**: `pnpm lint`

**Tasks**:
- [ ] Run ESLint
- [ ] Fix linting errors
- [ ] Fix linting warnings if possible

### 10.4 Run Integration Tests
**Command**: `pnpm test:int`

**Tasks**:
- [ ] Run all integration tests
- [ ] Fix failing tests
- [ ] Verify new virtual fields work
- [ ] Verify collection slug changes work

### 10.5 Run E2E Tests
**Command**: `pnpm test:e2e`

**Tasks**:
- [ ] Run E2E tests
- [ ] Fix failing tests
- [ ] Update tests for new admin UI paths

### 10.6 Build Check
**Command**: `pnpm build`

**Tasks**:
- [ ] Run production build
- [ ] Fix build errors
- [ ] Fix build warnings if possible
- [ ] Verify build output

---

## Phase 11: Create Branch & Commit
**Status**: ⏳ Pending

### 11.1 Create Branch
**Command**: `git checkout -b feat/cloudflare-native-storage`

**Tasks**:
- [ ] Create feature branch from main
- [ ] Verify clean working directory before starting

### 11.2 Commit Changes
**Strategy**: Commit after each major phase

**Planned commits**:
1. [ ] `feat: add Cloudflare storage adapters (Images, Stream, R2, Router)`
2. [ ] `feat: rename collections (media → images, file-attachments → files)`
3. [ ] `feat: add virtual fields for Cloudflare URLs`
4. [ ] `feat: remove Sharp and FFmpeg dependencies`
5. [ ] `refactor: clean up field utils and hooks`
6. [ ] `feat: update admin components for new storage`
7. [ ] `test: update tests for collection slug changes`
8. [ ] `docs: update documentation for Cloudflare storage`
9. [ ] `chore: update dependencies and environment variables`

**Tasks for each commit**:
- [ ] Stage relevant files
- [ ] Write descriptive commit message
- [ ] Run `pnpm generate:types` before committing (if schema changed)
- [ ] Run `pnpm lint` before committing

---

## Phase 12: Create Pull Request
**Status**: ⏳ Pending

### 12.1 Push Branch
**Command**: `git push origin feat/cloudflare-native-storage`

**Tasks**:
- [ ] Push feature branch to remote
- [ ] Verify all commits pushed

### 12.2 Create PR
**Command**: `gh pr create`

**PR Content**:
```markdown
# Implement Cloudflare-Native Storage

Closes #75

## Overview
Migrates from S3-compatible storage to Cloudflare-native services:
- Cloudflare Images for image storage (automatic WebP/AVIF optimization)
- Cloudflare Stream for video storage (automatic thumbnails, HLS streaming)
- R2 native bindings for audio files and generic files

## Breaking Changes
⚠️ **Database reset required**
- Collection slugs changed: `media` → `images`, `file-attachments` → `files`
- API endpoints changed: `/api/media` → `/api/images`
- URL format changed from R2 URLs to Cloudflare CDN URLs

## Changes
- Created 4 custom storage adapters (Images, Stream, R2 native, Router)
- Renamed collections (media → images, file-attachments → files)
- Added virtual fields for dynamic URL generation
- Removed Sharp and FFmpeg dependencies
- Updated all collection relationships
- Updated admin components (ThumbnailCell, MeditationFrameEditor)
- Updated tests with mocked Cloudflare APIs
- Comprehensive documentation updates

## Testing
- [x] Type check passes
- [x] Linting passes
- [x] Integration tests pass
- [x] E2E tests pass
- [x] Build succeeds

## Deployment Notes
1. Enable Cloudflare Images and Stream in dashboard
2. Create API tokens with appropriate permissions
3. Set secrets via `wrangler secret put`
4. Reset database (local and production)
5. Deploy with `pnpm run deploy:prod`

See MIGRATION.md for detailed database reset instructions.
```

**Tasks**:
- [ ] Create PR with descriptive title
- [ ] Add PR description with breaking changes
- [ ] Ensure PR includes "Closes #75"
- [ ] Request review

---

## Completion Checklist

### Code Changes
- [ ] All storage adapters implemented
- [ ] All collections updated and renamed
- [ ] All field utils cleaned up
- [ ] All admin components updated
- [ ] All tests updated and passing
- [ ] All dependencies updated

### Quality Checks
- [ ] TypeScript check passes
- [ ] Linting passes
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Build succeeds

### Documentation
- [ ] CLAUDE.md updated
- [ ] DEPLOYMENT.md updated
- [ ] .env.example updated
- [ ] MIGRATION.md created

### Git
- [ ] All changes committed
- [ ] Branch pushed to remote
- [ ] PR created with "Closes #75"

---

## Notes & Decisions

### Production-Only Cloudflare Services
- Cloudflare Images/Stream only used in production
- Development environment falls back to local file storage
- No Cloudflare credentials needed for local development

### Virtual Fields Pattern
- URLs computed dynamically using afterRead hooks
- No database storage for URLs (prevents stale data)
- Environment variables used for Cloudflare account info

### Database Reset Strategy
- No data migration needed (fresh start)
- Simpler than maintaining backward compatibility
- Local: `rm local.db`
- Production: Create new D1 database or drop tables

### Test Mocking Strategy
- Tests use local file storage (no Cloudflare API calls)
- Mock environment variables for URL generation
- No real API integration in tests

---

**Last Updated**: 2025-12-03
