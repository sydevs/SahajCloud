---
paths:
  - src/plugins/storage/**/*.ts
---

# Storage architecture

The application uses Cloudflare-native storage in production with automatic
local-file fallback in development.

## Routing matrix

| Storage               | Collections                                                                                                                   | URL format                                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Images** | `images` (uploads); also referenced from albums, app-cards, meditations, lectures, authors, lessons, page blocks              | `https://imagedelivery.net/<hash>/<imageId>/public`                                                                                                                                                                               |
| **Cloudflare Stream** | `videos`, `frames` (video MIME types)                                                                                         | thumbnails: `https://customer-<code>.cloudflarestream.com/<videoId>/thumbnails/thumbnail.jpg`<br>HLS: `.../manifest/video.m3u8` (`hlsUrl`, also the generic `url` for video files) |
| **R2 (S3 API)**       | `meditations`, `songs`, `lessons`, `files`, `user-choices`, `song-tags`, plus mixed-media fallthrough on `frames` and `files` | `<CLOUDFLARE_R2_DELIVERY_URL>/<collection>/<filename>`                                                                                                                                                                            |

R2 is configured via S3-compatible API (`@aws-sdk/client-s3`) with environment variables (R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).
Filenames are sanitized to URL-safe slugs with random 6-char suffixes.

Development falls back to local file storage when Cloudflare credentials
are unset — no setup required.

## Module layout (`src/plugins/storage/`)

| File                         | Purpose                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `storagePlugin.ts`           | Plugin orchestration, adapter routing, R2 hook injection                       |
| `cloudflareImagesAdapter.ts` | Image uploads to Cloudflare Images                                             |
| `cloudflareStreamAdapter.ts` | Video uploads to Cloudflare Stream (transcoding, HLS, thumbnails)              |
| `cloudflareSchemas.ts`       | Zod schemas for all Cloudflare API responses (Images, Stream)                  |
| `r2NativeAdapter.ts`         | Custom R2 adapter with filename sanitization                                   |
| `r2FilenameHook.ts`          | `beforeOperation` hook that pre-assigns the final R2 key                       |
| `mixedMediaAdapter.ts`       | Routes by MIME type → Images/Stream/R2                                         |
| `mimeUtils.ts`               | Shared `getMimeCategory()` used by adapter and URL field                       |
| `urlFields.ts`               | Virtual URL field factories                                                    |

## URL field factories (`urlFields.ts`)

```typescript
fields: [
  virtualUrlField({ collection: 'meditations', adapter: 'r2' }),
  mixedMediaUrlField({ collection: 'files' }),
  previewUrlField({ collection: 'files', width: 320, height: 320 }),
]
```

| Factory                                            | Purpose                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `virtualUrlField({ collection, adapter })`         | Base URL for any single-storage collection (adapter: `cloudflare-images` or `r2`)                  |
| `previewUrlField({ collection, width?, height? })` | Preview/thumbnail URL for images/videos                                                            |
| `mixedMediaUrlField({ collection })`               | Full-resolution URL for mixed media (images → Images, videos → Stream HLS manifest, other → R2)    |
| `hlsUrlField({ collection })`                      | HLS manifest (`hlsUrl`); `null` for non-video. Mount on every collection that exposes a video URL. |

## R2 S3 adapter (`r2NativeAdapter.ts`)

`storagePlugin.ts` builds the S3 client and passes it to the adapter:

```typescript
const client = new S3Client({
  region: 'auto',
  // R2_S3_ENDPOINT overrides this for jurisdiction-specific buckets (e.g. EU:
  // https://<accountId>.eu.r2.cloudflarestorage.com). The native binding hid the
  // jurisdiction; the S3 API needs the exact endpoint or the bucket 404s.
  endpoint:
    serverEnv.R2_S3_ENDPOINT ??
    `https://${serverEnv.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: serverEnv.R2_ACCESS_KEY_ID,
    secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY,
  },
})

r2NativeAdapter({
  client,
  bucket: serverEnv.R2_BUCKET,
  publicUrl: serverEnv.CLOUDFLARE_R2_DELIVERY_URL,
})
```

**`CLOUDFLARE_R2_DELIVERY_URL` is per-env**: prod uses `https://assets.sydevelopers.com`, dev/staging uses a different delivery domain. Endpoint and credentials come from environment variables set in Railway or `.env`.

**Filename sanitization** (every upload):

1. Extract base name + extension.
2. Slugify base (lowercase, URL-safe, strict mode).
3. Append a 6-char random suffix for uniqueness.
4. Preserve original extension.

Example: `"My Audio File (1).mp3"` → `"my-audio-file-1-xk2j9s.mp3"`.

## R2 filename preassignment hook (`r2FilenameHook.ts`)

`@payloadcms/plugin-cloud-storage` writes the document `filename` in
`beforeChange`, then runs the storage adapter's actual upload in
`afterChange`. If the adapter sanitizes the filename (which `r2NativeAdapter`
does), the DB row briefly disagrees with the R2 key. The plugin patches
this with a follow-up `payload.update()` from the adapter's return value —
but if that update fails (we observed real production drift on ~15 % of
meditations), the DB ends up pointing at a non-existent R2 key.

The fix: a `beforeOperation` hook (`createR2FilenameBeforeOperationHook`)
runs **before** Payload derives upload metadata and pre-generates the
final R2 key from `req.file.name`. The adapter checks
`req.context._r2PreassignedFilename` and skips its own slugify pass to
avoid double-suffixing.

