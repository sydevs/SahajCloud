import type { Endpoint } from 'payload'

import { z } from 'zod'

import { VIEWER_DATA_CONTEXT_KEY } from '@/fields/rulesField'
import type { Lecture, LectureTag } from '@/payload-types'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100),
  pathProgress: z.coerce.number().optional(),
  totalMeditationsViewed: z.coerce.number().optional(),
  totalLecturesViewed: z.coerce.number().optional(),
})

/**
 * GET /api/lectures/for-viewer
 *
 * Returns a uniform-random, rule-filtered list of published lectures for the
 * supplied viewer data. Unlike AppCards, lectures carry no rules themselves —
 * rules live on `lecture-tags`. A lecture is eligible if it has at least one
 * tag and **all** of its tags pass `rulesField` evaluation for the viewer.
 * Untagged lectures are always excluded.
 *
 * Pipeline:
 *   1. Evaluate `lecture-tags` with `viewerData` in `req.context` and build
 *      the eligible-tag set from the virtual `isEligibleForViewer` flag.
 *   2. Find published lectures with at least one tag in that set.
 *   3. JS-filter to lectures whose tags are *all* eligible (Payload's `in`
 *      matches any-tag, so the all-pass enforcement must happen here).
 *   4. Fisher-Yates shuffle and slice to `limit`.
 *
 * Caveat: a no-arg call (`viewerData = {}`) fails every `range` rule, so only
 * lectures whose tags all have empty/no configured rules will be returned.
 * Empty rules always match — see `rulesField.ts:91`.
 */
export const lecturesForViewer: Endpoint = {
  path: '/for-viewer',
  method: 'get',
  handler: async (req) => {
    const parsed = querySchema.safeParse(req.query)

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { limit, ...viewerData } = parsed.data

    // Step 1 — evaluate tags against viewer data.
    // Safety cap. Assumes lecture-tags stays well below this; if it ever
    // approaches 200, introduce server-side filtering or pagination instead
    // of bumping the limit (a larger set biases the sample when truncated).
    const { docs: tagDocs } = await req.payload.find({
      collection: 'lecture-tags',
      limit: 200,
      depth: 0,
      pagination: false,
      // Thread user/transaction context so rate-limit and usage-tracking hooks
      // fire against the authenticated client, plus pass viewer data for the
      // virtual `isEligibleForViewer` field to evaluate against.
      req: {
        ...req,
        context: { ...req.context, [VIEWER_DATA_CONTEXT_KEY]: viewerData },
      },
    })

    const eligibleSet = new Set<number>(
      (tagDocs as LectureTag[])
        .filter((tag) => tag.isEligibleForViewer === true)
        .map((tag) => tag.id),
    )

    if (eligibleSet.size === 0) {
      return Response.json({ docs: [] })
    }

    // Step 2 — candidate lectures with at least one eligible tag.
    // No viewerData context here; lectures carry no rules of their own.
    // Same 200-row safety cap as above.
    const { docs: lectureDocs } = await req.payload.find({
      collection: 'lectures',
      where: {
        and: [{ _status: { equals: 'published' } }, { tags: { in: [...eligibleSet] } }],
      },
      limit: 200,
      depth: 1,
      pagination: false,
      req,
    })

    // Step 3 — enforce all-tags-pass. Payload's `in` matches any-tag on hasMany,
    // and depth:1 may return populated tag objects, so accept both shapes.
    const eligible = (lectureDocs as Lecture[]).filter((lecture) => {
      const tags = lecture.tags ?? []
      if (tags.length === 0) return false
      return tags.every((t) => {
        const id = typeof t === 'object' && t !== null ? t.id : (t as number)
        return eligibleSet.has(id)
      })
    })

    // Step 4 — uniform Fisher-Yates shuffle, then slice.
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[eligible[i], eligible[j]] = [eligible[j], eligible[i]]
    }

    return Response.json({ docs: eligible.slice(0, limit) })
  },
}
