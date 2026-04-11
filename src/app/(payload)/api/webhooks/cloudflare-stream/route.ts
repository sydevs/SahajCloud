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
 * is not set. See `.claude/docs/cloudflare-stream-webhook.md`.
 *
 * The actual verification and processing logic lives in
 * `src/lib/storage/cloudflareStreamWebhook.ts` (pure, testable). This file is
 * just a Next.js route handler wrapper.
 *
 * @see https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 */
import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { serverEnv } from '@/lib/env'
import { handleStreamWebhook } from '@/lib/storage/cloudflareStreamWebhook'

import config from '@payload-config'

/**
 * POST /api/webhooks/cloudflare-stream
 *
 * Signed webhook from Cloudflare Stream. The body MUST be read as text first
 * (before any JSON parsing) because the HMAC is computed over the raw bytes.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('webhook-signature')

  const payload = await getPayload({ config })

  const result = await handleStreamWebhook({
    rawBody,
    signatureHeader,
    secret: serverEnv.CLOUDFLARE_STREAM_WEBHOOK_SECRET,
    accountId: serverEnv.CLOUDFLARE_ACCOUNT_ID,
    apiKey: serverEnv.CLOUDFLARE_API_KEY,
    logger: payload.logger,
  })

  return NextResponse.json(result.body, { status: result.status })
}