`storagePlugin.ts` injects the hook into every R2-backed collection.
Two modes:

- `'always'` — pure-R2 collections: `meditations`, `songs`, `user-choices`, `song-tags`.
- `'other-only'` — mixed-media (`frames`, `files`) — Images / Stream
  filenames are left untouched (those services generate their own IDs);
  only the "other" fallthrough goes through R2 sanitization.

⚠️ The mode dictionary (`r2FilenameHookModes`) is a parallel registry to
the `cloudStoragePlugin` collections block. Keep them in sync when
adding a new R2-backed collection — otherwise filename drift silently
returns.

## `handleUpload` return-value contract (critical)

`@payloadcms/plugin-cloud-storage` v3 calls `adapter.handleUpload` in an
**afterChange** hook — _after_ the document has already been written to
the DB. The plugin persists filename/metadata changes only via the
adapter's **return value**, which it merges and passes to
`payload.update()`:

```js
// node_modules/@payloadcms/plugin-cloud-storage/dist/hooks/afterChange.js
const uploadResults = await Promise.all(
  files.map(f => adapter.handleUpload({ data: doc, file: f, req })),
)
const uploadMetadata = uploadResults.filter(r => r != null).reduce(...)
if (Object.keys(uploadMetadata).length > 0) {
  await req.payload.update({ id: doc.id, collection: slug, data: uploadMetadata, ... })
}
```

For new or modified adapters:

- **Return `{ filename, fileMetadata }`** (or whatever changed). Without
  a return value, **nothing persists**.
- **Mutating `data.filename` / `file.filename` is insufficient for
  persistence.** `data` here is the already-saved doc; mutation only
  affects the in-memory copy seen by downstream afterChange hooks in the
  same request.
- **Do keep the mutations anyway** — they keep the in-memory doc
  consistent with what the follow-up `payload.update()` will write, so
  subsequent hooks don't see a stale filename.
- **Do not** write comments claiming mutation "persists to DB via
  pass-by-reference." It doesn't. Previous adapter versions carried that
  false comment and a working `afterChange` hook was removed on the
  strength of it (commit `c6d1b37`, see #276).

```typescript
handleUpload: async ({ data, file, req }) => {
  const imageId = await uploadToCloudflare(file)

  // mirror in-memory so downstream hooks see the new filename
  file.filename = imageId
  if (data) data.filename = imageId

  // THIS is what persists to the DB
  return { filename: imageId, fileMetadata: { originalFilename: file.filename } }
},
```

When adding a new adapter, grep
`node_modules/@payloadcms/plugin-cloud-storage/dist/hooks/afterChange.js`
to confirm the contract hasn't changed in a version bump.

## Storage adapter naming

- **Adapter**: `<purpose>Adapter` (`mixedMediaAdapter`, `cloudflareImagesAdapter`)
- **URL field factory**: `<purpose>UrlField` (`mixedMediaUrlField`, `virtualUrlField`)
- **Config interface**: `<AdapterName>Config` (`MixedMediaAdapterConfig`)

When adapter and URL field need identical routing logic, extract a shared
utility (e.g. `mimeUtils.getMimeCategory()`).

## Video thumbnails

For video frames, thumbnails are generated at upload time at 0.1s into
the video using `ffmpeg-static` + Sharp (320×320 WebP) and added to
`req.payloadUploadSizes.small`. Payload's storage adapter handles
uploading the thumbnail file and generating its URL automatically; the
file is deleted alongside the parent Frame.

`ThumbnailCell` and `FrameItem` admin components display thumbnails from
`sizes.small.url`. Falls back to a video element if generation fails.

Implementation: `src/lib/videoThumbnailUtils.ts`.

## External Cloudflare API response validation (Zod)

Use Zod schemas for runtime validation of Cloudflare API responses
(catches API contract changes at the boundary; type-only assertions
silently miss those). Centralize schemas in
`src/plugins/storage/cloudflareSchemas.ts` and parse with `.parse()` rather
than asserting types.

```typescript
import { z } from 'zod'

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  errors: z
    .array(
      z.object({
        code: z.number().optional(),
        message: z.string(),
      }),
    )
    .default([]),
  result: z
    .object({
      id: z.string().min(1),
      name: z.string().optional(),
      created: z.string().optional(),
    })
    .optional(), // optional when success: false
})

try {
  const result = ApiResponseSchema.parse(await response.json())
  if (!result.success) {
    const errors = result.errors.map((e) => e.message).join(', ')
    throw new Error(`API failed: ${errors}`)
  }
  return result.result.id
} catch (error) {
  if (error instanceof z.ZodError) {
    payload.logger.error({ msg: 'API response validation failed', validationIssues: error.issues })
    throw new Error(`API response validation failed: ${error.message}`)
  }
  throw error
}
```

Schema design tips:

- Mark top-level `result` optional (absent on `success: false`).
- Use `.default([])` on arrays to drop optional chaining at use sites.
- Require critical fields inside `result` (e.g. `id: z.string().min(1)`).
- Use `.url()` for URL fields, `.enum()` for fixed values.

Use Zod for **external** APIs and webhook payloads. Don't use it for
internal PayloadCMS collections (already validated) or for trivial
boolean/string checks where it would be overkill.
