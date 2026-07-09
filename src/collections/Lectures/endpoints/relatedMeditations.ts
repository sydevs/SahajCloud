import type { Endpoint, Where } from 'payload'

import { z } from 'zod'

import { commaSeparatedIntIds, parseQuery, requireActiveClient } from '@/lib/endpoints'
import {
  MEDITATION_CARD_SELECT,
  shapeMeditation,
  type MeditationCardData,
} from '@/lib/meditations/meditationShape'
import { scoreMeditationByNodes } from '@/lib/meditations/nodeWeights'
import type { Lecture, Meditation, MeditationsSelect, SubtleSystemNode } from '@/payload-types'
import { CUSTOM_READS, publicReadCacheHeaders } from '@/plugins/cache'
import { asTrustedReq } from '@/plugins/usage/hooks'

/**
 * Bounded select for the candidate-pool reads: the card fields
 * {@link MEDITATION_CARD_SELECT} plus `createdAt` for the recency fallback sort.
 * Skips the meditations `tagAssignments`/`frames` per-row afterReads so the pool
 * read stays flat instead of N+1 across every candidate (#541).
 */
const CANDIDATE_SELECT: MeditationsSelect<true> = { ...MEDITATION_CARD_SELECT, createdAt: true }

/** Which selection strategy produced the `docs` in a related-meditations response. */
export type RelatedMeditationsSource = 'relevance' | 'fallback'

export type RelatedMeditationsResponse = {
  docs: MeditationCardData[]
  /**
   * `'relevance'` when every `doc` is a genuine topical-overlap match;
   * `'fallback'` when recency top-ups were mixed in (or relevance matched
   * nothing at all).
   */
  source: RelatedMeditationsSource
  /**
   * Number of leading `docs` that are genuine relevance matches. Equals
   * `docs.length` when `source === 'relevance'`; `0` when relevance matched
   * nothing.
   */
  relevanceCount: number
}

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100),
  excludedMeditationIds: commaSeparatedIntIds,
})

/**
 * GET /api/lectures/:id/related-meditations
 *
 * Returns daily meditations contextually relevant to a specific lecture, ranked
 * by topical overlap between the lecture's tagged `subtleSystemNodes` and each
 * candidate meditation's cached on-screen node weights
 * (`subtleSystemNodeWeights`). The mirror of
 * `/api/meditations/:id/related-lectures`.
 *
 * Unlike `/related-lectures` there is **no** `audiences` param — meditations
 * aren't audience-gated, so there is nothing to filter on. The asymmetry is
 * intentional.
 *
 * Query params:
 *   - `limit` (required, 1–100)
 *   - `excludedMeditationIds` (optional comma-separated ints) — meditations to
 *     exclude (typically already-seen).
 *
 * Pipeline:
 *   1. Look up the anchor lecture at `depth: 1` (404 if not found) and collect
 *      the slugs of its tagged subtle-system nodes.
 *   2. If the lecture has no tagged nodes, skip straight to the recency
 *      fallback.
 *   3. Otherwise score every daily/same-locale candidate = Σ of the candidate's
 *      node weights over the lecture's slugs; drop zero-overlap candidates, sort
 *      weight DESC then id ASC, and take up to `limit`. Weighting-then-slicing
 *      keeps a high-frequency shared node from crowding the grid.
 *   4. Top-up fallback: if fewer than `limit` relevance cards survive shaping,
 *      fill the remaining slots with daily/same-locale meditations by recency
 *      (`createdAt` DESC), excluding already-selected + `excludedMeditationIds`.
 *   5. Shape every result via `shapeMeditation`, dropping any missing a public
 *      title / duration / thumbnail so no card carries a `null` or internal
 *      label.
 *
 * Response shape: `RelatedMeditationsResponse` — `{ docs, source,
 * relevanceCount }`. `source` is `'relevance'` only when the whole result is
 * genuine matches; a recency top-up (or empty relevance) makes it `'fallback'`.
 */
