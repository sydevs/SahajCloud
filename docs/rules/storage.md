---
paths:
  - src/plugins/storage/**/*.ts
  - src/app/(payload)/api/webhooks/**/*.ts
---

# Storage architecture

Production uses Cloudflare-native storage. Development falls back to local files automatically.

## Routing matrix

| Storage | Collections | URL format |
| --- | --- | --- |
| **Cloudflare Images** | `images` (uploads), also referenced from albums, app-cards, meditations, lectures, authors, lessons, page blocks | `https://imagedelivery.net/<hash>/<imageId>/public` |
| **Cloudflare Stream** | `videos`, `frames` (video MIME types) | thumbnails: `.../thumbnails/thumbnail.jpg`. HLS: `.../manifest/video.m3u8` (`hlsUrl`, also the generic `url`). MP4: `.../downloads/default.mp4` (`mp4Url`) |
| **R2 (S3 API)** | `meditations`, `songs`, `lessons`, `files`, `user-choices`, `song-tags`, plus mixed-media fallthrough on `frames`/`files` | `<CLOUDFLARE_R2_DELIVERY_URL>/<collection>/<filename>` |

R2 uses the S3-compatible API (`@aws-sdk/client-s3`) with `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Filenames are slugified to URL-safe names with a random 6-char suffix. With no Cloudflare credentials set, development falls back to local file storage — no setup needed.

## Preview / non-production isolation

Cloudflare Images and Stream are account-scoped, and R2 is one shared bucket, so **every deployment — production, Railway PR previews, staging, dev — reads and writes the same namespaces.** Preview databases are sanitized clones of production, so they reference real prod asset IDs. Without a guard, a preview deploy could upload into the prod namespace, or worse, **delete a production asset** (#432).

`previewIsolation.ts` fixes this by namespacing within the single account, and is a **no-op in production**:

| Backend | Non-prod upload marker | Delete guard (non-prod) |
| --- | --- | --- |
| Cloudflare Images | `preview-` prefix on the custom ID | Refuses IDs without the prefix |
| R2 | `preview-` prefix on the object key | Refuses keys without the prefix |
| Cloudflare Stream | `meta.env=preview` tag (UIDs aren't caller-set) | GETs the video, refuses unless tagged |

**"Is this production?" keys off the Railway environment name, not `NODE_ENV` and not the origin.** Railway previews run with `NODE_ENV=production`, and they inherit the shared `SAHAJCLOUD_URL` variable, so neither can tell prod and preview apart. `isProductionDeployment()` is true only when `RAILWAY_ENVIRONMENT_NAME` (fallback `RAILWAY_ENVIRONMENT`) equals `production` — PR previews are `pr-<number>` (see `RAILWAY_RUNBOOK.md`). It **fails safe**: any other or unknown name is treated as non-production, so the guard stays active. The only failure mode is prod self-isolating from a misnamed environment — loud, never destructive.

**The delete guard is the safety mechanism.** In non-prod, each adapter's `handleDelete` refuses any asset without the preview marker, so a preview can never delete a cloned prod asset. Production short-circuits the guard and behaves exactly as before. Proven by `tests/unit/storageIsolationGuard.spec.ts`. The image upload path is smoke-tested in `tests/e2e/images.e2e.spec.ts`.

⚠ **An un-namespaced preview upload looks exactly like real prod data**, and can then be swept by cleanup or kept forever — the marker is the only thing that tells the two apart, so a new upload path must set it.

**Cleanup.** Preview uploads accumulate in the shared account/bucket. A daily GitHub Actions job (`.github/workflows/cleanup-preview-assets.yml` → `scripts/cleanup-preview-assets.ts`) reaps preview-marked assets older than 7 days across all three backends. `isReapablePreviewAsset` only deletes an asset that is **both** marked **and** past the cutoff. The script defaults to a dry run (`--apply` deletes for real).

**Config, split by sensitivity.** Only the token is a GitHub *secret*. The rest are *variables*, unmasked in the run log — a masked `R2_BUCKET: ***` makes an R2 403 unreadable.

| Name | Kind | Required |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | secret | yes |
| `CLOUDFLARE_API_KEY` | secret | yes |
| `R2_BUCKET` | variable | yes |
| `R2_JURISDICTION` | workflow env | only for a jurisdiction-bound bucket |

The script exits 1 with any of the required three missing — deliberately, since a cleanup that silently reaps nothing is worse than one that fails loudly.

**One token, four surfaces.** Alongside Images (Edit), Stream (Edit), and R2 (Object Read & Write), `CLOUDFLARE_API_KEY` also carries **Browser Rendering** (Read & Write) — not storage, but how `VerifyEmbeds` confirms a client's embed actually booted before its mount can own a canonical URL (`src/lib/embedVerification/`, `docs/rules/api-clients.md`). It shares the token because it shares the account. If that permission is ever dropped, the verifier degrades to `inconclusive: 'not-configured'`, changing and disabling nothing — confirm the job's logs first if canonical verification stalls.

**One token, three storage backends.** The cleanup script takes no R2 key pair of its own. R2's `Object Read & Write` permission is honoured only by the S3-compatible API, so `r2Credentials.ts` derives the pair from `CLOUDFLARE_API_KEY`: access key = the token's id, secret = **hex** SHA-256 of the token value. Any other digest encoding fails as an opaque `SignatureDoesNotMatch`. Two facts here only fail against the live API, so both are pinned in `tests/unit/r2-credentials.spec.ts`. The id lives under one verify scope only (`/accounts/<id>/tokens/verify` then `/user/tokens/verify`, since the wrong scope answers the same `Invalid API Token` as a bad one). A jurisdiction-bound bucket lives on its own host (R2 answers `AccessDenied`, not 404, on the default host — set `R2_JURISDICTION`). This is the script's own contract. The app's R2 adapter still uses `serverEnv.R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_S3_ENDPOINT`, unchanged.

### Manual safety verification (one-time, per #432 AC)

1. In the preview admin, find an image whose `filename` has **no** `preview-` prefix (cloned from prod).
2. Delete it from the preview admin.
3. Confirm the underlying Cloudflare image still resolves at `imagedelivery.net/<hash>/<id>/public` — the admin row is gone, but the shared prod asset survives.

## Module layout (`src/plugins/storage/`)

| File | Purpose |
| --- | --- |
| `storagePlugin.ts` | Plugin orchestration, adapter routing, R2 hook injection |
| `cloudflareImagesAdapter.ts` | Image uploads to Cloudflare Images |
| `cloudflareStreamAdapter.ts` | Video uploads to Cloudflare Stream (does not enable downloads — the webhook does) |
| `cloudflareStreamWebhook.ts` | Pure helpers for the webhook handler (signature verify + downloads call) |
| `cloudflareSchemas.ts` | Zod schemas for Cloudflare API responses |
| `r2NativeAdapter.ts` | Custom R2 adapter with filename sanitization |
| `r2FilenameHook.ts` | `beforeOperation` hook that pre-assigns the final R2 key |
| `mixedMediaAdapter.ts` | Routes by MIME type to Images/Stream/R2 |
| `mimeUtils.ts` | Shared `getMimeCategory()` |
| `urlFields.ts` | Virtual URL field factories |

## URL field factories (`urlFields.ts`)

```typescript
fields: [
  virtualUrlField({ collection: 'meditations', adapter: 'r2' }),
  mixedMediaUrlField({ collection: 'files' }),
  previewUrlField({ collection: 'files', width: 320, height: 320 }),
]
```

| Factory | Purpose |
| --- | --- |
| `virtualUrlField({ collection, adapter })` | Base URL for a single-storage collection |
| `previewUrlField({ collection, width?, height? })` | Preview/thumbnail URL for images/videos |
| `mixedMediaUrlField({ collection })` | Full-resolution URL for mixed media |
| `hlsUrlField({ collection })` | HLS manifest (`hlsUrl`), `null` for non-video |
| `mp4UrlField({ collection })` | MP4 download (`mp4Url`), `null` for non-video |

## R2 S3 adapter (`r2NativeAdapter.ts`)

`storagePlugin.ts` builds the S3 client and passes it in:

```typescript
const client = new S3Client({
  region: 'auto',
  // R2_S3_ENDPOINT overrides this for a jurisdiction-specific bucket (e.g. EU).
  // The native binding hid the jurisdiction; the S3 API needs the exact endpoint or the bucket 404s.
  endpoint: serverEnv.R2_S3_ENDPOINT ?? `https://${serverEnv.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: serverEnv.R2_ACCESS_KEY_ID,
    secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY,
  },
})
```

`CLOUDFLARE_R2_DELIVERY_URL` is per-env: prod uses `https://assets.sydevelopers.com`, and dev/staging use a different delivery domain.

**Filename sanitization**, on every upload: extract the base name and extension, slugify the base (lowercase, URL-safe, strict), and append a 6-char random suffix, keeping the original extension. Example: `"My Audio File (1).mp3"` → `"my-audio-file-1-xk2j9s.mp3"`.

## R2 filename preassignment hook (`r2FilenameHook.ts`)

`@payloadcms/plugin-cloud-storage` writes the document `filename` in `beforeChange`, then runs the adapter's upload in `afterChange`. Since `r2NativeAdapter` sanitizes the filename, the DB row briefly disagrees with the R2 key. The plugin patches this with a follow-up `payload.update()` — but when that update fails (~15% of meditations, observed in production), the DB ends up pointing at a non-existent R2 key.

The fix is a `beforeOperation` hook (`createR2FilenameBeforeOperationHook`) that pre-generates the final R2 key from `req.file.name` before Payload derives upload metadata. The adapter confirms `req.context._r2PreassignedFilename` is set and skips its own slugify pass, to avoid double-suffixing.

`storagePlugin.ts` injects the hook into every R2-backed collection, in two modes: `'always'` for pure-R2 collections (`meditations`, `songs`, `user-choices`, `song-tags`), and `'other-only'` for mixed media (`frames`, `files`), where Images/Stream filenames are left alone and only the "other" fallthrough goes through R2.

⚠️ The mode dictionary (`r2FilenameHookModes`) is a second registry, parallel to the `cloudStoragePlugin` collections block. Keep them in sync when adding an R2-backed collection, or filename drift returns silently.

## `handleUpload` return-value contract (critical)

`@payloadcms/plugin-cloud-storage` v3 calls `adapter.handleUpload` in an **afterChange** hook, after the document is already written to the DB. It persists filename/metadata changes only through the adapter's **return value**, which it merges into a `payload.update()`:

```js
// node_modules/@payloadcms/plugin-cloud-storage/dist/hooks/afterChange.js
const uploadResults = await Promise.all(files.map(f => adapter.handleUpload({ data: doc, file: f, req })))
const uploadMetadata = uploadResults.filter(r => r != null).reduce(...)
if (Object.keys(uploadMetadata).length > 0) {
  await req.payload.update({ id: doc.id, collection: slug, data: uploadMetadata, ... })
}
```

For a new or modified adapter:

- **Return `{ filename, fileMetadata }`** (or whatever changed). With no return value, nothing persists.
- **Mutating `data.filename` / `file.filename` does not persist it.** `data` is the already-saved doc. The mutation only affects the in-memory copy seen by later `afterChange` hooks in the same request.
- **Keep the mutations anyway** — they keep the in-memory doc consistent with what the follow-up update will write, so later hooks don't see a stale filename.
- **Never write a comment claiming the mutation "persists via pass-by-reference."** It doesn't. A false comment like that once cost a working `afterChange` hook (commit `c6d1b37`, #276).

```typescript
handleUpload: async ({ data, file, req }) => {
  const imageId = await uploadToCloudflare(file)
  file.filename = imageId          // mirror in-memory, for downstream hooks
  if (data) data.filename = imageId
  return { filename: imageId, fileMetadata: { originalFilename: file.filename } }  // THIS persists
},
```

When adding a new adapter, grep `node_modules/@payloadcms/plugin-cloud-storage/dist/hooks/afterChange.js` to confirm the contract hasn't changed in a version bump.

## Storage adapter naming

Adapter: `<purpose>Adapter` (`mixedMediaAdapter`). URL field factory: `<purpose>UrlField` (`mixedMediaUrlField`). Config interface: `<AdapterName>Config`. When an adapter and its URL field need identical routing logic, extract a shared utility (`mimeUtils.getMimeCategory()`).

## Video thumbnails

Frame thumbnails generate at upload time, at 0.1s into the video, using `ffmpeg-static` and Sharp (320×320 WebP), added to `req.payloadUploadSizes.small`. Payload's storage adapter uploads the thumbnail and generates its URL automatically. It is deleted alongside the parent Frame. `ThumbnailCell` and `FrameItem` display it from `sizes.small.url`, falling back to a video element if generation fails. Implementation: `src/lib/videoThumbnailUtils.ts`.

## Cloudflare Stream webhook

A Stream upload is not immediately playable as MP4: `/<uid>/downloads/default.mp4` 404s until MP4 downloads are explicitly enabled, and that API rejects the request until `readyToStream: true`. Downloads can't be enabled synchronously inside the storage adapter, so the app subscribes to the account-scoped Stream webhook and enables downloads from a signed handler once Cloudflare reports the video ready.

```
Admin upload → cloudflareStreamAdapter.handleUpload → POST /accounts/{id}/stream
  ← { uid, readyToStream: false }; filename set to uid, document saved
Cloudflare transcodes in the background
  → POST https://cloud.sydevelopers.com/api/webhooks/cloudflare-stream
    Webhook-Signature: time=<unix>,sig1=<hmac-sha256-hex>, body = full video object
Webhook route handler (src/app/(payload)/api/webhooks/cloudflare-stream/route.ts):
  1. Read the raw body via request.text() before parsing.
  2. Verify HMAC-SHA256 over `${time}.${rawBody}` (constant-time).
  3. Parse with Zod.
  4. If status.state === "ready": POST /accounts/{id}/stream/{uid}/downloads.
  5. Respond 200 (Cloudflare retries on non-2xx).
```

**Security**: HMAC-SHA256 over `{time}.{rawBody}`, keyed with `CLOUDFLARE_STREAM_WEBHOOK_SECRET`. A 5-minute freshness window on the timestamp gives replay protection. The signature comparison is constant-time. The raw body is read via `request.text()` before any JSON parse, so the HMAC bytes match exactly what Cloudflare signed. Web Crypto (`crypto.subtle`) runs the same code path in Node and in Vitest.

### One-time production setup

```bash
export CLOUDFLARE_ACCOUNT_ID=<prod-account-id>
export CLOUDFLARE_API_KEY=<token-with-stream-edit>

pnpm tsx scripts/setup-stream-webhook.ts \
  --url https://cloud.sydevelopers.com/api/webhooks/cloudflare-stream
# prints the signing secret; --get inspects the current registration

# Store the printed secret as the Railway service variable
# CLOUDFLARE_STREAM_WEBHOOK_SECRET, then redeploy.
```

If a different URL is already registered, the script refuses and prints it. Pass `--force` to override.

### Verify end-to-end

Log into `https://cloud.sydevelopers.com/admin`, upload a small test video, then check `railway logs` for `Uploading video to Cloudflare Stream`, `Video uploaded successfully`, and — 15 to 60 seconds later — `MP4 downloads enabled via webhook`. The `url`/`hlsUrl` fields resolve immediately. `mp4Url` resolves once the webhook fires.

### Dev environment

Dev does **not** subscribe to the webhook and does not auto-enable MP4 downloads — the webhook is account-scoped, and a dev registration would break the next production upload until re-registered. The route handler is still deployed in dev, but returns 503 for any POST when `CLOUDFLARE_STREAM_WEBHOOK_SECRET` is unset. **Trade-off**: dev-uploaded videos have broken MP4 URLs until enabled manually. For a working MP4 locally, upload against production or backfill the specific video.

### Manual backfill

For a video uploaded before the webhook was wired up, or a dev upload that needs to play:

```bash
export CLOUDFLARE_ACCOUNT_ID=<account-id>
export CLOUDFLARE_API_KEY=<token-with-stream-edit>
export VIDEO_UID=<the-videos-filename-field>

curl -X POST -H "Authorization: Bearer ${CLOUDFLARE_API_KEY}" \
  https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${VIDEO_UID}/downloads
```

### Debugging

Check `railway logs` for `MP4 downloads enabled via webhook` (success) or `Failed to enable MP4 downloads` / `Cloudflare Stream reported processing error`. A 400/401 usually means the Railway signing secret doesn't match Cloudflare's — compare against `scripts/setup-stream-webhook.ts --get`. Cloudflare retries non-2xx with backoff, so transient errors recover on their own.

### Webhook key files

`src/app/(payload)/api/webhooks/cloudflare-stream/route.ts` (Next.js handler, see `routes.md`), `src/plugins/storage/cloudflareStreamWebhook.ts` (pure helpers), `src/plugins/storage/cloudflareSchemas.ts` (`CloudflareStreamWebhookPayloadSchema`), `scripts/setup-stream-webhook.ts`, and `tests/int/cloudflare-stream-webhook.int.spec.ts`.

## External Cloudflare API response validation (Zod)

Validate every Cloudflare API response with a Zod schema — a type-only assertion silently misses an API contract change. Centralize schemas in `cloudflareSchemas.ts` and parse with `.parse()`, not a type cast:

```typescript
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ code: z.number().optional(), message: z.string() })).default([]),
  result: z.object({ id: z.string().min(1), name: z.string().optional() }).optional(), // absent on success: false
})

try {
  const result = ApiResponseSchema.parse(await response.json())
  if (!result.success) throw new Error(`API failed: ${result.errors.map((e) => e.message).join(', ')}`)
  return result.result.id
} catch (error) {
  if (error instanceof z.ZodError) {
    payload.logger.error({ msg: 'API response validation failed', validationIssues: error.issues })
  }
  throw error
}
```

Mark top-level `result` optional (absent on failure), default an array field to `[]` to drop optional chaining at use sites, and require the critical fields inside `result`. Use Zod for external APIs and webhook payloads, not for internal Payload collections (already validated) or trivial boolean/string checks.
