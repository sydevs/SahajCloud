# Cloudflare Stream Webhook

## Overview

When a video is uploaded to Cloudflare Stream it is not immediately playable as an MP4 — Cloudflare transcodes the video, but the `/<uid>/downloads/default.mp4` URL returns 404 until MP4 downloads are explicitly enabled on that video. Since our admin interface and downstream consumers rely on the MP4 URL, we need to enable downloads on every new upload.

We cannot enable downloads synchronously inside the storage adapter: the downloads API rejects the request until the video reaches `readyToStream: true`, which takes seconds to minutes depending on the file. Instead we subscribe to the account-level Cloudflare Stream webhook and enable MP4 downloads from a signed webhook handler once Cloudflare notifies us that the video is ready.

## Architecture

```
Admin upload
   │
   ▼
cloudflareStreamAdapter.handleUpload
   │  POST /accounts/{id}/stream   (upload bytes)
   │  ◄── { uid, readyToStream: false }
   │  filename set to uid, document saved
   ▼
(Cloudflare transcodes in the background)
   │
   ▼
Cloudflare Stream
   │  POST https://cloud.sydevelopers.com/api/webhooks/cloudflare-stream
   │  Webhook-Signature: time=<unix>,sig1=<hmac-sha256-hex>
   │  body = full video object ({ uid, readyToStream, status: { state: "ready" }, ... })
   ▼
Webhook route handler
   │  1. Read raw body
   │  2. Verify HMAC-SHA256 over `${time}.${rawBody}`
   │  3. Parse with Zod
   │  4. If status.state === "ready":
   │       POST /accounts/{id}/stream/{uid}/downloads
   │  5. Respond 200 (Cloudflare retries on non-2xx)
   ▼
Video has MP4 URL
```

## One-time production setup

The webhook is **account-scoped**: there is exactly one notification URL per Cloudflare account. Only production registers the webhook — see "Dev environment" below.

### 1. Register the webhook with Cloudflare

```bash
export CLOUDFLARE_ACCOUNT_ID=<prod-account-id>
export CLOUDFLARE_API_KEY=<token-with-stream-edit>

pnpm tsx scripts/setup-stream-webhook.ts \
  --url https://cloud.sydevelopers.com/api/webhooks/cloudflare-stream
```

The script prints the signing secret returned by Cloudflare. Copy it.

If a different URL is already registered, the script refuses and prints the current value. Pass `--force` to override (only do this if you are certain).

You can also inspect the current subscription without changing it:

```bash
pnpm tsx scripts/setup-stream-webhook.ts --get
```

### 2. Store the signing secret in Workers

```bash
wrangler secret put CLOUDFLARE_STREAM_WEBHOOK_SECRET
# Paste the secret from step 1 when prompted
```

### 3. Redeploy

```bash
pnpm run deploy:prod
```

Secrets take effect on the next request, but redeploying makes the rollout explicit and avoids surprises.

### 4. Verify end-to-end

1. Log into the admin at `https://cloud.sydevelopers.com/admin`.
2. Upload a small test video (to `videos`, `frames`, or `files`).
3. In another shell: `wrangler tail sahajcloud --format pretty`.
4. You should see (in order):
   - `Uploading video to Cloudflare Stream`
   - `Video uploaded successfully`
   - 15-60 seconds later: `MP4 downloads enabled via webhook`
5. Open the `url` virtual field of the uploaded document — it should point to `https://customer-aorobtik2fce41s5.cloudflarestream.com/<uid>/downloads/default.mp4`.
6. Pasting that URL in a browser should play / download the MP4.

### Raw curl equivalents

If the setup script is unavailable, the registration can be done by hand:

```bash
# Get current registration
curl -H "Authorization: Bearer ${CLOUDFLARE_API_KEY}" \
  https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/webhook

# Register / update
curl -X PUT \
  -H "Authorization: Bearer ${CLOUDFLARE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"notificationUrl":"https://cloud.sydevelopers.com/api/webhooks/cloudflare-stream"}' \
  https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/webhook

# Delete
curl -X DELETE \
  -H "Authorization: Bearer ${CLOUDFLARE_API_KEY}" \
  https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/webhook
```

## Dev environment

Dev deployments **do not** subscribe to the Cloudflare Stream webhook and **do not** auto-enable MP4 downloads on uploads. The reason is that webhooks are account-scoped — if a dev machine registered its own URL, the next production upload would fail to get MP4 downloads enabled until someone re-registered the production URL.

The route handler is still deployed in dev, but without `CLOUDFLARE_STREAM_WEBHOOK_SECRET` set it returns 503 for any POST. Cloudflare would only hit this URL if someone had manually registered the dev deployment, which shouldn't happen.

**Trade-off**: videos uploaded via the dev admin will have broken MP4 URLs until someone enables downloads manually on them. For local QA that requires a working MP4, upload against production or backfill the specific video (see Manual backfill below).

## Security

- **HMAC-SHA256** signatures over `{time}.{rawBody}`, keyed with the webhook signing secret Cloudflare returned at registration time.
- **5-minute freshness window** — stale timestamps (past or future) are rejected to prevent replays.
- **Constant-time comparison** on the hex-encoded signature to prevent timing attacks.
- The raw body is read with `request.text()` *before* any JSON parse so the bytes used for HMAC verification are byte-identical to what Cloudflare signed.
- The handler uses Web Crypto (`crypto.subtle`) rather than Node's `crypto` module so the implementation is identical in Workers and in vitest.

## Manual backfill

For any video that was uploaded before the webhook was wired up (or for dev uploads that need to play):

```bash
export CLOUDFLARE_ACCOUNT_ID=<account-id>
export CLOUDFLARE_API_KEY=<token-with-stream-edit>
export VIDEO_UID=<the-videos-filename-field>

curl -X POST \
  -H "Authorization: Bearer ${CLOUDFLARE_API_KEY}" \
  https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${VIDEO_UID}/downloads
```

The video's `filename` field in Payload is the Stream UID.

## Debugging

- Tail production logs: `wrangler tail sahajcloud --format pretty`
- Look for `MP4 downloads enabled via webhook` (success) or `Failed to enable MP4 downloads` / `Cloudflare Stream reported processing error` (failures).
- A 400/401 response from the webhook route usually means the signing secret in Workers doesn't match the one Cloudflare has. Re-run `scripts/setup-stream-webhook.ts --get` and compare.
- Cloudflare retries non-2xx responses with exponential backoff, so transient errors generally recover on their own.

## Key files

- [src/app/(payload)/api/webhooks/cloudflare-stream/route.ts](../../src/app/(payload)/api/webhooks/cloudflare-stream/route.ts) — Next.js POST handler (thin wrapper)
- [src/lib/storage/cloudflareStreamWebhook.ts](../../src/lib/storage/cloudflareStreamWebhook.ts) — pure helpers (`parseSignatureHeader`, `verifySignature`, `handleStreamWebhook`)
- [src/lib/storage/cloudflareSchemas.ts](../../src/lib/storage/cloudflareSchemas.ts) — `CloudflareStreamWebhookPayloadSchema`
- [src/lib/storage/cloudflareStreamAdapter.ts](../../src/lib/storage/cloudflareStreamAdapter.ts) — upload-time adapter (no longer attempts to enable downloads)
- [scripts/setup-stream-webhook.ts](../../scripts/setup-stream-webhook.ts) — one-off setup / teardown script
- [tests/int/cloudflare-stream-webhook.int.spec.ts](../../tests/int/cloudflare-stream-webhook.int.spec.ts) — unit tests for the handler
