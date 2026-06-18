#!/usr/bin/env node
/**
 * Scheduled cleanup of preview-namespaced storage assets (issue #432).
 *
 * Non-production deployments (Railway PR previews, staging) namespace every
 * upload with a `preview-` marker — an object-ID/key prefix for Cloudflare
 * Images + R2, and a `meta.env=preview` tag for Cloudflare Stream (see
 * `src/plugins/storage/previewIsolation.ts`). This script reaps those marked
 * assets once they are older than `--days`, so preview test uploads don't pile
 * up in the shared Cloudflare account / R2 bucket.
 *
 * SAFETY: an asset is deleted only when it is BOTH preview-marked AND older than
 * the cutoff (`isReapablePreviewAsset`). Production assets carry no marker and
 * are never touched. The script defaults to a DRY RUN; pass `--apply` to delete.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-preview-assets.ts                  # dry run, 7-day cutoff
 *   pnpm tsx scripts/cleanup-preview-assets.ts --apply          # actually delete
 *   pnpm tsx scripts/cleanup-preview-assets.ts --days 3 --apply
 *
 * Env required (Images + Stream):
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_KEY        (token with Images:Edit + Stream:Edit)
 * Env required for R2 cleanup (R2 step is skipped when any is unset):
 *   R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  [, R2_S3_ENDPOINT]
 */
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { z } from 'zod'

import {
  isPreviewOwnedKey,
  isPreviewOwnedVideoMeta,
  isReapablePreviewAsset,
} from '../src/plugins/storage/previewIsolation'

const DEFAULT_MAX_AGE_DAYS = 7
const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

interface Args {
  apply: boolean
  days: number
}

interface ReapSummary {
  backend: string
  scanned: number
  reaped: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, days: DEFAULT_MAX_AGE_DAYS }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply' || arg === '--force') {
      args.apply = true
    } else if (arg === '--days') {
      const value = Number(argv[++i])
      if (!Number.isInteger(value) || value < 0) {
        console.error('--days must be a non-negative integer')
        process.exit(1)
      }
      args.days = value
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else {
      console.error(`Unknown argument: ${arg}`)
      printUsage()
      process.exit(1)
    }
  }
  return args
}

function printUsage(): void {
  console.error(
    [
      'Usage:',
      '  pnpm tsx scripts/cleanup-preview-assets.ts [--days <n>] [--apply]',
      '',
      'Defaults to a dry run (no deletes). Pass --apply to delete.',
      'Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY [, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_S3_ENDPOINT]',
    ].join('\n'),
  )
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.length === 0) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return value
}

/** Parse a Cloudflare ISO timestamp, returning null when absent/invalid. */
function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const ImagesListSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ code: z.number().optional(), message: z.string() })).default([]),
  result: z
    .object({
      images: z.array(z.object({ id: z.string(), uploaded: z.string().optional() })).default([]),
    })
    .nullish(),
})

const StreamListSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ code: z.number().optional(), message: z.string() })).default([]),
  result: z
    .array(
      z.object({
        uid: z.string(),
        created: z.string().optional(),
        meta: z.record(z.string(), z.string()).optional(),
      }),
    )
    .default([]),
})

