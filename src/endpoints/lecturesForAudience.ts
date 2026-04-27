import type { Endpoint } from 'payload'

import { extractID } from 'payload/shared'
import { z } from 'zod'

import { AUDIENCE_DEFINITIONS } from '@/collections/tags/Audiences'
import { buildAudienceDataShape, evaluateRules, type RulesValue } from '@/fields'
import type { LectureMetadata } from '@/hooks/lectureHooks'
import type { Audience, Image, Lecture, LectureClip } from '@/payload-types'

const querySchema = z.object({
  ...buildAudienceDataShape(AUDIENCE_DEFINITIONS),
  limit: z.coerce.number().int().min(1).max(100),
})

/**
 * Flat, playback-ready shape for a full lecture returned from /for-audience.
 *
 * `title` is nullable (localized + hook-populated). `endTime`/`duration` may
 * be `null` on a lecture whose `metadata.duration` hasn't been backfilled
 * yet (new NV-sync field — existing rows populate on the next monthly sync).
 * `startTime` is always 0. `lectureId` is omitted — that field is
 * clip-exclusive.
 */
export type LecturePlayerData = {
  id: number
  type: 'lecture'
  title: string | null | undefined
  videoUrl: string
  thumbnailUrl: string | null
  subtitles: Record<string, string>
  startTime: 0
  endTime: number | null
  duration: number | null
  lectureId?: undefined
}

/**
 * Flat, playback-ready shape for a lecture clip returned from /for-audience.
 *
 * All time fields are concrete numbers (the collection enforces
 * `endTime > startTime`), `title` is required, and `lectureId` points at
 * the parent lecture. Discriminate clip vs lecture on `type` or on the
 * presence of `lectureId`.
 */
export type LectureClipPlayerData = {
  id: number
  type: 'lecture-clip'
  title: string
  videoUrl: string
  thumbnailUrl: string | null
  subtitles: Record<string, string>
  startTime: number
  endTime: number
  duration: number
  lectureId: number
}

// =============================================================================
// Pure helpers (exported for unit tests)
// =============================================================================

/**
 * Merge a clip's subtitle overrides on top of its parent's NV-sourced subtitles.
 * Parent map is the baseline; each non-empty clip row overrides one locale.
 */
export function mergeSubtitles(
  parentMap: Record<string, string> | null | undefined,
  clipOverrides: LectureClip['subtitles'] | null | undefined,
): Record<string, string> {
  const merged: Record<string, string> = { ...(parentMap ?? {}) }
  if (!Array.isArray(clipOverrides)) return merged
  for (const row of clipOverrides) {
    if (row?.locale && row?.url) {
      merged[row.locale] = row.url
    }
  }
  return merged
}

type ThumbnailRef = number | Image | null | undefined

/** Extracts a usable CDN URL from a thumbnail relationship (populated or null). */
function thumbnailUrl(ref: ThumbnailRef): string | null {
  if (ref && typeof ref === 'object' && typeof ref.url === 'string') return ref.url
  return null
}

/**
 * Resolve a viewer-item thumbnail URL using a tier-based fallback chain:
 *   primaryOverride > secondaryOverride > fallback > null.
 *
 * For lectures: `primaryOverride` is the lecture's editor override and there
 * is no secondary. For clips: `primaryOverride` is the clip's editor override
 * and `secondaryOverride` is the parent lecture's editor override. `fallback`
 * is always the parent metadata's thumbnail URL.
 */
export function resolveThumbnailUrl(args: {
  primaryOverride?: ThumbnailRef
  secondaryOverride?: ThumbnailRef
  fallback?: string | null
}): string | null {
  return (
    thumbnailUrl(args.primaryOverride) ??
    thumbnailUrl(args.secondaryOverride) ??
    args.fallback ??
    null
  )
}

// =============================================================================
// Endpoint
// =============================================================================

/**
 * GET /api/lectures/for-audience
 *
 * Returns a uniform-random, audience-filtered feed mixing full lectures and
 * clips. Each item carries a `audiences` hasMany relationship to `audiences`
 * docs. Items are eligible when ANY of their attached audiences passes
 * evaluation against `audienceData` (OR semantics). Items with empty
 * `audiences` are always excluded.
 *
 * Response shape (flat, no nested parent doc):
 *   { docs: (LecturePlayerData | LectureClipPlayerData)[] }
 *
 * Subtitles are always returned as the full `{ [locale]: url }` map, merged
 * from the lecture's metadata plus (for clips) any per-locale overrides on
 * the clip. The player picks the track it wants at playback time.
 *
 * Pipeline:
 *   1. Evaluate `audiences` with the audience data to build the eligible-audience set.
 *   2. Find lectures whose `audiences` overlap the eligible set (OR-match).
 *   3. Find clips whose `audiences` overlap the eligible set (OR-match).
 *   4. Bulk-fetch parent lectures for clips so we can merge subtitles and
 *      resolve thumbnail fallbacks without an N+1. Seed from step-2 lectures.
 *   5. Shape each variant into its respective player type, concatenate,
 *      Fisher-Yates shuffle, slice.
 */
