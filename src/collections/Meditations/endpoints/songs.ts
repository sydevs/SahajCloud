import type { Endpoint } from 'payload'

import { emptyPaginatedResponse, requireActiveClient } from '@/lib/endpoints'
import type { Meditation, Song } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { asTrustedReq } from '@/plugins/usage/hooks'

/**
 * Public fields exposed by this endpoint. `id` is always present (Payload
 * always returns it); these three are narrowable via the `select` query param.
 */
const ALLOWED_FIELDS = ['title', 'url', 'tags'] as const
type AllowedField = (typeof ALLOWED_FIELDS)[number]

/** Fixed internal cap — not exposed as a client-facing query param. */
const SONG_LIMIT = 100

/** Trimmed song doc returned to clients. */
type SongResult = { id: number } & Partial<Pick<Song, AllowedField>>

/**
 * Parse Payload's REST bracket `select` (`?select[title]=true`) into the subset
 * of allowed fields the caller wants. Out-of-allowlist keys are ignored. When
 * `select` is omitted — or names only out-of-allowlist keys — all four fields
 * (id + the three allowed) are returned.
 */
function resolveSelectedFields(rawSelect: unknown): Set<AllowedField> {
  const selected = new Set<AllowedField>()
  if (rawSelect && typeof rawSelect === 'object') {
    const select = rawSelect as Record<string, unknown>
    for (const field of ALLOWED_FIELDS) {
      const value = select[field]
      if (value === true || value === 'true') selected.add(field)
    }
  }
  // Empty intersection ⇒ treat as "no narrowing requested" and return all four.
  return selected.size > 0 ? selected : new Set(ALLOWED_FIELDS)
}

/**
 * GET /api/meditations/:id/songs
 *
 * Returns the songs offered as background music for a meditation: every `song`
 * tagged with the meditation's single `songTag` that is flagged
 * `includeForMeditations`, in randomized order, capped at an internal limit of
 * 100. Each result is trimmed to `{ id, title, url, tags }` (tags as song-tag
 * IDs), honouring Payload's `select` query param within that allowlist.
 *
 * Mirrors the sibling `/related-lectures` endpoint in auth (active-client only),
 * trusted-req forwarding, and response conventions. The data join (meditation →
 * songTag → songs) and shuffle live server-side so the mobile client gets the
 * pre-shuffled candidate set in one round-trip without over-fetching.
 *
 * Responds with the full Payload paginated envelope (`docs` + pagination
 * metadata), matching the built-in REST list shape.
 */
export const meditationSongs: Endpoint = {
  path: '/:id/songs',
  method: 'get',
  handler: async (req) => {
    const denied = requireActiveClient(req)
    if (denied) return denied

    const idParam = req.routeParams?.id as string | number | undefined
    if (idParam === undefined || idParam === null || idParam === '') {
      return Response.json({ errors: [{ message: 'Meditation ID required' }] }, { status: 400 })
    }

    let meditation: Meditation | null = null
    try {
      meditation = (await req.payload.findByID({
        collection: 'meditations',
        id: idParam,
        depth: 0,
        req: asTrustedReq(req),
      })) as Meditation
    } catch (err) {
      req.payload.logger.error({
        msg: 'meditationSongs: findByID threw — treating as not found',
        meditationId: idParam,
        error: err instanceof Error ? err.message : String(err),
      })
      meditation = null
    }
    if (!meditation) {
      return Response.json({ errors: [{ message: 'Meditation not found' }] }, { status: 404 })
    }

    // At depth: 0 `songTag` is the raw ID (or null). A meditation with no
    // songTag has no candidate music — return an empty paginated response.
    const songTag = meditation.songTag
    const songTagId = typeof songTag === 'object' && songTag !== null ? songTag.id : songTag
    if (!songTagId) {
      return Response.json(emptyPaginatedResponse<SongResult>(SONG_LIMIT), {
        headers: publicReadCacheHeaders(req, ['songs', 'meditations']),
      })
    }

    const selectedFields = resolveSelectedFields(req.query.select)

    // `url` is a virtual field whose afterRead hook reads `data.filename`, so we
    // must co-select `filename` for it to resolve under a `select` (same pattern
    // as TagSelectorField / relationshipDocLoader). It's stripped during the
    // trim below so it never leaks into the response.
    const findSelect: Record<string, true> = {}
    for (const field of selectedFields) findSelect[field] = true
    if (selectedFields.has('url')) findSelect.filename = true

    const result = await req.payload.find({
      collection: 'songs',
      where: {
        tags: { in: [songTagId] },
        includeForMeditations: { equals: true },
      },
      select: findSelect,
      depth: 0,
      limit: SONG_LIMIT,
      locale: req.locale ?? 'en',
      req: asTrustedReq(req),
    })

    // Trim each doc to `id` + the requested allowlist fields (drops `filename`).
    const trimmed: SongResult[] = (result.docs as Song[]).map((doc) => {
      const out: SongResult = { id: doc.id }
      for (const field of selectedFields) {
        // `field` keys both types with matching value types, but TS can't
        // track that correlation across the loop — hence the `as never`.
        out[field] = doc[field] as never
      }
      return out
    })

    // Fisher-Yates shuffle (matches Lectures/endpoints/forAudience.ts).
    for (let i = trimmed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[trimmed[i], trimmed[j]] = [trimmed[j], trimmed[i]]
    }

    return Response.json(
      { ...result, docs: trimmed },
      {
        headers: publicReadCacheHeaders(req, ['songs', 'meditations']),
      },
    )
  },
}