async function cfFetch(method: 'GET' | 'DELETE', path: string, apiKey: string): Promise<unknown> {
  const response = await fetch(`${CF_API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  return response.json()
}

/**
 * Reap preview-marked Cloudflare Images older than the cutoff. Images expose a
 * caller-chosen custom ID, so the marker is the `preview-` ID prefix.
 */
async function reapImages(
  accountId: string,
  apiKey: string,
  now: Date,
  days: number,
  apply: boolean,
): Promise<ReapSummary> {
  let page = 1
  let scanned = 0
  let reaped = 0
  const perPage = 100

  for (;;) {
    const json = await cfFetch(
      'GET',
      `/accounts/${accountId}/images/v1?page=${page}&per_page=${perPage}`,
      apiKey,
    )
    const parsed = ImagesListSchema.parse(json)
    if (!parsed.success) {
      throw new Error(
        `Cloudflare Images list failed: ${parsed.errors.map((e) => e.message).join(', ')}`,
      )
    }
    const images = parsed.result?.images ?? []
    scanned += images.length

    for (const image of images) {
      if (
        !isReapablePreviewAsset(isPreviewOwnedKey(image.id), parseDate(image.uploaded), now, days)
      ) {
        continue
      }
      console.log(
        `  [images] ${apply ? 'delete' : 'would delete'} ${image.id} (uploaded ${image.uploaded ?? '?'})`,
      )
      if (apply) {
        await cfFetch('DELETE', `/accounts/${accountId}/images/v1/${image.id}`, apiKey)
      }
      reaped += 1
    }

    if (images.length < perPage) break
    page += 1
  }

  return { backend: 'Cloudflare Images', scanned, reaped }
}

/**
 * Reap preview-marked Cloudflare Stream videos older than the cutoff. Stream
 * UIDs are assigned by Cloudflare, so the marker lives in `meta.env=preview`.
 *
 * Note: `GET /stream` returns the most recent ~1000 videos; preview video
 * uploads are rare (smoke tests don't upload video), so a single listing is
 * sufficient. A warning is logged if the cap is reached.
 */
async function reapStream(
  accountId: string,
  apiKey: string,
  now: Date,
  days: number,
  apply: boolean,
): Promise<ReapSummary> {
  // Oldest-first (`asc=true`) so a single page reaches the reapable (aged)
  // videos even when the account exceeds the ~1000-video listing cap.
  const json = await cfFetch('GET', `/accounts/${accountId}/stream?asc=true`, apiKey)
  const parsed = StreamListSchema.parse(json)
  if (!parsed.success) {
    throw new Error(
      `Cloudflare Stream list failed: ${parsed.errors.map((e) => e.message).join(', ')}`,
    )
  }

  const videos = parsed.result
  if (videos.length >= 1000) {
    console.warn(
      '  [stream] listing hit the ~1000-video cap; some old preview videos may be skipped this run',
    )
  }

  let reaped = 0
  for (const video of videos) {
    if (
      !isReapablePreviewAsset(
        isPreviewOwnedVideoMeta(video.meta),
        parseDate(video.created),
        now,
        days,
      )
    ) {
      continue
    }
    console.log(
      `  [stream] ${apply ? 'delete' : 'would delete'} ${video.uid} (created ${video.created ?? '?'})`,
    )
    if (apply) {
      await cfFetch('DELETE', `/accounts/${accountId}/stream/${video.uid}`, apiKey)
    }
    reaped += 1
  }

  return { backend: 'Cloudflare Stream', scanned: videos.length, reaped }
}

/**
 * Reap preview-marked R2 objects older than the cutoff. R2 keys are
 * `<collection>/<filename>`; the marker is the `preview-` prefix on the
 * filename segment.
 */
async function reapR2(now: Date, days: number, apply: boolean): Promise<ReapSummary | null> {
  const bucket = process.env.R2_BUCKET
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!bucket || !accessKeyId || !secretAccessKey) {
    console.log('  [r2] skipped (R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set)')
    return null
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_S3_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  let continuationToken: string | undefined
  let scanned = 0
  let reaped = 0

  do {
    const list = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
    )
    const objects = list.Contents ?? []
    scanned += objects.length

    for (const object of objects) {
      const key = object.Key
      if (!key) continue
      const basename = key.split('/').pop() ?? key
      const createdAt = object.LastModified ?? null
      if (!isReapablePreviewAsset(isPreviewOwnedKey(basename), createdAt, now, days)) {
        continue
      }
      console.log(
        `  [r2] ${apply ? 'delete' : 'would delete'} ${key} (modified ${createdAt?.toISOString() ?? '?'})`,
      )
      if (apply) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      }
      reaped += 1
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (continuationToken)

  return { backend: 'R2', scanned, reaped }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const apiKey = requireEnv('CLOUDFLARE_API_KEY')
  const now = new Date()

  console.log(
    `Preview asset cleanup — cutoff ${args.days} day(s), ${args.apply ? 'APPLY (deleting)' : 'DRY RUN (no deletes)'}`,
  )

  const summaries: ReapSummary[] = []
  summaries.push(await reapImages(accountId, apiKey, now, args.days, args.apply))
  summaries.push(await reapStream(accountId, apiKey, now, args.days, args.apply))
  const r2Summary = await reapR2(now, args.days, args.apply)
  if (r2Summary) summaries.push(r2Summary)

  console.log('\nSummary:')
  for (const summary of summaries) {
    console.log(
      `  ${summary.backend}: scanned ${summary.scanned}, ${args.apply ? 'deleted' : 'reapable'} ${summary.reaped}`,
    )
  }
  if (!args.apply) {
    console.log('\nDry run complete. Re-run with --apply to delete the assets listed above.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
