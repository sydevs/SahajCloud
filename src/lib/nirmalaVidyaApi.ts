/**
 * Nirmala Vidya API Client
 *
 * Provides utilities for fetching lecture metadata from the Nirmala Vidya
 * platform using a Vimeo URL as the entry point.
 *
 * API endpoint: https://mapi.nirmalavidya.org/api/v2/videos/vimeo/{vimeoId}/hls
 */
import { z } from 'zod'

import { serverEnv } from '@/lib/env'

// =============================================================================
// Types
// =============================================================================

export interface NirmalaVidyaVideoData {
  title: string
  thumbnailUrl: string | null
  hlsUrl: string
  subtitles: Array<{ languageCode: string; url: string }>
}

// =============================================================================
// Response Validation Schema (Zod)
// =============================================================================

const NirmalaVidyaResponseSchema = z.object({
  name: z.string(),
  files: z.array(
    z.object({
      link: z.string().url(),
      quality: z.string(),
    }),
  ),
  thumbnail_url: z.string().url().nullable().optional(),
  subtitles: z
    .array(
      z.object({
        language_code: z.string(),
        url: z.string().url(),
      }),
    )
    .optional()
    .default([]),
  link: z.string().url().optional(),
  duration: z.number().optional(),
})

// =============================================================================
// Utilities
// =============================================================================

/**
 * Extracts the numeric Vimeo video ID from a Vimeo URL.
 *
 * Supports:
 *   - https://vimeo.com/123456789
 *   - https://player.vimeo.com/video/123456789
 *   - https://vimeo.com/channels/channelname/123456789
 *
 * @returns The numeric video ID, or null if the URL is not a valid Vimeo URL
 */
export function extractVimeoId(url: string): string | null {
  try {
    const parsed = new URL(url)
    // Must be a vimeo.com or player.vimeo.com domain
    if (!parsed.hostname.endsWith('vimeo.com')) return null

    // Match the last numeric segment in the path
    const match = parsed.pathname.match(/\/(\d+)(?:[/?#]|$)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Fetches video metadata from the Nirmala Vidya API for a given Vimeo video ID.
 *
 * @param vimeoId - The numeric Vimeo video ID
 * @returns Validated video metadata
 * @throws Error on network failure, non-OK status, or unexpected response format
 */
export async function fetchNirmalaVidyaVideo(vimeoId: string): Promise<NirmalaVidyaVideoData> {
  const apiKey = serverEnv.NIRMALA_VIDYA_API_KEY
  if (!apiKey) {
    throw new Error(
      'NIRMALA_VIDYA_API_KEY is not configured. Set it in your .env file to enable lecture creation.',
    )
  }

  const url = `https://mapi.nirmalavidya.org/api/v2/videos/vimeo/${vimeoId}/hls`

  const response = await fetch(url, {
    headers: { 'X-API-Key': apiKey },
  })

  if (!response.ok) {
    throw new Error(`Nirmala Vidya API error: ${response.status} ${response.statusText}`)
  }

  const parsed = NirmalaVidyaResponseSchema.parse(await response.json())

  const hlsFile = parsed.files.find((f) => f.quality === 'hls')
  if (!hlsFile) {
    throw new Error('No HLS stream found in Nirmala Vidya response')
  }

  return {
    title: parsed.name,
    thumbnailUrl: parsed.thumbnail_url ?? `https://vumbnail.com/${vimeoId}.jpg`,
    hlsUrl: hlsFile.link,
    subtitles: parsed.subtitles.map((s) => ({
      languageCode: s.language_code,
      url: s.url,
    })),
  }
}

/**
 * Downloads a remote URL and returns a Buffer object in the format
 * expected by Payload's file upload API.
 *
 * @param url - The remote URL to download
 * @param filename - Optional filename override (auto-derived from URL if not provided)
 * @returns Buffer object ready for `payload.create({ file: ... })`
 */
export async function downloadToBuffer(
  url: string,
  filename?: string,
): Promise<{ data: Buffer; mimetype: string; name: string; size: number }> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download file from ${url}: HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const mimeType = contentType.split(';')[0].trim()

  const arrayBuffer = await response.arrayBuffer()
  const data = Buffer.from(arrayBuffer)

  // Derive filename from URL if not provided
  let name = filename
  if (!name) {
    const urlPath = new URL(url).pathname
    const ext = mimeType.split('/')[1] || 'bin'
    const baseName = urlPath.split('/').pop()?.split('?')[0] || `file-${Date.now()}`
    // Ensure extension is present
    name = baseName.includes('.') ? baseName : `${baseName}.${ext}`
  }

  return { data, mimetype: mimeType, name, size: data.length }
}
