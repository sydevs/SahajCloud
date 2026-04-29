import type { Endpoint } from 'payload'

import { extractID } from 'payload/shared'
import { z } from 'zod'

import { AUDIENCE_DEFINITIONS } from '@/collections/tags/Audiences'
import { buildAudienceDataShape, evaluateRules, type RulesValue } from '@/fields'
import type { LectureMetadata } from '@/hooks/lectureHooks'
import {
  mergeSubtitles,
  resolveThumbnailUrl,
  type LectureClipPlayerData,
  type LecturePlayerData,
} from '@/lib/lectureClipShape'
import type { Audience, Lecture, LectureClip } from '@/payload-types'

const querySchema = z.object({
  ...buildAudienceDataShape(AUDIENCE_DEFINITIONS),
  limit: z.coerce.number().int().min(1).max(100),
})

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
          hlsUrl: metadata.hlsUrl,
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
          hlsUrl: metadata.hlsUrl,
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
