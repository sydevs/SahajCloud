import type { PayloadLogger, PopulateType } from 'payload'

import type { LectureMetadata } from '@/lib/lectures/nirmalaVidya'
import { resolveThumbnailUrl } from '@/lib/utilities/thumbnailUrl'
import type { Lecture, LecturesSelect } from '@/payload-types'

/**
 * Bounded include-mode `select` covering exactly the fields the feed/player
 * shaping path reads — {@link shapeLecture} plus `selectAudienceFeed`'s
 * `priority` partition. Pass it to any internal `depth ≥ 2` lectures read that
 * only builds `LecturePlayerData` (`/api/lectures/for-audience`, and the base of
 * `/api/meditations/:id/related-lectures`).
 *
 * The point is to keep the top-level lectures `clips` join field (a per-row
 * subquery) from firing across the whole candidate pool — an include-mode select
 * strips it before its afterRead runs, so the pool read stays flat instead of
 * N+1 (#541).
 *
 * `fullLecture` is selected wholesale (`true`) so a clip's parent populates at
 * depth: the clip sources its playback `metadata` and `fullLectureId`-gate
 * `audiences` from it. `select` can't narrow a *relationship's* fields (that's a
 * populate concern, not a select one), so the parent's own `clips` join is
 * bounded separately by `Lectures.defaultPopulate: { clips: false }` — the
 * nested-population analog of this top-level skip. The related-lectures ranking
 * loop additionally reads `subtleSystemNodes`; it spreads that onto this base
 * rather than bloating the shared feed select (for-audience doesn't rank, so it
 * doesn't need it).
 *
 * `userChoices` is on the shared base, not the ranking spread, because both
 * endpoints now return it in `LecturePlayerData` (#526). Pair it with
 * {@link LECTURE_FEED_POPULATE} — see that constant for why.
 */
export const LECTURE_FEED_SELECT = {
  type: true,
  title: true,
  metadata: true,
  startTime: true,
  stopTime: true,
  thumbnail: true,
  subtitles: true,
  priority: true,
  fullLecture: true,
  userChoices: true,
} satisfies LecturesSelect<true>

/**
 * Bounds what a populated `userChoices` row carries, for any read that pairs it
 * with {@link LECTURE_FEED_SELECT}.
 *
 * **This is not the #541 N+1, and profiling it as one will find nothing.**
 * Population goes through `req.payloadDataLoader`, which batches every key
 * sharing a `(collection, depth, locale, select, populate)` signature into one
 * `find`. So the cost here scales with the number of *distinct* user choices —
 * a small taxonomy — not with the candidate pool. `LECTURE_FEED_SELECT` above
 * prevents a genuine per-row subquery. This prevents a wide one.
 *
 * What it is worth: unbounded, each hydrated row runs `user-choices`' two
 * `join` fields — `children`, and `lectures` at `defaultLimit: 100` — and drags
 * in the upload columns, the virtual URL field and four localized
 * relationships. The feed returns none of that.
 *
 * `id` survives the bound (`buildFindManyArgs` hard-sets it whenever a select is
 * present), which is what lets the related-lectures ranking loop keep comparing
 * `uc.id`.
 *
 * One thing it does not bound: a clip's nested `fullLecture` parent hydrates its
 * own `userChoices` a level down, and `shapeLecture` discards them. That is a
 * second batched round trip, not a per-row one, and narrowing it would need
 * `Lectures.defaultPopulate` — a global change for a local saving.
 *
 * `title` is localized, so it resolves against the request's locale. That is
 * what makes {@link shapeLecture}'s `userChoices[].title` locale-correct without
 * the endpoint passing `locale` explicitly.
 */
export const LECTURE_FEED_POPULATE = {
  'user-choices': { title: true },
} satisfies PopulateType

/**
 * Flat, playback-ready shape for a lecture returned from /api/lectures/for-audience
 * and /api/meditations/:id/related-lectures.
 *
 * Every record carries the same shape — no excerpt-vs-full branching at the
 * response layer. A record that defines `startTime`/`stopTime` represents a
 * playback window; if `stopTime` is `null`/absent, defaults are derived from
 * the source `metadata.duration`. For clips, the source is the parent lecture's
 * metadata, not the clip's own (clips have `metadata: null`). `fullLectureId`
 * is informational — populated for clips, `null` for full lectures.
 *
 * `title` is nullable (localized + hook-populated). `stopTime` and `duration`
 * may be `null` when neither an explicit value nor `metadata.duration` is
 * available.
 *
 * `userChoices` carries this lecture's own user-choice membership, so a consumer
 * that SSR-loads the feed once can render filter pills and match each card to
 * them client-side without a second query (#526). It is always an array — a
 * lecture with none returns `[]`, never `null`.
 */
export type LecturePlayerData = {
  id: number
  title: string | null | undefined
  hlsUrl: string
  thumbnailUrl: string | null
  subtitles: Record<string, string>
  startTime: number
  stopTime: number | null
  duration: number | null
  fullLectureId: number | null
  userChoices: LectureUserChoice[]
}

/**
 * One user-choice a lecture belongs to, as returned in {@link LecturePlayerData}.
 *
 * `title` is the localized title for the request's locale, and is `null` when
 * the relationship came back unpopulated — see {@link shapeUserChoices}.
 */
export type LectureUserChoice = {
  id: number
  title: string | null
}

