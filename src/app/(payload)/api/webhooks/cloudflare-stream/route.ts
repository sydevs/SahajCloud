/**
 * Cloudflare Stream Webhook Handler
 *
 * Receives webhook notifications from Cloudflare when a video reaches a
 * terminal state (`ready` or `error`). For ready videos we call the downloads
 * API to enable MP4 downloads, which is the final step needed before an
 * `<video>` tag can play the file via `/downloads/default.mp4`.
 *
 * The webhook is account-scoped: only production subscribes to it. Dev
 * deployments have the route mounted but will 503 because the signing secret
 * is not set. See `.claude/rules/storage.md`.
 *
 * The actual verification and processing logic lives in
 * `src/plugins/storage/cloudflareStreamWebhook.ts` (pure, testable). This file is
 * just a Next.js route handler wrapper.
 *
 * @see https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 */
import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

import { serverEnv } from '@/lib/env'
import { createWorkerSafeLogger } from '@/lib/logger/workerSafeLogger'
import type { WebhookLogger } from '@/plugins/storage/cloudflareStreamWebhook'
import { handleStreamWebhook } from '@/plugins/storage/cloudflareStreamWebhook'

// The webhook handler is pure and doesn't touch Payload, so we skip getPayload()
// and use the worker-safe logger directly. This keeps cold-start latency low on
// Cloudflare Workers, where Cloudflare Stream retries on non-2xx.
// createWorkerSafeLogger is typed as Config['logger'] (a union including option
// shapes and undefined); at runtime it returns a Pino-compatible instance with
// info/warn/error, which is all WebhookLogger needs.
const logger = createWorkerSafeLogger(serverEnv.NEXT_PUBLIC_LOG_LEVEL ?? 'info') as unknown as WebhookLogger

/**
 * POST /api/webhooks/cloudflare-stream
 *
 * Signed webhook from Cloudflare Stream. The body MUST be read as text first
 * (before any JSON parsing) because the HMAC is computed over the raw bytes.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('webhook-signature')

  const result = await handleStreamWebhook({
    rawBody,
    signatureHeader,
    secret: serverEnv.CLOUDFLARE_STREAM_WEBHOOK_SECRET,
    accountId: serverEnv.CLOUDFLARE_ACCOUNT_ID,
    apiKey: serverEnv.CLOUDFLARE_API_KEY,
    logger,
  })

  return NextResponse.json(result.body, { status: result.status })
}
