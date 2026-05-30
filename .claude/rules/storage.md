---
paths:
  - src/lib/storage/**/*.ts
  - src/app/(payload)/api/webhooks/**/*.ts
---

# Storage architecture

The application uses Cloudflare-native storage in production with automatic
local-file fallback in development.

## Routing matrix

| Storage               | Collections                                                                                                                   | URL format                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Images** | `images` (uploads); also referenced from albums, app-cards, meditations, lectures, authors, lessons, page blocks              | `https://imagedelivery.net/<hash>/<imageId>/public`                                                                                                                                       |
| **Cloudflare Stream** | `videos`, `frames` (video MIME types)                                                                                         | thumbnails: `https://customer-<code>.cloudflarestream.com/<videoId>/thumbnails/thumbnail.jpg`<br>MP4: `.../downloads/default.mp4` (`mp4Url`)<br>HLS: `.../manifest/video.m3u8` (`hlsUrl`) |
| **R2 native binding** | `meditations`, `songs`, `lessons`, `files`, `user-choices`, `song-tags`, plus mixed-media fallthrough on `frames` and `files` | `<CLOUDFLARE_R2_DELIVERY_URL>/<collection>/<filename>`                                                                                                                                    |

R2 is configured via `wrangler.toml` bindings (no S3-compatible API).
Filenames are sanitized to URL-safe slugs with random 6-char suffixes.

Development falls back to local file storage when Cloudflare credentials
are unset — no setup required.

## Module layout (`src/lib/storage/`)

| File                         | Purpose                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `storagePlugin.ts`           | Plugin orchestration, adapter routing, R2 hook injection                       |
| `cloudflareImagesAdapter.ts` | Image uploads to Cloudflare Images                                             |
| `cloudflareStreamAdapter.ts` | Video uploads to Cloudflare Stream (does NOT enable downloads — webhook does)  |
| `cloudflareStreamWebhook.ts` | Pure helpers for the webhook handler (signature verify + downloads call)       |
| `cloudflareSchemas.ts`       | Zod schemas for all Cloudflare API responses (Images, Stream, webhook payload) |
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
| `mixedMediaUrlField({ collection })`               | Full-resolution URL for mixed media (images → Images, videos → Stream MP4, other → R2)             |
| `hlsUrlField({ collection })`                      | HLS manifest (`hlsUrl`); `null` for non-video. Mount on every collection that exposes a video URL. |
| `mp4UrlField({ collection })`                      | MP4 download (`mp4Url`); `null` for non-video. Mount alongside `hlsUrlField`.                      |

## R2 native adapter (`r2NativeAdapter.ts`)

```typescript
r2NativeAdapter({
  bucket: env.R2,
  publicUrl: process.env.CLOUDFLARE_R2_DELIVERY_URL,
})
```