/**
 * Merge per-locale subtitle overrides on top of the lecture's NV-sourced
 * subtitle map. The base map is the baseline; each non-empty override row
 * replaces the URL for one locale.
 */
export function mergeSubtitles(
  baseMap: Record<string, string> | null | undefined,
  overrides: Lecture['subtitles'] | null | undefined,
): Record<string, string> {
  const merged: Record<string, string> = { ...(baseMap ?? {}) }
  if (!Array.isArray(overrides)) return merged
  for (const row of overrides) {
    if (row?.locale && row?.url) {
      merged[row.locale] = row.url
    }
  }
  return merged
}

/**
 * Shape a lecture's `userChoices` relationship into the feed's `{ id, title }`
 * rows, in the order the lecture stores them.
 *
 * A `hasMany` relationship comes back as ids at depth 0 and as documents at
 * depth ≥ 1, and both endpoints that build `LecturePlayerData` read at depth 2.
 * An id is still handled rather than dropped: a caller reading at a lower depth
 * gets the membership it needs for filtering, with `title: null` saying the
 * label was not populated. Dropping the row instead would report the lecture as
 * belonging to no user-choice at all, which reads as data rather than as a
 * missing join.
 */
export function shapeUserChoices(
  userChoices: Lecture['userChoices'],
): LectureUserChoice[] {
  if (!Array.isArray(userChoices)) return []
  return userChoices.flatMap((choice) => {
    if (typeof choice === 'number') return [{ id: choice, title: null }]
    // Payload cannot hand back a hole here — `relationshipPopulationPromise`
    // filters nulls out of a hasMany array. This guard is for a hand-built
    // caller: `{ id: undefined }` would serialize to a row missing the `id` the
    // OpenAPI schema marks required, which is worse than dropping it.
    if (!choice || typeof choice !== 'object') return []
    return [{ id: choice.id, title: choice.title ?? null }]
  })
}

/**
 * Resolve the `fullLectureId` for a clip, gated on audience eligibility.
 *
 * When `eligibleAudienceIds` is `null` (no gating), returns the parent ID
 * unconditionally (backward-compatible). When provided, returns the parent ID
 * only if the parent's audiences intersect `eligibleAudienceIds`; otherwise
 * returns `null` to avoid leaking the existence of a restricted parent.
 */
function resolveFullLectureId(
  parent: Lecture | null,
  eligibleAudienceIds: number[] | null,
): number | null {
  if (!parent) return null
  if (eligibleAudienceIds === null) return parent.id
  const parentAudienceIds = ((parent.audiences ?? []) as Array<number | { id: number }>).map((a) =>
    typeof a === 'number' ? a : a.id,
  )
  return eligibleAudienceIds.some((id) => parentAudienceIds.includes(id)) ? parent.id : null
}

/**
 * Shape a Lecture record into a `LecturePlayerData` for the audience-facing
 * endpoints. For clips, sources NV `metadata` from the parent lecture (clips
 * have `metadata: null` after #338 — the parent owns the canonical NV data).
 *
 * Per-clip `thumbnail` and `subtitles` overrides still win/merge as before.
 *
 * Returns `null` when no usable `metadata.hlsUrl` is available (full lecture
 * with missing metadata, or clip whose parent isn't populated / missing
 * metadata) — the endpoint filters these out.
 *
 * Requires `depth ≥ 2` on the lecture query so a clip's `fullLecture` is
 * populated as a `Lecture` object rather than a numeric id.
 *
 * @param eligibleAudienceIds - When provided, gates `fullLectureId` on
 *   parent-audience intersection (#341). Pass `null` for no gating (default,
 *   backward-compatible).
 */
export function shapeLecture(
  lecture: Lecture,
  logger?: Pick<PayloadLogger, 'warn'>,
  eligibleAudienceIds: number[] | null = null,
): LecturePlayerData | null {
  const isClip = lecture.type === 'clip'
  const parent =
    isClip && lecture.fullLecture && typeof lecture.fullLecture === 'object'
      ? (lecture.fullLecture as Lecture)
      : null
  const metadataSource = isClip ? parent : lecture
  const metadata = (metadataSource?.metadata ?? null) as LectureMetadata | null

  if (!metadata?.hlsUrl) {
    logger?.warn({
      msg: 'Lecture missing metadata.hlsUrl — skipping',
      lectureId: lecture.id,
      isClip,
      parentId: parent?.id,
    })
    return null
  }

  const startTime = typeof lecture.startTime === 'number' ? lecture.startTime : 0
  const stopTime =
    typeof lecture.stopTime === 'number' ? lecture.stopTime : (metadata.duration ?? null)
  const duration = stopTime !== null ? stopTime - startTime : null

  return {
    id: lecture.id,
    title: lecture.title,
    hlsUrl: metadata.hlsUrl,
    thumbnailUrl: resolveThumbnailUrl({
      override: lecture.thumbnail,
      fallback: metadata.thumbnailUrl,
    }),
    subtitles: mergeSubtitles(metadata.subtitles, lecture.subtitles),
    startTime,
    stopTime,
    duration,
    fullLectureId: isClip ? resolveFullLectureId(parent, eligibleAudienceIds) : null,
    // The clip's own memberships, never the parent's. A clip is assigned to a
    // user-choice independently, and inheriting the parent's would report a
    // membership an editor never set.
    userChoices: shapeUserChoices(lecture.userChoices),
  }
}