export const lecturesForAudience: Endpoint = {
  path: '/for-audience',
  method: 'get',
  handler: async (req) => {
    const parsed = querySchema.safeParse(req.query)

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { limit, ...audienceData } = parsed.data

    const { docs: audienceDocs } = await req.payload.find({
      collection: 'audiences',
      limit: 200,
      depth: 0,
      pagination: false,
      req,
    })

    const eligibleAudienceIds = new Set<number>(
      (audienceDocs as Audience[])
        .filter((audience) =>
          evaluateRules(
            audience.rules as RulesValue | null | undefined,
            audienceData,
            AUDIENCE_DEFINITIONS,
          ),
        )
        .map((audience) => audience.id),
    )

    if (eligibleAudienceIds.size === 0) {
      return Response.json({ docs: [] })
    }

    const { docs: lectureDocs } = await req.payload.find({
      collection: 'lectures',
      where: { audiences: { in: [...eligibleAudienceIds] } },
      limit,
      depth: 1,
      pagination: false,
      req,
    })

    const { docs: clipDocs } = await req.payload.find({
      collection: 'lecture-clips',
      where: { audiences: { in: [...eligibleAudienceIds] } },
      limit,
      depth: 1,
      pagination: false,
      req,
    })

    const eligibleLectures = lectureDocs as Lecture[]
    const eligibleClips = clipDocs as LectureClip[]

    // Bulk-fetch parent lectures for clips (always — needed for videoUrl,
    // subtitle merge, and thumbnail fallback). Seed from already-fetched
    // eligible lectures to avoid a round-trip when the parent is itself
    // audience-eligible.
    const parentById = new Map<number, Lecture>()
    for (const lecture of eligibleLectures) {
      parentById.set(lecture.id, lecture)
    }

    const parentIdsToFetch = new Set<number>()
    for (const clip of eligibleClips) {
      const parentId = extractID(clip.lecture)
      if (typeof parentId === 'number' && !parentById.has(parentId)) {
        parentIdsToFetch.add(parentId)
      }
    }

    if (parentIdsToFetch.size > 0) {
      const { docs: parentDocs } = await req.payload.find({
        collection: 'lectures',
        where: { id: { in: [...parentIdsToFetch] } },
        limit: parentIdsToFetch.size,
        depth: 1,
        pagination: false,
        req,
      })
      for (const parent of parentDocs as Lecture[]) {
        parentById.set(parent.id, parent)
      }
    }

    // Shape lectures
    const shapedLectures: LecturePlayerData[] = eligibleLectures
      .map((lecture): LecturePlayerData | null => {
        const metadata = lecture.metadata as LectureMetadata | null | undefined
        if (!metadata?.hlsUrl) {
          req.payload.logger.warn({
            msg: 'Lecture missing metadata.hlsUrl — skipping in /for-audience',
            lectureId: lecture.id,
          })
          return null
        }
        const duration = metadata.duration ?? null
        return {
          id: lecture.id,
          type: 'lecture',
          title: lecture.title,
          videoUrl: metadata.hlsUrl,
          thumbnailUrl: resolveThumbnailUrl({
            primaryOverride: lecture.thumbnail,
            fallback: metadata.thumbnailUrl,
          }),
          subtitles: { ...(metadata.subtitles ?? {}) } as Record<string, string>,
          startTime: 0 as const,
          endTime: duration,
          duration,
        }
      })
      .filter((item): item is LecturePlayerData => item !== null)

    // Shape clips
    const shapedClips: LectureClipPlayerData[] = eligibleClips
      .map((clip): LectureClipPlayerData | null => {
        const parentId = extractID(clip.lecture)
        const parent = typeof parentId === 'number' ? (parentById.get(parentId) ?? null) : null
        if (!parent) {
          req.payload.logger.warn({
            msg: 'Clip parent lecture not found — skipping in /for-audience',
            clipId: clip.id,
            parentId,
          })
          return null
        }
        const metadata = parent.metadata as LectureMetadata | null | undefined
        if (!metadata?.hlsUrl) {
          req.payload.logger.warn({
            msg: 'Clip parent missing metadata.hlsUrl — skipping in /for-audience',
            clipId: clip.id,
            parentId: parent.id,
          })
          return null
        }
        return {
          id: clip.id,
          type: 'lecture-clip',
          title: clip.title,
          videoUrl: metadata.hlsUrl,
          thumbnailUrl: resolveThumbnailUrl({
            primaryOverride: clip.thumbnail,
            secondaryOverride: parent.thumbnail,
            fallback: metadata.thumbnailUrl,
          }),
          subtitles: mergeSubtitles(metadata.subtitles, clip.subtitles),
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: clip.endTime - clip.startTime,
          lectureId: parent.id,
        }
      })
      .filter((item): item is LectureClipPlayerData => item !== null)

    // Concatenate + Fisher-Yates shuffle + slice
    const combined: Array<LecturePlayerData | LectureClipPlayerData> = [
      ...shapedLectures,
      ...shapedClips,
    ]
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[combined[i], combined[j]] = [combined[j], combined[i]]
    }

    return Response.json({ docs: combined.slice(0, limit) })
  },
}
