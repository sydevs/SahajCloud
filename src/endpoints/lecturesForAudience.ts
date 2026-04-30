import type { Endpoint } from 'payload'

import { extractID } from 'payload/shared'
import { z } from 'zod'

import { AUDIENCE_DEFINITIONS } from '@/collections/tags/Audiences'
import { buildAudienceDataShape, evaluateRules, type RulesValue } from '@/fields'
import type { LectureMetadata } from '@/hooks/lectureHooks'
import { mergeSubtitles, resolveThumbnailUrl, type LecturePlayerData } from '@/lib/lectureShape'
import type { Audience, Lecture } from '@/payload-types'

const querySchema = z.object({
  ...buildAudienceDataShape(AUDIENCE_DEFINITIONS),
  limit: z.coerce.number().int().min(1).max(100),
})

/**
 * GET /api/lectures/for-audience
 *
 * Returns a uniform-random, audience-filtered feed of lectures. Each lecture
 * carries an `audiences` hasMany relationship to `audiences` docs. Items are
 * eligible when ANY of their attached audiences passes evaluation against
 * `audienceData` (OR semantics). Items with empty `audiences` are always
 * excluded.
 *
 * Response shape (single uniform shape — no excerpt-vs-full branching):
 *   { docs: LecturePlayerData[] }
 *
 * Subtitles are returned as the full `{ [locale]: url }` map: `metadata.subtitles`
 * (NV-sourced) merged with per-locale entries on the lecture's own `subtitles`
 * array. The player picks the track it wants at playback time.
 *
 * Pipeline:
 *   1. Evaluate `audiences` with the audience data to build the eligible-audience set.
 *   2. Find lectures whose `audiences` overlap the eligible set (OR-match).
 *   3. Shape each record into `LecturePlayerData`, Fisher-Yates shuffle, slice.
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

    const eligibleLectures = lectureDocs as Lecture[]

    const shaped: LecturePlayerData[] = eligibleLectures
      .map((lecture): LecturePlayerData | null => {
        const metadata = lecture.metadata as LectureMetadata | null | undefined
        if (!metadata?.hlsUrl) {
          req.payload.logger.warn({
            msg: 'Lecture missing metadata.hlsUrl — skipping in /for-audience',
            lectureId: lecture.id,
          })
          return null
        }
        const startTime = typeof lecture.startTime === 'number' ? lecture.startTime : 0
        const endTime =
          typeof lecture.endTime === 'number' ? lecture.endTime : (metadata.duration ?? null)
        const duration = endTime !== null ? endTime - startTime : null
        return {
          id: lecture.id,
          title: lecture.title,
          hlsUrl: metadata.hlsUrl,
          videoUrl: metadata.hlsUrl,
          thumbnailUrl: resolveThumbnailUrl({
            override: lecture.thumbnail,
            fallback: metadata.thumbnailUrl,
          }),
          subtitles: mergeSubtitles(metadata.subtitles, lecture.subtitles),
          startTime,
          endTime,
          duration,
          fullLectureId: lecture.fullLecture ? (extractID(lecture.fullLecture) ?? null) : null,
        }
      })
      .filter((item): item is LecturePlayerData => item !== null)

    // Fisher-Yates shuffle + slice
    for (let i = shaped.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shaped[i], shaped[j]] = [shaped[j], shaped[i]]
    }

    return Response.json({ docs: shaped.slice(0, limit) })
  },
}
