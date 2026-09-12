import type { Id, SmokeDoc } from './_helpers/fixtures'

import { expectOk } from './_helpers/fixtures'
import { runId } from './_helpers/runId'
import { expect, test } from './_helpers/smokeTest'

type LectureDoc = SmokeDoc & {
  type: 'full' | 'clip'
  fullLecture?: Id | { id: Id } | null
  nirmalVidyaVimeoUrl?: string | null
}

/**
 * The lecture this spec builds its parent from.
 *
 * **Take the ID from production, never from `seeds/wemeditate/data.json`.**
 * The seed file's `vimeo_id` values are the videos WeMeditate embedded in page
 * content, and NV's catalogue is Shri Mataji's lectures — the two overlap only
 * by accident. `importLectures` says so itself, isolating a per-video NV 404 so
 * one absent video cannot kill the batch. A seed ID picked as if it were a
 * lecture is what made this spec's first CI run red: NV answered 404 for
 * `354365984`, a domain-restricted video Vimeo will not even describe over
 * oEmbed.
 *
 * Every full lecture in production was created through this same hook, so its
 * URL is one NV served. `393387855` is the most recent (id 162, synced
 * 2026-05-29), and Vimeo's own oEmbed returns the title and duration
 * production stored, so the video is public and unchanged.
 *
 * Two unkeyed checks are worth running before you blame the service, since
 * `mapi.nirmalavidya.org` answers 401 to every keyed-route request:
 *
 * - `GET /api/v2/videos/vimeo/<id>/hls` returning **401** proves the route
 *   still exists — auth runs after routing there, and a route NV has dropped
 *   returns 404 unkeyed. A 404 reaching the hook is therefore about the video,
 *   not the API version.
 * - `GET https://vimeo.com/api/oembed.json?url=<url>` returning a title and
 *   duration proves the video is public. A `domain_status_code` instead means
 *   it is restricted, which is what an NV lecture never is.
 *
 * Override with `SMOKE_LECTURE_VIMEO_URL` when NV stops serving this one. Any
 * lecture NV still knows will do: nothing else in the spec depends on which.
 */
const LECTURE_VIMEO_URL = process.env.SMOKE_LECTURE_VIMEO_URL ?? 'https://vimeo.com/393387855'

/**
 * Why a clip create can fail for a reason that is not this repo's.
 *
 * A preview forks no data, so the spec has to build its own parent full
 * lecture, and `populateFromNirmalaVidya` fetches `mapi.nirmalavidya.org` on
 * every full-lecture create with no bypass
 * (`src/lib/lectures/nirmalaVidyaApi.ts`). That third party is therefore in the
 * lane's critical path by decision, not by accident — and the failure it
 * produces must not read as a Lectures regression.
 *
 * The hook wraps every upstream failure as a ValidationError reading
 * `Could not fetch lecture data from Nirmala Vidya: …`, and reports a missing
 * key as `NIRMALA_VIDYA_API_KEY is not configured`. Both name the service,
 * which is what this matches on.
 */
function explainCreateFailure(status: number, body: string): string {
  if (!body.includes('Nirmala Vidya') && !body.includes('NIRMALA_VIDYA_API_KEY')) {
    return `Creating the lecture clip failed: ${status} ${body}`
  }
  return [
    `The Nirmala Vidya API did not answer for ${LECTURE_VIMEO_URL}, so the clip's parent full`,
    'lecture could not be created. This is an upstream failure, not a Lectures regression.',
    '',
    'Check, in order: mapi.nirmalavidya.org is up; NIRMALA_VIDYA_API_KEY is set on the preview',
    'service; NV still serves this video. The two unkeyed probes above LECTURE_VIMEO_URL tell',
    'those three apart. Point the spec at another production lecture with',
    'SMOKE_LECTURE_VIMEO_URL if the last one is what changed.',
    '',
    `Response: ${status} ${body}`,
  ].join('\n')
}

test('create, update, and delete a Lecture clip against preview', async ({
  request,
  headers,
  trash,
}, testInfo) => {
  const clipTitle = `smoke-${runId()}-lecture-clip-r${testInfo.retry}`

  // `LECTURE_VIMEO_URL` is the one key in this lane that `runId()` cannot
  // namespace, and `resolveClipParent` is get-or-create. Ask first, so the bin
  // only ever holds records this run made.
  const parentQuery =
    `/api/lectures?depth=0&limit=1&where[type][equals]=full` +
    `&where[nirmalVidyaVimeoUrl][equals]=${encodeURIComponent(LECTURE_VIMEO_URL)}`
  const existingRes = await request.get(parentQuery, { headers })
  await expectOk(existingRes, 'lecture parent lookup')
  const { docs: existing } = (await existingRes.json()) as { docs: SmokeDoc[] }
  const adoptedParentId = existing[0]?.id

  // One create covers both hooks: `resolveClipParent` resolves the parent from
  // the URL (creating it when missing, which is where NV is called) and nulls
  // the URL on the clip.
  const createRes = await request.post('/api/lectures', {
    headers,
    data: {
      type: 'clip',
      nirmalVidyaVimeoUrl: LECTURE_VIMEO_URL,
      title: clipTitle,
      startTime: 0,
      stopTime: 30,
    },
  })
  if (!createRes.ok()) {
    throw new Error(explainCreateFailure(createRes.status(), await createRes.text()))
  }

  const created = (await createRes.json()) as { doc: LectureDoc }
  expect(created.doc.type).toBe('clip')

  const parent = created.doc.fullLecture
  const parentId = typeof parent === 'object' && parent !== null ? parent.id : parent
  if (parentId == null) {
    throw new Error('the clip should have had a parent resolved from its Vimeo URL')
  }
  expect(created.doc.nirmalVidyaVimeoUrl ?? null).toBeNull()

  // Parent first, so the bin empties newest-first: clip, then parent. A parent
  // that predates this run is left where it was found.
  if (adoptedParentId === undefined) trash.track('lectures', parentId)
  const id = trash.track('lectures', created.doc.id)

  const updateRes = await request.patch(`/api/lectures/${id}`, {
    headers,
    data: { startTime: 5 },
  })
  await expectOk(updateRes, 'lecture clip update')

  const deleteRes = await request.delete(`/api/lectures/${id}`, { headers })
  await expectOk(deleteRes, 'lecture clip delete')

  const after = await request.get(`/api/lectures/${id}`, { headers })
  expect(after.status()).toBe(404)
})