export const lectureRelatedMeditations: Endpoint = {
  path: '/:id/related-meditations',
  method: 'get',
  handler: async (req) => {
    const denied = requireActiveClient(req)
    if (denied) return denied

    const idParam = req.routeParams?.id as string | number | undefined
    if (idParam === undefined || idParam === null || idParam === '') {
      return Response.json({ errors: [{ message: 'Lecture ID required' }] }, { status: 400 })
    }

    const parsed = parseQuery(req, querySchema)
    if (!parsed.ok) return parsed.response

    const { limit, excludedMeditationIds } = parsed.data

    let lecture: Lecture | null = null
    try {
      lecture = (await req.payload.findByID({
        collection: 'lectures',
        id: idParam,
        depth: 1,
        req: asTrustedReq(req),
      })) as Lecture
    } catch (err) {
      req.payload.logger.error({
        msg: 'lectureRelatedMeditations: findByID threw — treating as not found',
        lectureId: idParam,
        error: err instanceof Error ? err.message : String(err),
      })
      lecture = null
    }
    if (!lecture) {
      return Response.json({ errors: [{ message: 'Lecture not found' }] }, { status: 404 })
    }

    // Collect the lecture's tagged node slugs (populated objects at depth 1).
    const nodes = (lecture.subtleSystemNodes ?? []) as Array<number | SubtleSystemNode>
    const slugs = new Set<string>()
    for (const node of nodes) {
      if (
        node &&
        typeof node === 'object' &&
        typeof node.slug === 'string' &&
        node.slug.length > 0
      ) {
        slugs.add(node.slug)
      }
    }

    const locale = req.locale ?? 'en'
    const logger = req.payload.logger

    // The daily/same-locale candidate pool (minus caller exclusions). Fetched
    // once for relevance ranking and reused for the recency fallback below,
    // instead of issuing a second identical query (mirrors how meditationLectures
    // reuses its audience pool). Stays `null` for a no-nodes lecture, which skips
    // the relevance pass and queries fresh for the fallback.
    let candidatePool: Meditation[] | null = null

    // --- Relevance pass (skipped when the lecture has no tagged nodes) ---
    const relevanceShaped: MeditationCardData[] = []
    if (slugs.size > 0) {
      const relevanceWhere: Where = { type: { equals: 'daily' } }
      if (excludedMeditationIds.length > 0) {
        relevanceWhere.id = { not_in: excludedMeditationIds }
      }

      const { docs: candidateDocs } = await req.payload.find({
        collection: 'meditations',
        where: relevanceWhere,
        depth: 1,
        pagination: false,
        limit: 0,
        locale,
        select: CANDIDATE_SELECT,
        req: asTrustedReq(req),
      })
      candidatePool = candidateDocs as Meditation[]

      const ranked = candidatePool
        .map((meditation) => ({
          meditation,
          score: scoreMeditationByNodes(meditation.subtleSystemNodeWeights, slugs),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.meditation.id - b.meditation.id)

      // Shape in score order, stopping at `limit` valid cards. Shaping AFTER the
      // limit cut (rather than slicing to `limit` first) means a higher-ranked
      // candidate that fails shaping doesn't demote a genuine lower-ranked match
      // into the recency fallback — so `relevanceCount` stays the true count of
      // leading relevance matches.
      for (const { meditation } of ranked) {
        if (relevanceShaped.length >= limit) break
        const card = shapeMeditation(meditation, logger)
        if (card) relevanceShaped.push(card)
      }
    }

    const relevanceCount = relevanceShaped.length

    // --- Recency top-up fallback (fills any remaining slots) ---
    const fallbackShaped: MeditationCardData[] = []
    if (relevanceShaped.length < limit) {
      const selectedIds = new Set(relevanceShaped.map((card) => card.id))
      let recentDocs: Meditation[]
      if (candidatePool) {
        // Reuse the already-fetched pool: drop the relevance-selected docs and
        // re-sort by recency in memory (equivalent to a fresh `-createdAt` query
        // excluding the selected IDs, but without the round-trip).
        recentDocs = candidatePool
          .filter((meditation) => !selectedIds.has(meditation.id))
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id,
          )
      } else {
        const fallbackWhere: Where = { type: { equals: 'daily' } }
        if (excludedMeditationIds.length > 0) {
          fallbackWhere.id = { not_in: excludedMeditationIds }
        }
        const { docs } = await req.payload.find({
          collection: 'meditations',
          where: fallbackWhere,
          depth: 1,
          pagination: false,
          limit: 0,
          sort: '-createdAt',
          locale,
          select: CANDIDATE_SELECT,
          req: asTrustedReq(req),
        })
        recentDocs = docs as Meditation[]
      }

      for (const meditation of recentDocs) {
        if (relevanceShaped.length + fallbackShaped.length >= limit) break
        const card = shapeMeditation(meditation, logger)
        if (card) fallbackShaped.push(card)
      }
    }

    const docs = [...relevanceShaped, ...fallbackShaped]
    // Genuine-matches-only ⇒ 'relevance'; any recency top-up (or empty
    // relevance) ⇒ 'fallback'.
    const source: RelatedMeditationsSource =
      relevanceCount === 0 || fallbackShaped.length > 0 ? 'fallback' : 'relevance'

    return Response.json({ docs, source, relevanceCount } satisfies RelatedMeditationsResponse, {
      headers: publicReadCacheHeaders(req, CUSTOM_READS.lectureRelatedMeditations),
    })
  },
}