**`CLOUDFLARE_R2_DELIVERY_URL` is per-env.** It's set in each `wrangler.toml` env block — prod uses the custom domain `https://assets.sydevelopers.com`, preview uses the default R2 dev URL `https://pub-<hash>.r2.dev`, and dev/E2E leave it empty. Cloned preview rows still reference the prod CDN URL (preview's Worker has no binding to the prod bucket, so it never writes there) — see [DEPLOYMENT.md → Preview Environment](../../DEPLOYMENT.md#preview-environment) for the file-protection invariant.

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

## Cloudflare Stream webhook

Cloudflare Stream uploads are not immediately playable as MP4 — the
`/<uid>/downloads/default.mp4` URL returns 404 until MP4 downloads are
explicitly enabled, and that API rejects the request until
`readyToStream: true`. We can't enable downloads synchronously inside
the storage adapter; instead we subscribe to the account-scoped Stream
webhook and enable downloads from a signed handler once Cloudflare
notifies us the video is ready.

### Architecture

```
Admin upload
   │
   ▼
cloudflareStreamAdapter.handleUpload
   │  POST /accounts/{id}/stream    (upload bytes)
   │  ◄── { uid, readyToStream: false }
   │  filename set to uid, document saved
   ▼
(Cloudflare transcodes in the background)
   │
   ▼
Cloudflare Stream
   │  POST https://cloud.sydevelopers.com/api/webhooks/cloudflare-stream
   │  Webhook-Signature: time=<unix>,sig1=<hmac-sha256-hex>
   │  body = full video object
   ▼
Webhook route handler (src/app/(payload)/api/webhooks/cloudflare-stream/route.ts)
   │  1. Read raw body via request.text() BEFORE parsing
   │  2. Verify HMAC-SHA256 over `${time}.${rawBody}` (constant-time)
   │  3. Parse with Zod
   │  4. If status.state === "ready": POST /accounts/{id}/stream/{uid}/downloads
   │  5. Respond 200 (Cloudflare retries on non-2xx)
   ▼
Video has MP4 URL
```

### Security

- **HMAC-SHA256** signature over `{time}.{rawBody}`, keyed with
  `CLOUDFLARE_STREAM_WEBHOOK_SECRET`.
- **5-minute freshness window** on the timestamp — past or future stale
  values are rejected (replay protection).
- **Constant-time comparison** on the hex signature (timing-attack safe).
- Raw body read via `request.text()` _before_ any JSON parse, so the
  bytes used for HMAC verification are byte-identical to what Cloudflare
  signed.
- Web Crypto (`crypto.subtle`) — same code path runs in Workers and in
  vitest.

### One-time production setup

```bash
# 1. Register the webhook
export CLOUDFLARE_ACCOUNT_ID=<prod-account-id>
export CLOUDFLARE_API_KEY=<token-with-stream-edit>

pnpm tsx scripts/setup-stream-webhook.ts \
  --url https://cloud.sydevelopers.com/api/webhooks/cloudflare-stream
# prints the signing secret

# Inspect current registration without changing
pnpm tsx scripts/setup-stream-webhook.ts --get

# 2. Store the secret in Workers
wrangler secret put CLOUDFLARE_STREAM_WEBHOOK_SECRET

# 3. Redeploy
pnpm run deploy:prod
```

If a different URL is already registered, the script refuses and prints
the current value. Pass `--force` to override.

### Verify end-to-end

1. Log into admin at `https://cloud.sydevelopers.com/admin`.
2. Upload a small test video (videos / frames / files).
3. `wrangler tail sahajcloud --format pretty` — expect:
   - `Uploading video to Cloudflare Stream`
   - `Video uploaded successfully`
   - 15–60 s later: `MP4 downloads enabled via webhook`
4. The document's `url` virtual field should resolve to
   `https://customer-aorobtik2fce41s5.cloudflarestream.com/<uid>/downloads/default.mp4`.

### Dev environment

Dev does **not** subscribe to the webhook and **does not** auto-enable MP4
downloads. The webhook is account-scoped — if dev registered its own URL,
the next production upload would silently fail until prod was
re-registered.

The route handler is still deployed in dev, but without
`CLOUDFLARE_STREAM_WEBHOOK_SECRET` set it returns 503 for any POST.

**Trade-off**: dev-uploaded videos have broken MP4 URLs until enabled
manually. For local QA needing a working MP4, upload against production
or backfill the specific video.

### Manual backfill

For videos uploaded before the webhook was wired up, or for dev uploads
that need to play:

```bash
export CLOUDFLARE_ACCOUNT_ID=<account-id>
export CLOUDFLARE_API_KEY=<token-with-stream-edit>
export VIDEO_UID=<the-videos-filename-field>

curl -X POST \
  -H "Authorization: Bearer ${CLOUDFLARE_API_KEY}" \
  https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${VIDEO_UID}/downloads
```

The video's `filename` field in Payload is the Stream UID.

### Debugging

- `wrangler tail sahajcloud --format pretty`
- Look for `MP4 downloads enabled via webhook` (success) or
  `Failed to enable MP4 downloads` / `Cloudflare Stream reported processing error`.
- A 400/401 from the webhook usually means the signing secret in Workers
  doesn't match what Cloudflare has — re-run
  `scripts/setup-stream-webhook.ts --get` and compare.
- Cloudflare retries non-2xx with exponential backoff, so transient errors
  recover on their own.

### Webhook key files

- `src/app/(payload)/api/webhooks/cloudflare-stream/route.ts` — Next.js
  POST handler (thin wrapper, see `routes.md`)
- `src/lib/storage/cloudflareStreamWebhook.ts` — pure helpers
  (`parseSignatureHeader`, `verifySignature`, `handleStreamWebhook`)
- `src/lib/storage/cloudflareSchemas.ts` —
  `CloudflareStreamWebhookPayloadSchema`
- `scripts/setup-stream-webhook.ts` — setup / teardown script
- `tests/int/cloudflare-stream-webhook.int.spec.ts` — handler unit tests

## External Cloudflare API response validation (Zod)

Use Zod schemas for runtime validation of Cloudflare API responses
(catches API contract changes at the boundary; type-only assertions
silently miss those). Centralize schemas in
`src/lib/storage/cloudflareSchemas.ts` and parse with `.parse()` rather
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
