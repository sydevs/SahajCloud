/**
 * Nirmala Vidya API Client
 *
 * Provides utilities for fetching lecture metadata from the Nirmala Vidya
 * platform using a Vimeo URL as the entry point.
 *
 * API endpoint: https://nirmalavidya.com/api/v2/videos/vimeo/{vimeoId}/hls
 */
import { z } from 'zod'

import { serverEnv } from '@/lib/env'

// =============================================================================
// Types
// =============================================================================

export interface NirmalaVidyaVideoData {
  title: string
  thumbnailUrl: string
  hlsUrl: string
}

// =============================================================================
// Response Validation Schema (Zod)
// =============================================================================

const NirmalaVidyaResponseSchema = z.object({
  title: z.string(),
  thumbnail_url: z.string().url(),
  hls_url: z.string().url(),
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
 * Throws a user-visible error on:
 *   - 401 Unauthorized (invalid API key)
 *   - 404 Not Found (video not found on Nirmala Vidya)
 *   - 422 Unprocessable (invalid video ID format)
 *   - 502/503 (API unavailable)
 *   - Network errors
 *
 * @param vimeoId - The numeric Vimeo video ID
 * @returns Validated video metadata
 */
export async function fetchNirmalaVidyaVideo(vimeoId: string): Promise<NirmalaVidyaVideoData> {
  const apiKey = serverEnv.NIRMALA_VIDYA_API_KEY
  if (!apiKey) {
    throw new Error(
      'NIRMALA_VIDYA_API_KEY is not configured. Set it in your .env file to enable lecture creation.',
    )
  }

  const url = `https://nirmalavidya.com/api/v2/videos/vimeo/${vimeoId}/hls`

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    throw new Error(
      `Nirmala Vidya API is unreachable. Please try again later. (${error instanceof Error ? error.message : 'Network error'})`,
    )
  }

  if (response.status === 401) {
    throw new Error('Nirmala Vidya API key is invalid or expired. Contact your administrator.')
  }

  if (response.status === 404) {
    throw new Error(
      `Video not found on Nirmala Vidya (Vimeo ID: ${vimeoId}). Check that the URL is correct.`,
    )
  }

  if (response.status === 422) {
    throw new Error(`Invalid Vimeo video ID format: ${vimeoId}`)
  }

  if (response.status === 502 || response.status === 503) {
    throw new Error('Nirmala Vidya API is temporarily unavailable. Please try again later.')
  }

  if (!response.ok) {
    throw new Error(
      `Nirmala Vidya API returned an unexpected error (HTTP ${response.status}). Please try again later.`,
    )
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new Error('Nirmala Vidya API returned an invalid response. Please try again later.')
  }

  const parsed = NirmalaVidyaResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(
      `Nirmala Vidya API response has an unexpected format: ${parsed.error.message}`,
    )
  }

  return {
    title: parsed.data.title,
    thumbnailUrl: parsed.data.thumbnail_url,
    hlsUrl: parsed.data.hls_url,
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
  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    throw new Error(
      `Failed to download file from ${url}: ${error instanceof Error ? error.message : 'Network error'}`,
    )
  }

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
